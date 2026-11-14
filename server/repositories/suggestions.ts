import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now, paginate, type Paginated } from "./helpers";

export const SUGGESTION_STATUSES = [
  "new",
  "in_review",
  "accepted",
  "rejected",
  "archived",
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_TYPES = ["text", "photo", "video"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export interface SuggestionAttachment {
  id: number;
  suggestion_id: number;
  kind: "photo" | "video";
  telegram_file_id: string;
  telegram_file_unique_id: string | null;
  file_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  download_status: "pending" | "ready" | "failed";
  download_error: string | null;
  created_at: string;
}

export interface Suggestion {
  id: number;
  user_id: number;
  tag_id: number;
  type: SuggestionType;
  text: string | null;
  status: SuggestionStatus;
  moderation_note: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  dedupe_key: string;
  telegram_message_id: number | null;
  created_at: string;
  updated_at: string;
  // joined
  user_username: string | null;
  user_first_name: string;
  user_last_name: string | null;
  tag_name: string;
  attachments: SuggestionAttachment[];
}

export interface CreateSuggestionInput {
  user_id: number;
  tag_id: number;
  type: SuggestionType;
  text?: string | null;
  dedupe_key: string;
  telegram_message_id?: number | null;
}

export interface ListSuggestionsParams {
  tagIds?: number[];
  status?: SuggestionStatus;
  type?: SuggestionType;
  userId?: number;
  q?: string;
  from?: string;
  to?: string;
  sort?: "created_at" | "user" | "tag";
  order?: "asc" | "desc";
  page: number;
  pageSize: number;
}

const BASE_COLUMNS = `
  s.id,
  s.user_id,
  s.tag_id,
  s.type,
  s.text,
  s.status,
  s.moderation_note,
  s.moderated_by,
  s.moderated_at,
  s.dedupe_key,
  s.telegram_message_id,
  s.created_at,
  s.updated_at,
  u.username AS user_username,
  u.first_name AS user_first_name,
  u.last_name AS user_last_name,
  t.name AS tag_name
`;

function rowToSuggestion(row: Record<string, unknown>): Suggestion {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    tag_id: Number(row.tag_id),
    type: row.type as SuggestionType,
    text: (row.text as string | null) ?? null,
    status: row.status as SuggestionStatus,
    moderation_note: (row.moderation_note as string | null) ?? null,
    moderated_by: (row.moderated_by as string | null) ?? null,
    moderated_at: (row.moderated_at as string | null) ?? null,
    dedupe_key: String(row.dedupe_key),
    telegram_message_id: (row.telegram_message_id as number | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    user_username: (row.user_username as string | null) ?? null,
    user_first_name: String(row.user_first_name ?? ""),
    user_last_name: (row.user_last_name as string | null) ?? null,
    tag_name: String(row.tag_name),
    attachments: [],
  };
}

function attachmentsFor(db: Database, suggestionIds: number[]): Map<number, SuggestionAttachment[]> {
  if (suggestionIds.length === 0) return new Map();
  const placeholders = suggestionIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, suggestion_id, kind, telegram_file_id, telegram_file_unique_id,
              file_path, mime_type, size_bytes, width, height, duration_sec,
              download_status, download_error, created_at
       FROM suggestion_attachments
       WHERE suggestion_id IN (${placeholders})
       ORDER BY id ASC`,
    )
    .all(...suggestionIds) as Record<string, unknown>[];

  const map = new Map<number, SuggestionAttachment[]>();
  for (const row of rows) {
    const att: SuggestionAttachment = {
      id: Number(row.id),
      suggestion_id: Number(row.suggestion_id),
      kind: row.kind as "photo" | "video",
      telegram_file_id: String(row.telegram_file_id),
      telegram_file_unique_id: (row.telegram_file_unique_id as string | null) ?? null,
      file_path: (row.file_path as string | null) ?? null,
      mime_type: (row.mime_type as string | null) ?? null,
      size_bytes: (row.size_bytes as number | null) ?? null,
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      duration_sec: (row.duration_sec as number | null) ?? null,
      download_status: row.download_status as "pending" | "ready" | "failed",
      download_error: (row.download_error as string | null) ?? null,
      created_at: String(row.created_at),
    };
    const list = map.get(Number(row.suggestion_id)) ?? [];
    list.push(att);
    map.set(Number(row.suggestion_id), list);
  }
  return map;
}

function attach(db: Database, suggestions: Suggestion[]): Suggestion[] {
  const attMap = attachmentsFor(db, suggestions.map((s) => s.id));
  return suggestions.map((s) => ({ ...s, attachments: attMap.get(s.id) ?? [] }));
}

export const suggestionsRepo = (db: Database = getDb()) => ({
  byId(id: number): Suggestion | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM suggestions s
         JOIN users u ON u.id = s.user_id
         JOIN tags t ON t.id = s.tag_id
         WHERE s.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return attach(db, [rowToSuggestion(row)])[0];
  },

  byDedupeKey(key: string): Suggestion | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM suggestions s
         JOIN users u ON u.id = s.user_id
         JOIN tags t ON t.id = s.tag_id
         WHERE s.dedupe_key = ?`,
      )
      .get(key) as Record<string, unknown> | undefined;
    if (!row) return null;
    return attach(db, [rowToSuggestion(row)])[0];
  },

  create(input: CreateSuggestionInput): Suggestion {
    const ts = now();
    const result = db
      .prepare(
        `INSERT INTO suggestions
           (user_id, tag_id, type, text, status, dedupe_key, telegram_message_id, created_at, updated_at)
         VALUES (@user_id, @tag_id, @type, @text, 'new', @dedupe_key, @telegram_message_id, @ts, @ts)`,
      )
      .run({
        user_id: input.user_id,
        tag_id: input.tag_id,
        type: input.type,
        text: input.text ?? null,
        dedupe_key: input.dedupe_key,
        telegram_message_id: input.telegram_message_id ?? null,
        ts,
      });
    return this.byId(Number(result.lastInsertRowid))!;
  },

  updateStatus(
    id: number,
    status: SuggestionStatus,
    moderationNote: string | null,
    moderatedBy: string,
  ): Suggestion | null {
    const ts = now();
    db.prepare(
      `UPDATE suggestions SET
         status = ?, moderation_note = ?, moderated_by = ?, moderated_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(status, moderationNote, moderatedBy, ts, ts, id);
    return this.byId(id);
  },

  list(params: ListSuggestionsParams): Paginated<Suggestion> {
    const { tagIds, status, type, userId, q, from, to, page, pageSize } = params;
    const sort = params.sort ?? "created_at";
    const order = (params.order ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const where: string[] = [];
    const args: unknown[] = [];

    if (tagIds && tagIds.length > 0) {
      where.push(`s.tag_id IN (${tagIds.map(() => "?").join(",")})`);
      args.push(...tagIds);
    }
    if (status) {
      where.push("s.status = ?");
      args.push(status);
    }
    if (type) {
      where.push("s.type = ?");
      args.push(type);
    }
    if (userId) {
      where.push("s.user_id = ?");
      args.push(userId);
    }
    if (from) {
      where.push("s.created_at >= ?");
      args.push(from);
    }
    if (to) {
      where.push("s.created_at <= ?");
      args.push(to);
    }

    // FTS for queries >= 3 chars, fallback to LIKE for shorter queries.
    if (q) {
      if (q.trim().length >= 3) {
        where.push(
          `s.id IN (SELECT rowid FROM suggestions_fts WHERE suggestions_fts MATCH ?)`,
        );
        const ftsQuery = q
          .trim()
          .split(/\s+/)
          .map((t) => t.replace(/[^\p{L}\p{N}]/gu, "") + "*")
          .filter((t) => t.length > 1)
          .join(" ");
        args.push(ftsQuery);
      } else {
        where.push(
          `(s.text LIKE ? OR u.username LIKE ? COLLATE NOCASE OR CAST(u.telegram_id AS TEXT) LIKE ?)`,
        );
        const like = `%${q}%`;
        args.push(like, like, like);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const orderBy: Record<string, string> = {
      created_at: "s.created_at",
      user: "u.username COLLATE NOCASE",
      tag: "t.name COLLATE NOCASE",
    };
    const orderCol = orderBy[sort] ?? orderBy.created_at;

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS c
           FROM suggestions s
           JOIN users u ON u.id = s.user_id
           JOIN tags t ON t.id = s.tag_id
           ${whereSql}`,
        )
        .get(...args) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM suggestions s
         JOIN users u ON u.id = s.user_id
         JOIN tags t ON t.id = s.tag_id
         ${whereSql}
         ORDER BY ${orderCol} ${order}, s.id ${order}
         LIMIT ? OFFSET ?`,
      )
      .all(...args, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];

    const items = attach(db, rows.map(rowToSuggestion));
    return paginate(items, total, page, pageSize);
  },
});

export type SuggestionsRepo = ReturnType<typeof suggestionsRepo>;
