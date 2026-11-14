import { promises as fs } from "node:fs";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { getFile, downloadFile } from "./api";
import { config } from "../config";
import { logger } from "../logger";

/**
 * Media download + validation (plan §12). Downloads Telegram files to
 * `data/media/YYYY/MM/<suggestionId>/<random>.<ext>` and validates the MIME
 * type by magic-number signature (file-type), not by extension.
 */

/** Allowed content types and their file extensions. */
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export interface DownloadResult {
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  error: string | null;
}

function mediaRoot(): string {
  return path.resolve(process.cwd(), config.mediaDir);
}

/** Relative path (from media dir) where this suggestion's files are stored. */
function suggestionSubdir(suggestionId: number): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return path.join(yyyy, mm, String(suggestionId));
}

function randomName(ext: string): string {
  return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}.${ext}`;
}

/**
 * Download a Telegram file id to local storage.
 *
 * - Resolves the file via `getFile`, downloads the bytes, validates the MIME
 *   signature against the whitelist, and writes it under `data/media`.
 * - On any failure returns `filePath: null` with a non-null `error` so the
 *   caller can persist `download_status = 'failed'` and offer a retry.
 */
export async function downloadMedia(
  fileId: string,
  suggestionId: number,
): Promise<DownloadResult> {
  try {
    const file = await getFile(fileId);
    if (!file.file_path) {
      return {
        filePath: null,
        mimeType: null,
        sizeBytes: file.file_size ?? null,
        error: "Telegram did not return a file_path",
      };
    }

    const bytes = await downloadFile(file.file_path);
    const buffer = Buffer.from(bytes);

    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !ALLOWED_MIME[detected.mime]) {
      return {
        filePath: null,
        mimeType: detected?.mime ?? null,
        sizeBytes: buffer.length,
        error: `Unsupported media type: ${detected?.mime ?? "unknown"}`,
      };
    }

    const ext = ALLOWED_MIME[detected.mime];
    const subdir = suggestionSubdir(suggestionId);
    const absDir = path.join(mediaRoot(), subdir);
    await fs.mkdir(absDir, { recursive: true });

    const filename = randomName(ext);
    const absPath = path.join(absDir, filename);
    await fs.writeFile(absPath, buffer);

    // Store the path relative to the media root (plan §8: file_path relative).
    const relative = path.join(subdir, filename).replace(/\\/g, "/");

    return {
      filePath: relative,
      mimeType: detected.mime,
      sizeBytes: buffer.length,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("media: download failed", { fileId, error: message });
    return { filePath: null, mimeType: null, sizeBytes: null, error: message };
  }
}

/** Absolute filesystem path for a stored relative media path. */
export function absoluteMediaPath(relative: string): string {
  return path.resolve(mediaRoot(), relative);
}

/** Guard against path traversal: ensure `relative` stays inside the media dir. */
export function isSafeRelative(relative: string): boolean {
  const abs = path.resolve(mediaRoot(), relative);
  const root = mediaRoot();
  return abs === root || abs.startsWith(root + path.sep);
}
