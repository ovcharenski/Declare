import type { Express } from "express";
import { requireBotToken } from "../../http/requireBotToken";
import { asyncHandler } from "../../http/errors";
import { validateBody } from "../../http/validate";
import {
  claimUpdateSchema,
  syncUserSchema,
  heartbeatSchema,
  botCreateSuggestionSchema,
} from "../../../shared/bot";
import {
  updatesRepo,
  usersRepo,
  tagsRepo,
  heartbeatRepo,
} from "../../repositories";
import { intakeSuggestion } from "./intake";
import packageJson from "../../../package.json";

/**
 * Internal bot API (plan §11 "Bot (внутренние)"). All routes require the
 * service token. The bot process has no direct DB access — only these calls.
 */
export function registerBotRoutes(app: Express): void {
  // Deduplicate an incoming Telegram update before processing.
  app.post(
    "/api/bot/updates/claim",
    requireBotToken,
    asyncHandler(async (req, res) => {
      const { updateId } = validateBody(req, claimUpdateSchema);
      const claimed = updatesRepo().claim(updateId);
      res.json({ duplicate: !claimed });
    }),
  );

  // Upsert a Telegram user and report ban status.
  app.post(
    "/api/bot/users/sync",
    requireBotToken,
    asyncHandler(async (req, res) => {
      const input = validateBody(req, syncUserSchema);
      const user = usersRepo().upsert({
        telegram_id: input.telegramId,
        username: input.username ?? null,
        first_name: input.firstName,
        last_name: input.lastName ?? null,
        language_code: input.languageCode ?? null,
      });

      res.json({
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          languageCode: user.language_code,
        },
        banned: user.has_active_ban,
        ban: user.has_active_ban
          ? {
              // active_ban_ends_at is null for permanent bans.
              reason: "",
              endsAt: user.active_ban_ends_at,
            }
          : null,
      });
    }),
  );

  // Active tags for the tag-picker keyboard.
  app.get(
    "/api/bot/tags",
    requireBotToken,
    asyncHandler(async (_req, res) => {
      const tags = tagsRepo().list(false);
      res.json({ tags: tags.map((t) => ({ id: t.id, name: t.name })) });
    }),
  );

  // Save a suggestion (idempotent, rate-limited, ban-checked).
  app.post(
    "/api/bot/suggestions",
    requireBotToken,
    asyncHandler(async (req, res) => {
      const input = validateBody(req, botCreateSuggestionSchema);

      const result = intakeSuggestion({
        telegramId: input.telegramId,
        tagId: input.tagId,
        type: input.type,
        text: input.text ?? null,
        idempotencyKey: input.idempotencyKey,
        telegramMessageId: input.telegramMessageId ?? null,
        media: (input.media ?? []).map((m) => ({
          kind: m.kind,
          fileId: m.fileId,
          fileUniqueId: m.fileUniqueId ?? null,
          width: m.width,
          height: m.height,
          durationSec: m.durationSec,
          sizeBytes: m.sizeBytes,
          mimeType: m.mimeType,
        })),
      });

      if (!result.ok) {
        const { error } = result;
        res.status(statusFor(error.code)).json({
          error: {
            code: error.code,
            message: error.message,
            ...(error.retryAfterSec !== undefined
              ? { retryAfterSec: error.retryAfterSec }
              : {}),
            ...(error.banEndsAt !== undefined ? { banEndsAt: error.banEndsAt } : {}),
          },
        });
        return;
      }

      res.json({
        suggestion: {
          id: result.value.suggestionId,
          status: "new",
          dedupeKey: result.value.dedupeKey,
        },
        alreadyExists: result.value.alreadyExists,
      });
    }),
  );

  // Heartbeat: mark the bot alive (dashboard online/offline, §10).
  app.post(
    "/api/bot/heartbeat",
    requireBotToken,
    asyncHandler(async (req, res) => {
      const input = validateBody(req, heartbeatSchema);
      heartbeatRepo().beat(input.version ?? packageJson.version ?? null);
      res.json({ ok: true });
    }),
  );
}

function statusFor(code: string): number {
  switch (code) {
    case "BOT_DISABLED":
      return 503;
    case "USER_BANNED":
      return 403;
    case "RATE_LIMIT":
      return 429;
    case "DUPLICATE":
      return 409;
    case "INVALID_TAG":
    case "EMPTY":
      return 400;
    default:
      return 400;
  }
}

