import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now } from "./helpers";
import type { AdminRole } from "@shared/schema";

export interface Admin {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AdminRole;
  role_badge: string | null;
  created_at: string;
  last_login_at: string;
  last_role_check_at: string | null;
}

export interface UpsertAdminInput {
  id: string;
  username: string;
  display_name: string;
  email?: string | null;
  avatar_url?: string | null;
  role: AdminRole;
  role_badge?: string | null;
}

const BASE_COLUMNS = `
  id, username, display_name, email, avatar_url, role, role_badge,
  created_at, last_login_at, last_role_check_at
`;

function rowToAdmin(row: Record<string, unknown>): Admin {
  return {
    id: String(row.id),
    username: String(row.username),
    display_name: String(row.display_name),
    email: (row.email as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    role: row.role as AdminRole,
    role_badge: (row.role_badge as string | null) ?? null,
    created_at: String(row.created_at),
    last_login_at: String(row.last_login_at),
    last_role_check_at: (row.last_role_check_at as string | null) ?? null,
  };
}

export const adminsRepo = (db: Database = getDb()) => ({
  byId(id: string): Admin | null {
    const row = db.prepare(`SELECT ${BASE_COLUMNS} FROM admins WHERE id = ?`).get(id);
    return row ? rowToAdmin(row as Record<string, unknown>) : null;
  },

  /** Insert or update an admin on login. Updates last_login_at. */
  upsert(input: UpsertAdminInput): Admin {
    const ts = now();
    db.prepare(
      `INSERT INTO admins (id, username, display_name, email, avatar_url, role, role_badge, created_at, last_login_at)
       VALUES (@id, @username, @display_name, @email, @avatar_url, @role, @role_badge, @ts, @ts)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         email = excluded.email,
         avatar_url = excluded.avatar_url,
         role = excluded.role,
         role_badge = excluded.role_badge,
         last_login_at = excluded.last_login_at`,
    ).run({
      id: input.id,
      username: input.username,
      display_name: input.display_name,
      email: input.email ?? null,
      avatar_url: input.avatar_url ?? null,
      role: input.role,
      role_badge: input.role_badge ?? null,
      ts,
    });
    return this.byId(input.id)!;
  },

  /** Update role + last_role_check_at (periodic role re-check). */
  updateRole(id: string, role: AdminRole, roleBadge: string | null): void {
    db.prepare(
      `UPDATE admins SET role = ?, role_badge = ?, last_role_check_at = ? WHERE id = ?`,
    ).run(role, roleBadge, now(), id);
  },

  list(): Admin[] {
    const rows = db
      .prepare(`SELECT ${BASE_COLUMNS} FROM admins ORDER BY display_name COLLATE NOCASE`)
      .all() as Record<string, unknown>[];
    return rows.map(rowToAdmin);
  },
});

export type AdminsRepo = ReturnType<typeof adminsRepo>;
