/**
 * In-memory FSM session store for the bot (plan §10). State lives only in the
 * bot process and expires after 15 minutes of inactivity; a restart cancels
 * unfinished drafts. This is intentionally not persisted.
 */

export type BotState =
  | "idle"
  | "awaiting_content"
  | "awaiting_tag";

export interface DraftMedia {
  kind: "photo" | "video";
  fileId: string;
  fileUniqueId: string | null;
  width?: number;
  height?: number;
  durationSec?: number;
  sizeBytes?: number;
  mimeType?: string;
}

export interface Draft {
  state: BotState;
  /** Captured text (message text or media caption). */
  text: string | null;
  /** Media captured from the content message. */
  media: DraftMedia[];
  /** Telegram message id of the content message (for idempotency key). */
  contentMessageId: number | null;
  /** Current tag-picker page (0-based). */
  tagPage: number;
  /** Last activity timestamp (ms). */
  lastActiveAt: number;
}

const TTL_MS = 15 * 60 * 1000;

const sessions = new Map<number, Draft>();

function now(): number {
  return Date.now();
}

export function getSession(chatId: number): Draft {
  const existing = sessions.get(chatId);
  if (existing && now() - existing.lastActiveAt <= TTL_MS) {
    existing.lastActiveAt = now();
    return existing;
  }
  const fresh: Draft = {
    state: "idle",
    text: null,
    media: [],
    contentMessageId: null,
    tagPage: 0,
    lastActiveAt: now(),
  };
  sessions.set(chatId, fresh);
  return fresh;
}

export function updateSession(chatId: number, patch: Partial<Draft>): Draft {
  const session = getSession(chatId);
  Object.assign(session, patch, { lastActiveAt: now() });
  sessions.set(chatId, session);
  return session;
}

export function clearSession(chatId: number): void {
  sessions.delete(chatId);
}

/** Drop expired sessions (called periodically to bound memory). */
export function sweepSessions(): number {
  const cutoff = now() - TTL_MS;
  let removed = 0;
  for (const [chatId, session] of sessions) {
    if (session.lastActiveAt <= cutoff) {
      sessions.delete(chatId);
      removed++;
    }
  }
  return removed;
}
