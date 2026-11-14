import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now, paginate, type Paginated } from "./helpers";

export type ReplyStatus = "queued" | "sent" | "failed";

export interface Reply {
  id: number;
  user_id: number;
  suggestion_id: number | null;
  admin_id: string;
  text: string;
  status: ReplyStatus;
  telegram_message_id: number | null;
  error: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
  // joined
  admin_username: string;
  admin_display_name: string;
}

export interface CreateReplyInput {
  user_id: number;
  suggestion_id?: number | null;
  admin_id: string;
  text: string;
}

function rowToReply(row: Record<string, unknown>): Reply {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    suggestion_id: (row.suggestion_id as number | null) ?? null,
    admin_id: String(row.admin_id),
    text: String(row.text),
    status: row.status as ReplyStatus,
    telegram_message_id: (row.telegram_message_id as number | null) ?? null,
    error: (row.error as string | null) ?? null,
    attempts: Number(row.attempts),
    created_at: String(row.created_at),
    sent_at: (row.sent_at as string | null) ?? null,
    admin_username: String(row.admin_username ?? ""),
    admin_display_name: String(row.admin_display_name ?? ""),
  };
}

const BASE_COLUMNS = `
  r.id, r.user_id, r.suggestion_id, r.admin_id, r.text, r.status,
  r.telegram_message_id, r.error, r.attempts, r.created_at, r.sent_at,
  a.username AS admin_username, a.display_name AS admin_display_name
`;

export const repliesRepo = (db: Database = getDb()) => ({
  byId(id: number): Reply | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM replies r JOIN admins a ON a.id = r.admin_id
         WHERE r.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToReply(row) : null;
  },

  create(input: CreateReplyInput): Reply {
    const result = db
      .prepare(
        `INSERT INTO replies (user_id, suggestion_id, admin_id, text, status, attempts, created_at)
         VALUES (@user_id, @suggestion_id, @admin_id, @text, 'queued', 0, @ts)`,
      )
      .run({
        user_id: input.user_id,
        suggestion_id: input.suggestion_id ?? null,
        admin_id: input.admin_id,
        text: input.text,
        ts: now(),
      });
    return this.byId(Number(result.lastInsertRowid))!;
  },

  /** Mark as sent with Telegram message id, or failed with error. */
  setStatus(
    id: number,
    status: ReplyStatus,
    opts: { telegram_message_id?: number; error?: string | null } = {},
  ): void {
    if (status === "sent") {
      db.prepare(
        `UPDATE replies SET status = 'sent', telegram_message_id = ?, sent_at = ?, attempts = attempts + 1, error = NULL WHERE id = ?`,
      ).run(opts.telegram_message_id ?? null, now(), id);
    } else if (status === "failed") {
      db.prepare(
        `UPDATE replies SET status = 'failed', error = ?, attempts = attempts + 1 WHERE id = ?`,
      ).run(opts.error ?? null, id);
    }
  },

  listByUser(userId: number, page: number, pageSize: number): Paginated<Reply> {
    const total = (
      db.prepare("SELECT COUNT(*) AS c FROM replies WHERE user_id = ?").get(userId) as {
        c: number;
      }
    ).c;
    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM replies r JOIN admins a ON a.id = r.admin_id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(userId, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    return paginate(rows.map(rowToReply), total, page, pageSize);
  },
});

export type RepliesRepo = ReturnType<typeof repliesRepo>;
