import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now } from "./helpers";

export interface Tag {
  id: number;
  name: string;
  description: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TagWithUsage extends Tag {
  suggestions_count: number;
}

interface TagRow extends Tag {
  suggestions_count: number;
}

const BASE_COLUMNS = `
  t.id,
  t.name,
  t.description,
  t.is_active,
  t.sort_order,
  t.created_at,
  t.updated_at,
  t.archived_at
`;

function mapTagRow(row: TagRow): TagWithUsage {
  return { ...row };
}

export const tagsRepo = (db: Database = getDb()) => ({
  byId(id: number): TagWithUsage | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS},
           (SELECT COUNT(*) FROM suggestions s WHERE s.tag_id = t.id) AS suggestions_count
         FROM tags t WHERE t.id = ?`,
      )
      .get(id) as TagRow | undefined;
    return row ? mapTagRow(row) : null;
  },

  byName(name: string): TagWithUsage | null {
    const row = db
      .prepare(
        `SELECT ${BASE_COLUMNS},
           (SELECT COUNT(*) FROM suggestions s WHERE s.tag_id = t.id) AS suggestions_count
         FROM tags t WHERE t.name = ? COLLATE NOCASE`,
      )
      .get(name) as TagRow | undefined;
    return row ? mapTagRow(row) : null;
  },

  /** All tags ordered by sort_order. Pass includeInactive to also return archived/inactive. */
  list(includeInactive = false): TagWithUsage[] {
    const where = includeInactive ? "" : "WHERE t.is_active = 1 AND t.archived_at IS NULL";
    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS},
           (SELECT COUNT(*) FROM suggestions s WHERE s.tag_id = t.id) AS suggestions_count
         FROM tags t ${where}
         ORDER BY t.sort_order ASC, t.id ASC`,
      )
      .all() as TagRow[];
    return rows.map(mapTagRow);
  },

  create(input: { name: string; description?: string | null }): TagWithUsage {
    const ts = now();
    const maxOrder = (
      db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM tags").get() as {
        m: number;
      }
    ).m;
    const result = db
      .prepare(
        `INSERT INTO tags (name, description, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)`,
      )
      .run(input.name.trim(), input.description ?? null, maxOrder + 1, ts, ts);
    return this.byId(Number(result.lastInsertRowid))!;
  },

  update(
    id: number,
    input: { name?: string; description?: string | null; is_active?: boolean },
  ): TagWithUsage | null {
    const current = this.byId(id);
    if (!current) return null;

    db.prepare(
      `UPDATE tags SET
         name = ?,
         description = ?,
         is_active = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name !== undefined ? input.name.trim() : current.name,
      input.description !== undefined ? input.description : current.description,
      input.is_active !== undefined ? (input.is_active ? 1 : 0) : current.is_active,
      now(),
      id,
    );
    return this.byId(id);
  },

  /** Physical delete — allowed only for unused tags (see modules/tags). */
  delete(id: number): boolean {
    const result = db.prepare("DELETE FROM tags WHERE id = ?").run(id);
    return result.changes > 0;
  },

  /** Archive (soft delete) a used tag. */
  archive(id: number): TagWithUsage | null {
    db.prepare(
      `UPDATE tags SET is_active = 0, archived_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now(), now(), id);
    return this.byId(id);
  },

  /** Swap sort_order of two tags. */
  swapOrder(idA: number, idB: number): void {
    const a = this.byId(idA);
    const b = this.byId(idB);
    if (!a || !b) return;
    const tx = db.transaction(() => {
      db.prepare("UPDATE tags SET sort_order = ?, updated_at = ? WHERE id = ?").run(
        b.sort_order,
        now(),
        idA,
      );
      db.prepare("UPDATE tags SET sort_order = ?, updated_at = ? WHERE id = ?").run(
        a.sort_order,
        now(),
        idB,
      );
    });
    tx();
  },

  /** Persist an explicit ordering (array of tag ids in desired order). */
  reorder(orderedIds: number[]): void {
    const tx = db.transaction(() => {
      orderedIds.forEach((id, index) => {
        db.prepare("UPDATE tags SET sort_order = ?, updated_at = ? WHERE id = ?").run(
          index,
          now(),
          id,
        );
      });
    });
    tx();
  },
});

export type TagsRepo = ReturnType<typeof tagsRepo>;
