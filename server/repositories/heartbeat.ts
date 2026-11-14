import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now } from "./helpers";

export interface Heartbeat {
  last_seen_at: string;
  version: string | null;
}

export const heartbeatRepo = (db: Database = getDb()) => ({
  /** Update (upsert) the bot heartbeat row with the current time. */
  beat(version?: string | null): void {
    const ts = now();
    db.prepare(
      `INSERT INTO bot_heartbeat (id, last_seen_at, version)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, version = excluded.version`,
    ).run(ts, version ?? null);
  },

  get(): Heartbeat | null {
    const row = db
      .prepare("SELECT last_seen_at, version FROM bot_heartbeat WHERE id = 1")
      .get() as { last_seen_at: string; version: string | null } | undefined;
    if (!row) return null;
    return { last_seen_at: row.last_seen_at, version: row.version };
  },

  /** Seconds since last heartbeat, or null if the bot never reported. */
  ageSeconds(thresholdMs = 90_000): { online: boolean; ageSeconds: number | null } {
    const hb = this.get();
    if (!hb) return { online: false, ageSeconds: null };
    const ageMs = Date.now() - new Date(hb.last_seen_at).getTime();
    return {
      online: ageMs <= thresholdMs,
      ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
    };
  },
});

export type HeartbeatRepo = ReturnType<typeof heartbeatRepo>;
