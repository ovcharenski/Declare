import { getDb } from "../../db/connection";
import type { Database } from "better-sqlite3";
import {
  usersRepo,
  tagsRepo,
  suggestionsRepo,
  attachmentsRepo,
  settingsRepo,
  bansRepo,
  type SuggestionType,
} from "../../repositories";
import { downloadMedia } from "../../telegram/media";
import { logger } from "../../logger";

/**
 * Suggestion intake — the business logic behind POST /api/bot/suggestions
 * (plan §9, §10). Enforces bot-enabled, ban, interval/hour/day limits and
 * duplicate detection before persisting, and downloads media synchronously.
 *
 * Everything runs against the live DB; settings are re-read on each call so
 * admin changes apply immediately.
 */

export type SuggestionRejectReason =
  | "BOT_DISABLED"
  | "USER_BANNED"
  | "RATE_LIMIT"
  | "DUPLICATE"
  | "INVALID_TAG"
  | "EMPTY";

export interface SuggestionReject {
  code: SuggestionRejectReason;
  message: string;
  /** Seconds to wait before retrying (for RATE_LIMIT). */
  retryAfterSec?: number;
  /** Ban end date (for USER_BANNED). */
  banEndsAt?: string | null;
}

export interface IntakeMedia {
  kind: "photo" | "video";
  fileId: string;
  fileUniqueId?: string | null;
  width?: number;
  height?: number;
  durationSec?: number;
  sizeBytes?: number;
  mimeType?: string;
}

export interface IntakeInput {
  telegramId: number;
  tagId: number;
  type: SuggestionType;
  text?: string | null;
  idempotencyKey: string;
  telegramMessageId?: number | null;
  media?: IntakeMedia[];
}

export interface IntakeSuccess {
  suggestionId: number;
  alreadyExists: boolean;
  dedupeKey: string;
}

export type IntakeResult =
  | { ok: true; value: IntakeSuccess }
  | { ok: false; error: SuggestionReject };

/**
 * Process a suggestion submission end-to-end. Idempotent: repeated calls with
 * the same `idempotencyKey` return the existing suggestion without creating a
 * duplicate.
 */
