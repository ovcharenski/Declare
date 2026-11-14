import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { DEFAULTS, now } from "./helpers";

export interface AppSettings {
  suggestions_per_hour: number;
  suggestions_per_day: number;
  min_interval_seconds: number;
  duplicate_window_minutes: number;
  bot_enabled: number;
  updated_at: string;
  updated_by: string | null;
}

export interface UpdateSettingsInput {
  suggestions_per_hour?: number;
  suggestions_per_day?: number;
  min_interval_seconds?: number;
  duplicate_window_minutes?: number;
  bot_enabled?: boolean;
}

function rowToSettings(row: Record<string, unknown>): AppSettings {
  return {
    suggestions_per_hour: Number(row.suggestions_per_hour),
    suggestions_per_day: Number(row.suggestions_per_day),
    min_interval_seconds: Number(row.min_interval_seconds),
    duplicate_window_minutes: Number(row.duplicate_window_minutes),
    bot_enabled: Number(row.bot_enabled),
    updated_at: String(row.updated_at),
    updated_by: (row.updated_by as string | null) ?? null,
  };
}

export const settingsRepo = (db: Database = getDb()) => ({
  /** Get the single settings row, creating it with defaults if absent. */
  get(): AppSettings {
    let row = db
      .prepare(
        `SELECT suggestions_per_hour, suggestions_per_day, min_interval_seconds,
                duplicate_window_minutes, bot_enabled, updated_at, updated_by
         FROM app_settings WHERE id = 1`,
      )
      .get() as Record<string, unknown> | undefined;

    if (!row) {
      const ts = now();
      db.prepare(
        `INSERT INTO app_settings
           (id, suggestions_per_hour, suggestions_per_day, min_interval_seconds,
            duplicate_window_minutes, bot_enabled, updated_at, updated_by)
         VALUES (1, ?, ?, ?, ?, 1, ?, NULL)`,
      ).run(
        DEFAULTS.suggestionsPerHour,
        DEFAULTS.suggestionsPerDay,
        DEFAULTS.minIntervalSeconds,
        DEFAULTS.duplicateWindowMinutes,
        ts,
      );
      row = db
        .prepare(
          `SELECT suggestions_per_hour, suggestions_per_day, min_interval_seconds,
                  duplicate_window_minutes, bot_enabled, updated_at, updated_by
           FROM app_settings WHERE id = 1`,
        )
        .get() as Record<string, unknown>;
    }

    return rowToSettings(row);
  },

  /** Partial update; returns the new full settings row. */
  update(input: UpdateSettingsInput, updatedBy: string | null): AppSettings {
    const current = this.get();

    const next = {
      suggestions_per_hour:
        input.suggestions_per_hour ?? current.suggestions_per_hour,
      suggestions_per_day: input.suggestions_per_day ?? current.suggestions_per_day,
      min_interval_seconds:
        input.min_interval_seconds ?? current.min_interval_seconds,
      duplicate_window_minutes:
        input.duplicate_window_minutes ?? current.duplicate_window_minutes,
      bot_enabled: input.bot_enabled !== undefined
        ? (input.bot_enabled ? 1 : 0)
        : current.bot_enabled,
    };

    db.prepare(
      `UPDATE app_settings SET
         suggestions_per_hour = ?,
         suggestions_per_day = ?,
         min_interval_seconds = ?,
         duplicate_window_minutes = ?,
         bot_enabled = ?,
         updated_at = ?,
         updated_by = ?
       WHERE id = 1`,
    ).run(
      next.suggestions_per_hour,
      next.suggestions_per_day,
      next.min_interval_seconds,
      next.duplicate_window_minutes,
      next.bot_enabled,
      now(),
      updatedBy,
    );

    return this.get();
  },
});

export type SettingsRepo = ReturnType<typeof settingsRepo>;
