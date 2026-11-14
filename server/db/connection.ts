import Database from "better-sqlite3";
import path from "node:path";
import { config } from "../config";
import { logger } from "../logger";

/**
 * Opens (and lazily creates) the SQLite database with the PRAGMAs required by
 * the plan (§8): WAL journal mode, foreign keys on, busy timeout. Returns a
 * shared singleton so repositories and migrations share one connection.
 */

let db: Database.Database | null = null;

export function getDatabasePath(): string {
  const raw = process.env.DATABASE_PATH || "./data/declare.db";
  return path.resolve(process.cwd(), raw);
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDatabasePath();
  db = new Database(dbPath);

  // WAL improves concurrent reads and reduces write lock contention.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");

  logger.debug("database opened", { path: dbPath });
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Run `fn` inside a single transaction; rolls back on any thrown error. */
export function withTransaction<T>(
  fn: (db: Database.Database) => T,
): T {
  const database = getDb();
  const tx = database.transaction(fn);
  return tx(database);
}

export type { Database };
export { config };
