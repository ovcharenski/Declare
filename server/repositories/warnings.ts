import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now, paginate, type Paginated } from "./helpers";

export interface Warning {
  id: number;
  user_id: number;
  admin_id: string;
  reason: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  // joined
  admin_username: string;
  admin_display_name: string;
}

function rowToWarning(row: Record<string, unknown>): Warning {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    admin_id: String(row.admin_id),
    reason: String(row.reason),
    created_at: String(row.created_at),
    revoked_at: (row.revoked_at as string | null) ?? null,
    revoked_by: (row.revoked_by as string | null) ?? null,
    admin_username: String(row.admin_username ?? ""),
    admin_display_name: String(row.admin_display_name ?? ""),
  };
}

const BASE_COLUMNS = `
  w.id, w.user_id, w.admin_id, w.reason, w.created_at, w.revoked_at, w.revoked_by,
  a.username AS admin_username, a.display_name AS admin_display_name
`;

export const warningsRepo = (db: Database = getDb()) => ({
  byId(id: number): Warning | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS} FROM warnings w JOIN admins a ON a.id = w.admin_id WHERE w.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToWarning(row) : null;
  },

  create(input: { user_id: number; admin_id: string; reason: string }): Warning {
    const result = db
      .prepare(
        `INSERT INTO warnings (user_id, admin_id, reason, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(input.user_id, input.admin_id, input.reason, now());
    return this.byId(Number(result.lastInsertRowid))!;
  },

  revoke(id: number, revokedBy: string): Warning | null {
    db.prepare(
      `UPDATE warnings SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL`,
    ).run(now(), revokedBy, id);
    return this.byId(id);
  },

  listByUser(userId: number, page: number, pageSize: number): Paginated<Warning> {
    const total = (
      db.prepare("SELECT COUNT(*) AS c FROM warnings WHERE user_id = ?").get(userId) as {
        c: number;
      }
    ).c;
    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM warnings w JOIN admins a ON a.id = w.admin_id
         WHERE w.user_id = ?
         ORDER BY w.created_at DESC, w.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(userId, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    return paginate(rows.map(rowToWarning), total, page, pageSize);
  },

  countActive(userId: number): number {
    return (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM warnings WHERE user_id = ? AND revoked_at IS NULL",
        )
        .get(userId) as { c: number }
    ).c;
  },
});

export type WarningsRepo = ReturnType<typeof warningsRepo>;
