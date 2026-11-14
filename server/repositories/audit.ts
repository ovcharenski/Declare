import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now, paginate, type Paginated } from "./helpers";

export interface AuditLog {
  id: number;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details_json: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  // joined
  admin_username: string;
  admin_display_name: string;
}

export interface WriteAuditInput {
  admin_id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
}

function rowToAudit(row: Record<string, unknown>): AuditLog {
  return {
    id: Number(row.id),
    admin_id: String(row.admin_id),
    action: String(row.action),
    entity_type: (row.entity_type as string | null) ?? null,
    entity_id: (row.entity_id as string | null) ?? null,
    details_json: (row.details_json as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    user_agent: (row.user_agent as string | null) ?? null,
    created_at: String(row.created_at),
    admin_username: String(row.admin_username ?? ""),
    admin_display_name: String(row.admin_display_name ?? ""),
  };
}

const BASE_COLUMNS = `
  l.id, l.admin_id, l.action, l.entity_type, l.entity_id, l.details_json,
  l.ip, l.user_agent, l.created_at,
  a.username AS admin_username, a.display_name AS admin_display_name
`;

export const auditRepo = (db: Database = getDb()) => ({
  write(input: WriteAuditInput): void {
    db.prepare(
      `INSERT INTO admin_audit_logs
         (admin_id, action, entity_type, entity_id, details_json, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.admin_id,
      input.action,
      input.entity_type ?? null,
      input.entity_id !== undefined && input.entity_id !== null
        ? String(input.entity_id)
        : null,
      input.details ? JSON.stringify(input.details) : null,
      input.ip ?? null,
      input.user_agent ?? null,
      now(),
    );
  },

  list(params: {
    adminId?: string;
    action?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Paginated<AuditLog> {
    const { adminId, action, from, to, page, pageSize } = params;
    const where: string[] = [];
    const args: unknown[] = [];

    if (adminId) {
      where.push("l.admin_id = ?");
      args.push(adminId);
    }
    if (action) {
      where.push("l.action = ?");
      args.push(action);
    }
    if (from) {
      where.push("l.created_at >= ?");
      args.push(from);
    }
    if (to) {
      where.push("l.created_at <= ?");
      args.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM admin_audit_logs l ${whereSql}`)
        .get(...args) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS}
         FROM admin_audit_logs l JOIN admins a ON a.id = l.admin_id
         ${whereSql}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...args, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];

    return paginate(rows.map(rowToAudit), total, page, pageSize);
  },
});

export type AuditRepo = ReturnType<typeof auditRepo>;
