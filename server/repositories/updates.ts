import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now } from "./helpers";

/**
 * Telegram update deduplication. The bot calls `/api/bot/updates/claim` before
 * processing an update; this atomically records it and reports duplicates.
 */

export const updatesRepo = (db: Database = getDb()) => ({
  /**
   * Attempt to claim an update_id. Returns `false` if it was already claimed
   * (duplicate), `true` if this call claimed it.
   */
  claim(updateId: number): boolean {
    const ts = now();
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO telegram_updates (update_id, received_at, status)
         VALUES (?, ?, 'claimed')`,
      )
      .run(updateId, ts);
    return result.changes > 0;
  },

  markDone(updateId: number): void {
    db.prepare(
      `UPDATE telegram_updates SET processed_at = ?, status = 'done' WHERE update_id = ?`,
    ).run(now(), updateId);
  },

  markFailed(updateId: number): void {
    db.prepare(
      `UPDATE telegram_updates SET processed_at = ?, status = 'failed' WHERE update_id = ?`,
    ).run(now(), updateId);
  },
});

export type UpdatesRepo = ReturnType<typeof updatesRepo>;
