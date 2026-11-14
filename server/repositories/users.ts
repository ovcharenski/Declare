import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now, paginate, type Paginated } from "./helpers";

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  language_code: string | null;
  registered_at: string;
  last_activity_at: string;
}

export interface UserWithStats extends User {
  suggestions_count: number;
  warnings_count: number;
  active_warnings_count: number;
  active_ban_ends_at: string | null;
  status: "active" | "banned";
  /** True when an active ban exists (handles permanent bans with NULL ends_at). */
  has_active_ban: boolean;
}

interface UserRow {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  language_code: string | null;
  registered_at: string;
  last_activity_at: string;
  suggestions_count: number;
  warnings_count: number;
  active_warnings_count: number;
  active_ban_ends_at: string | null;
}

export interface UpsertUserInput {
  telegram_id: number;
  username?: string | null;
  first_name?: string;
  last_name?: string | null;
  language_code?: string | null;
}

const BASE_COLUMNS = `
  u.id,
  u.telegram_id,
  u.username,
  u.first_name,
  u.last_name,
  u.language_code,
  u.registered_at,
  u.last_activity_at
`;

// A user is "banned" when they have an active (not lifted, not expired) ban.
// "Active warning" means not revoked.
const WITH_STATS_SELECT = `
  SELECT
    ${BASE_COLUMNS},
    (SELECT COUNT(*) FROM suggestions s WHERE s.user_id = u.id) AS suggestions_count,
    (SELECT COUNT(*) FROM warnings w WHERE w.user_id = u.id) AS warnings_count,
    (SELECT COUNT(*) FROM warnings w
       WHERE w.user_id = u.id AND w.revoked_at IS NULL) AS active_warnings_count,
    (SELECT COALESCE(b.ends_at, 'PERMANENT') FROM bans b
       WHERE b.user_id = u.id
         AND b.lifted_at IS NULL
         AND (b.ends_at IS NULL OR b.ends_at > ?
       )
       ORDER BY b.starts_at DESC LIMIT 1) AS active_ban_ends_at
  FROM users u
`;

function mapUserRow(row: UserRow): UserWithStats {
  const hasActiveBan = row.active_ban_ends_at !== null;
  const isPermanent = row.active_ban_ends_at === "PERMANENT";
  return {
    id: row.id,
    telegram_id: row.telegram_id,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    language_code: row.language_code,
    registered_at: row.registered_at,
    last_activity_at: row.last_activity_at,
    suggestions_count: row.suggestions_count,
    warnings_count: row.warnings_count,
    active_warnings_count: row.active_warnings_count,
    active_ban_ends_at: hasActiveBan && !isPermanent ? row.active_ban_ends_at : null,
    status: hasActiveBan ? "banned" : "active",
    has_active_ban: hasActiveBan,
  };
}

export const usersRepo = (db: Database = getDb()) => ({
  /** Insert or update a Telegram user, then return it (with stats). */
  upsert(input: UpsertUserInput): UserWithStats {
    const ts = now();
    db.prepare(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, registered_at, last_activity_at)
       VALUES (@telegram_id, @username, @first_name, @last_name, @language_code, @ts, @ts)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         language_code = excluded.language_code,
         last_activity_at = excluded.last_activity_at`,
    ).run({
      telegram_id: input.telegram_id,
      username: input.username ?? null,
      first_name: input.first_name ?? "",
      last_name: input.last_name ?? null,
      language_code: input.language_code ?? null,
      ts,
    });

    const id = db
      .prepare("SELECT id FROM users WHERE telegram_id = ?")
      .get(input.telegram_id) as { id: number };
    return this.byId(id.id)!;
  },

  byId(id: number): UserWithStats | null {
    const row = db
      .prepare(`${WITH_STATS_SELECT} WHERE u.id = ?`)
      .get(now(), id) as UserRow | undefined;
    return row ? mapUserRow(row) : null;
  },

  byTelegramId(telegramId: number): UserWithStats | null {
    const row = db
      .prepare(`${WITH_STATS_SELECT} WHERE u.telegram_id = ?`)
      .get(now(), telegramId) as UserRow | undefined;
    return row ? mapUserRow(row) : null;
  },

  /** Touch last_activity_at. */
  touch(id: number): void {
    db.prepare("UPDATE users SET last_activity_at = ? WHERE id = ?").run(now(), id);
  },

  list(params: {
    q?: string;
    status?: "active" | "banned";
    withWarnings?: boolean;
    page: number;
    pageSize: number;
  }): Paginated<UserWithStats> {
    const { q, status, withWarnings, page, pageSize } = params;
    const where: string[] = [];
    // Args for the COUNT query (no `now()` placeholder there).
    const countArgs: unknown[] = [];
    // Args for the select query (starts with `now()` for active_ban subquery).
    const selectArgs: unknown[] = [now()];

    if (q) {
      where.push(
        `(u.username LIKE ? COLLATE NOCASE
           OR u.first_name LIKE ? COLLATE NOCASE
           OR u.last_name LIKE ? COLLATE NOCASE
           OR CAST(u.telegram_id AS TEXT) LIKE ?)`,
      );
      const like = `%${q}%`;
      countArgs.push(like, like, like, like);
      selectArgs.push(like, like, like, like);
    }

    if (status === "banned") {
      where.push(
        `EXISTS (SELECT 1 FROM bans b
           WHERE b.user_id = u.id AND b.lifted_at IS NULL
             AND (b.ends_at IS NULL OR b.ends_at > ?))`,
      );
      countArgs.push(now());
      selectArgs.push(now());
    } else if (status === "active") {
      where.push(
        `NOT EXISTS (SELECT 1 FROM bans b
           WHERE b.user_id = u.id AND b.lifted_at IS NULL
             AND (b.ends_at IS NULL OR b.ends_at > ?))`,
      );
      countArgs.push(now());
      selectArgs.push(now());
    }

    if (withWarnings) {
      where.push(
        `EXISTS (SELECT 1 FROM warnings w WHERE w.user_id = u.id AND w.revoked_at IS NULL)`,
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM users u ${whereSql}`)
        .get(...countArgs) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `${WITH_STATS_SELECT} ${whereSql}
         ORDER BY u.registered_at DESC, u.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...selectArgs, pageSize, (page - 1) * pageSize) as UserRow[];

    return paginate(rows.map(mapUserRow), total, page, pageSize);
  },
});

export type UsersRepo = ReturnType<typeof usersRepo>;
