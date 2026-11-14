import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now, paginate, type Paginated } from "./helpers";

export type BanStatus = "active" | "expired" | "lifted";

export interface Ban {
  id: number;
  user_id: number;
  admin_id: string;
  reason: string;
  starts_at: string;
  ends_at: string | null; // null = permanent
  lifted_at: string | null;
  lifted_by: string | null;
  created_at: string;
  // joined
  admin_username: string;
  admin_display_name: string;
  // computed
  status: BanStatus;
}

function computeStatus(ban: Omit<Ban, "status">, nowIso: string): BanStatus {
  if (ban.lifted_at !== null) return "lifted";
  if (ban.ends_at !== null && ban.ends_at <= nowIso) return "expired";
  return "active";
}

function rowToBan(row: Record<string, unknown>): Ban {
  const base = {
    id: Number(row.id),
    user_id: Number(row.user_id),
    admin_id: String(row.admin_id),
    reason: String(row.reason),
    starts_at: String(row.starts_at),
    ends_at: (row.ends_at as string | null) ?? null,
    lifted_at: (row.lifted_at as string | null) ?? null,
    lifted_by: (row.lifted_by as string | null) ?? null,
    created_at: String(row.created_at),
    admin_username: String(row.admin_username ?? ""),
    admin_display_name: String(row.admin_display_name ?? ""),
  };
  return { ...base, status: computeStatus(base, now()) };
}

const BASE_COLUMNS = `
  b.id, b.user_id, b.admin_id, b.reason, b.starts_at, b.ends_at,
  b.lifted_at, b.lifted_by, b.created_at,
  a.username AS admin_username, a.display_name AS admin_display_name
`;

export const bansRepo = (db: Database = getDb()) => ({
  byId(id: number): Ban | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS} FROM bans b JOIN admins a ON a.id = b.admin_id WHERE b.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToBan(row) : null;
  },

  /** The currently active ban for a user, if any. */
  activeBan(userId: number): Ban | null {
    const ts = now();
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM bans b JOIN admins a ON a.id = b.admin_id
         WHERE b.user_id = ?
           AND b.lifted_at IS NULL
           AND (b.ends_at IS NULL OR b.ends_at > ?)
         ORDER BY b.starts_at DESC LIMIT 1`,
      )
      .get(userId, ts) as Record<string, unknown> | undefined;
    return row ? rowToBan(row) : null;
  },

  create(input: {
    user_id: number;
    admin_id: string;
    reason: string;
    ends_at?: string | null;
  }): Ban {
    const result = db
      .prepare(
        `INSERT INTO bans (user_id, admin_id, reason, starts_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.user_id, input.admin_id, input.reason, now(), input.ends_at ?? null, now());
    return this.byId(Number(result.lastInsertRowid))!;
  },

  lift(id: number, liftedBy: string): Ban | null {
    db.prepare(
      `UPDATE bans SET lifted_at = ?, lifted_by = ? WHERE id = ? AND lifted_at IS NULL`,
    ).run(now(), liftedBy, id);
    return this.byId(id);
  },

  listByUser(userId: number, page: number, pageSize: number): Paginated<Ban> {
    const total = (
      db.prepare("SELECT COUNT(*) AS c FROM bans WHERE user_id = ?").get(userId) as {
        c: number;
      }
    ).c;
    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM bans b JOIN admins a ON a.id = b.admin_id
         WHERE b.user_id = ?
         ORDER BY b.starts_at DESC, b.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(userId, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    return paginate(rows.map(rowToBan), total, page, pageSize);
  },
});

export type BansRepo = ReturnType<typeof bansRepo>;
