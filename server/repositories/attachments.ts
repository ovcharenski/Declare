import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";
import { now } from "./helpers";

/**
 * Suggestion attachment repository. Handles insertion and status updates for
 * media attachments (photos/videos) linked to a suggestion.
 */

export type AttachmentKind = "photo" | "video";
export type DownloadStatus = "pending" | "ready" | "failed";

export interface CreateAttachmentInput {
  suggestion_id: number;
  kind: AttachmentKind;
  telegram_file_id: string;
  telegram_file_unique_id?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  duration_sec?: number | null;
  download_status?: DownloadStatus;
  download_error?: string | null;
}

export const attachmentsRepo = (db: Database = getDb()) => ({
  create(input: CreateAttachmentInput): number {
    const result = db
      .prepare(
        `INSERT INTO suggestion_attachments
           (suggestion_id, kind, telegram_file_id, telegram_file_unique_id,
            file_path, mime_type, size_bytes, width, height, duration_sec,
            download_status, download_error, created_at)
         VALUES (@suggestion_id, @kind, @telegram_file_id, @telegram_file_unique_id,
            @file_path, @mime_type, @size_bytes, @width, @height, @duration_sec,
            @download_status, @download_error, @ts)`,
      )
      .run({
        suggestion_id: input.suggestion_id,
        kind: input.kind,
        telegram_file_id: input.telegram_file_id,
        telegram_file_unique_id: input.telegram_file_unique_id ?? null,
        file_path: input.file_path ?? null,
        mime_type: input.mime_type ?? null,
        size_bytes: input.size_bytes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        duration_sec: input.duration_sec ?? null,
        download_status: input.download_status ?? "pending",
        download_error: input.download_error ?? null,
        ts: now(),
      });
    return Number(result.lastInsertRowid);
  },

  /** Update download status/paths after (re)download. */
  updateDownload(
    id: number,
    input: {
      download_status: DownloadStatus;
      file_path?: string | null;
      mime_type?: string | null;
      size_bytes?: number | null;
      download_error?: string | null;
    },
  ): void {
    db.prepare(
      `UPDATE suggestion_attachments SET
         download_status = ?, file_path = COALESCE(?, file_path),
         mime_type = COALESCE(?, mime_type), size_bytes = COALESCE(?, size_bytes),
         download_error = ?
       WHERE id = ?`,
    ).run(
      input.download_status,
      input.file_path ?? null,
      input.mime_type ?? null,
      input.size_bytes ?? null,
      input.download_error ?? null,
      id,
    );
  },

  /** All attachments for a suggestion, ordered by id. */
  bySuggestion(suggestionId: number): {
    id: number;
    kind: AttachmentKind;
    telegram_file_id: string;
    download_status: DownloadStatus;
    file_path: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    width: number | null;
    height: number | null;
    duration_sec: number | null;
    download_error: string | null;
  }[] {
    return db
      .prepare(
        `SELECT id, kind, telegram_file_id, download_status, file_path, mime_type,
                size_bytes, width, height, duration_sec, download_error
         FROM suggestion_attachments
         WHERE suggestion_id = ?
         ORDER BY id ASC`,
      )
      .all(suggestionId) as never;
  },
});

export type AttachmentsRepo = ReturnType<typeof attachmentsRepo>;
