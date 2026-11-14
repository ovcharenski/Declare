import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now } from "./helpers";

export type OutboxStatus = "pending" | "sending" | "sent" | "failed";
export type OutboxKind = "reply" | "warning" | "ban" | "unban" | "system";

export interface OutboxMessage {
  id: number;
  user_id: number;
  reply_id: number | null;
  kind: OutboxKind;
  text: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  telegram_message_id: number | null;
  created_at: string;
  updated_at: string;
}

function rowToMessage(row: Record<string, unknown>): OutboxMessage {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    reply_id: (row.reply_id as number | null) ?? null,
    kind: row.kind as OutboxKind,
    text: String(row.text),
    status: row.status as OutboxStatus,
    attempts: Number(row.attempts),
    next_attempt_at: String(row.next_attempt_at),
    last_error: (row.last_error as string | null) ?? null,
    telegram_message_id: (row.telegram_message_id as number | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const COLUMNS = `
  id, user_id, reply_id, kind, text, status, attempts, next_attempt_at,
  last_error, telegram_message_id, created_at, updated_at
`;

export const outboxRepo = (db: Database = getDb()) => ({
  byId(id: number): OutboxMessage | null {
    const row = db.prepare(`SELECT ${COLUMNS} FROM outbox_messages WHERE id = ?`).get(id);
    return row ? rowToMessage(row as Record<string, unknown>) : null;
  },

  create(input: {
    user_id: number;
    reply_id?: number | null;
    kind: OutboxKind;
    text: string;
  }): OutboxMessage {
    const ts = now();
    const result = db
      .prepare(
        `INSERT INTO outbox_messages
           (user_id, reply_id, kind, text, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      )
      .run(input.user_id, input.reply_id ?? null, input.kind, input.text, ts, ts, ts);
    return this.byId(Number(result.lastInsertRowid))!;
  },

  /** Messages due for sending (pending, next_attempt_at <= now), oldest first. */
  due(limit = 20): OutboxMessage[] {
    const rows = db
      .prepare(
        `SELECT ${COLUMNS} FROM outbox_messages
         WHERE status = 'pending' AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC, id ASC
         LIMIT ?`,
      )
      .all(now(), limit) as Record<string, unknown>[];
    return rows.map(rowToMessage);
  },

  /** Atomically claim a pending message for sending (guards against races). */
  claim(id: number): OutboxMessage | null {
    const ts = now();
    const result = db
      .prepare(
        `UPDATE outbox_messages SET status = 'sending', updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(ts, id);
    if (result.changes === 0) return null;
    return this.byId(id);
  },

  markSent(id: number, telegramMessageId: number): void {
    db.prepare(
      `UPDATE outbox_messages SET
         status = 'sent', telegram_message_id = ?, last_error = NULL,
         attempts = attempts + 1, updated_at = ?
       WHERE id = ?`,
    ).run(telegramMessageId, now(), id);
  },

  /** Schedule a retry with backoff, or mark failed after max attempts. */
  markFailed(id: number, error: string, maxAttempts = 5): void {
    const current = this.byId(id);
    if (!current) return;

    const attempts = current.attempts + 1;
    const ts = now();

    if (attempts >= maxAttempts) {
      db.prepare(
        `UPDATE outbox_messages SET
           status = 'failed', last_error = ?, attempts = ?, updated_at = ?
         WHERE id = ?`,
      ).run(error, attempts, ts, id);
    } else {
      const delaysMs = [60_000, 300_000, 900_000, 3_600_000, 21_600_000]; // 1m,5m,15m,1h,6h
      const delay = delaysMs[Math.min(attempts - 1, delaysMs.length - 1)];
      const nextAttempt = new Date(Date.now() + delay).toISOString();
      db.prepare(
        `UPDATE outbox_messages SET
           status = 'pending', last_error = ?, attempts = ?, next_attempt_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(error, attempts, nextAttempt, ts, id);
    }
  },

  /** Manual retry of a failed message. */
  retry(id: number): OutboxMessage | null {
    db.prepare(
      `UPDATE outbox_messages SET status = 'pending', next_attempt_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ? AND status = 'failed'`,
    ).run(now(), now(), id);
    return this.byId(id);
  },

  /** Link a reply row to an outbox message (both directions). */
  linkReply(id: number, replyId: number): void {
    db.prepare("UPDATE outbox_messages SET reply_id = ? WHERE id = ?").run(replyId, id);
  },
});

export type OutboxRepo = ReturnType<typeof outboxRepo>;