export function intakeSuggestion(input: IntakeInput): IntakeResult {
  const db = getDb();

  // 1. Idempotency: an existing dedupe key means we already handled this
  //    message (double send / callback retry). Return the existing record.
  const existing = suggestionsRepo(db).byDedupeKey(input.idempotencyKey);
  if (existing) {
    return {
      ok: true,
      value: {
        suggestionId: existing.id,
        alreadyExists: true,
        dedupeKey: existing.dedupe_key,
      },
    };
  }

  // 2. Bot toggle.
  const settings = settingsRepo(db).get();
  if (settings.bot_enabled !== 1) {
    return { ok: false, error: { code: "BOT_DISABLED", message: "Bot is disabled" } };
  }

  // 3. User must exist (bot syncs first) and not be banned.
  const user = usersRepo(db).byTelegramId(input.telegramId);
  if (!user) {
    return { ok: false, error: { code: "EMPTY", message: "Unknown user" } };
  }
  const ban = bansRepo(db).activeBan(user.id);
  if (ban) {
    return {
      ok: false,
      error: {
        code: "USER_BANNED",
        message: ban.reason,
        banEndsAt: ban.ends_at,
      },
    };
  }

  // 4. Content must be non-empty.
  const hasText = !!input.text && input.text.trim().length > 0;
  const hasMedia = !!input.media && input.media.length > 0;
  if (!hasText && !hasMedia) {
    return { ok: false, error: { code: "EMPTY", message: "Empty suggestion" } };
  }

  // 5. Tag must exist and be active.
  const tag = tagsRepo(db).byId(input.tagId);
  if (!tag || !tag.is_active || tag.archived_at) {
    return { ok: false, error: { code: "INVALID_TAG", message: "Tag not available" } };
  }

  // 6. Rate limits from app_settings (0 disables a limit).
  const minInterval = limitMinInterval(db, user.id, settings.min_interval_seconds);
  if (minInterval) {
    return { ok: false, error: minInterval };
  }

  const hourly = limitCount(db, user.id, settings.suggestions_per_hour, "hour");
  if (hourly) return { ok: false, error: hourly };

  const daily = limitCount(db, user.id, settings.suggestions_per_day, "day");
  if (daily) return { ok: false, error: daily };

  // 7. Duplicate detection within the configured window.
  const dup = detectDuplicate(db, user.id, input.text, settings.duplicate_window_minutes);
  if (dup) return { ok: false, error: dup };

  // 8. Persist (suggestion + attachments + media download) atomically where
  //    possible; media download itself is I/O and can't be inside the SQLite
  //    transaction, so we write the suggestion + attachment rows first, then
  //    download and update attachment status.
  const created = suggestionsRepo(db).create({
    user_id: user.id,
    tag_id: input.tagId,
    type: input.type,
    text: input.text?.trim() || null,
    dedupe_key: input.idempotencyKey,
    telegram_message_id: input.telegramMessageId ?? null,
  });

  // Touch user activity.
  usersRepo(db).touch(user.id);

  for (const media of input.media ?? []) {
    const attachmentId = attachmentsRepo(db).create({
      suggestion_id: created.id,
      kind: media.kind,
      telegram_file_id: media.fileId,
      telegram_file_unique_id: media.fileUniqueId ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      duration_sec: media.durationSec ?? null,
      size_bytes: media.sizeBytes ?? null,
      mime_type: media.mimeType ?? null,
      download_status: "pending",
    });

    // Synchronous download (per stage-3 decision). Any failure is recorded on
    // the attachment so the admin can retry later.
    downloadMedia(media.fileId, created.id)
      .then((result) => {
        attachmentsRepo(db).updateDownload(attachmentId, {
          download_status: result.error ? "failed" : "ready",
          file_path: result.filePath,
          mime_type: result.mimeType,
          size_bytes: result.sizeBytes,
          download_error: result.error,
        });
      })
      .catch((err) => {
        logger.error("media: unexpected download error", { error: String(err) });
        attachmentsRepo(db).updateDownload(attachmentId, {
          download_status: "failed",
          download_error: String(err),
        });
      });
  }

  return {
    ok: true,
    value: {
      suggestionId: created.id,
      alreadyExists: false,
      dedupeKey: created.dedupe_key,
    },
  };
}

/** Enforce a minimum interval between a user's suggestions. */
function limitMinInterval(
  db: Database,
  userId: number,
  minIntervalSeconds: number,
): SuggestionReject | null {
  if (!minIntervalSeconds || minIntervalSeconds <= 0) return null;

  const last = db
    .prepare(
      "SELECT created_at FROM suggestions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(userId) as { created_at: string } | undefined;

  if (!last) return null;

  const elapsed = Date.now() - new Date(last.created_at).getTime();
  const required = minIntervalSeconds * 1000;
  if (elapsed < required) {
    return {
      code: "RATE_LIMIT",
      message: "Rate limited (min interval)",
      retryAfterSec: Math.ceil((required - elapsed) / 1000),
    };
  }
  return null;
}

/** Enforce a count limit within a rolling window (hour/day). */
function limitCount(
  db: Database,
  userId: number,
  limit: number,
  window: "hour" | "day",
): SuggestionReject | null {
  if (!limit || limit <= 0) return null;

  const windowMs = window === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM suggestions WHERE user_id = ? AND created_at >= ?",
    )
    .get(userId, since) as { c: number };

  if (row.c >= limit) {
    return {
      code: "RATE_LIMIT",
      message: `Rate limited (${window})`,
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }
  return null;
}

/** Detect identical text from the same user within the duplicate window. */
function detectDuplicate(
  db: Database,
  userId: number,
  text: string | null | undefined,
  windowMinutes: number,
): SuggestionReject | null {
  if (!text || !text.trim() || !windowMinutes || windowMinutes <= 0) return null;

  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const normalized = text.trim();

  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM suggestions WHERE user_id = ? AND created_at >= ? AND text = ?",
    )
    .get(userId, since, normalized) as { c: number };

  if (row.c > 0) {
    return { code: "DUPLICATE", message: "Duplicate suggestion" };
  }
  return null;
}
