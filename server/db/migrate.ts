import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "better-sqlite3";
import { getDb } from "./connection";
import { logger } from "../logger";

/**
 * Runs numbered SQL migration files in `server/db/migrations/` in lexical
 * order, recording applied versions in `schema_migrations`. Designed to be
 * safe to run at app startup (idempotent) and directly via `npm run migrate`.
 */

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

function ensureSchemaMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY
    );
  `);
}

function appliedVersions(db: Database): Set<string> {
  const rows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as { version: string }[];
  return new Set(rows.map((r) => r.version));
}

function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Apply all pending migrations. Each file runs inside its own transaction and
 * is recorded in `schema_migrations` only after it completes successfully.
 *
 * @param db   Database handle (defaults to the shared singleton).
 * @returns    Names of the migration files applied in this run.
 */
export function runMigrations(db: Database = getDb()): string[] {
  ensureSchemaMigrationsTable(db);
  const applied = appliedVersions(db);
  const appliedNow: string[] = [];

  for (const file of listMigrationFiles()) {
    if (applied.has(file)) continue;

    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(file);
    });

    apply();
    appliedNow.push(file);
    logger.info("migration applied", { version: file });
  }

  if (appliedNow.length > 0) {
    logger.info("migrations complete", { applied: appliedNow });
  }

  return appliedNow;
}

/**
 * Run migrations as a standalone command (`npm run migrate`). Applies and
 * exits, optionally printing a summary. Never starts a server.
 */
export function migrateAndExit(): void {
  try {
    const applied = runMigrations();
    logger.info("migrate finished", {
      applied: applied,
      upToDate: applied.length === 0,
    });
    process.exit(0);
  } catch (err) {
    logger.error("migration failed", { error: String((err as Error).message) });
    process.exit(1);
  }
}
