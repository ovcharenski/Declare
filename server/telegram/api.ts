import { config } from "../config";
import { logger } from "../logger";

/**
 * Minimal Telegram Bot API client (plan §3 "Бот" / §10). Used by the backend
 * for outgoing messages and by the media downloader for `getFile`. Built on
 * plain fetch with no extra dependencies; the bot token is never logged.
 *
 * Only the calls the backend actually needs are implemented here.
 */

const API_BASE = "https://api.telegram.org";

export interface TelegramSendMessageResult {
  message_id: number;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export class TelegramApiError extends Error {
  code: number;
  description: string;
  retryAfter?: number;

  constructor(code: number, description: string, retryAfter?: number) {
    super(`Telegram API error ${code}: ${description}`);
    this.name = "TelegramApiError";
    this.code = code;
    this.description = description;
    this.retryAfter = retryAfter;
  }
}

function token(): string {
  const t = config.telegram.botToken;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const url = `${API_BASE}/bot${token()}/${method}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure (no token leakage).
    logger.warn("telegram: request failed", { method, error: String(err) });
    throw new TelegramApiError(0, "network error");
  }

  const data = (await res.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
  };

  if (!data.ok) {
    const code = data.error_code ?? res.status;
    const retryAfter = data.parameters?.retry_after;
    logger.warn("telegram: api error", { method, code, description: data.description });
    throw new TelegramApiError(code, data.description ?? "unknown error", retryAfter);
  }

  return data.result as T;
}

/** Send a plain-text message to a chat. Returns the message id. */
export async function sendMessage(
  chatId: number,
  text: string,
  opts: { replyMarkup?: unknown } = {},
): Promise<TelegramSendMessageResult> {
  return call<TelegramSendMessageResult>("sendMessage", {
    chat_id: chatId,
    text,
    ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  });
}

/** Resolve file metadata (including file_path) for a file id. */
export async function getFile(fileId: string): Promise<TelegramFile> {
  return call<TelegramFile>("getFile", { file_id: fileId });
}

/** Download raw file bytes from Telegram's file storage. */
export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  const url = `${API_BASE}/file/bot${token()}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    logger.warn("telegram: file download failed", { status: res.status });
    throw new TelegramApiError(res.status, "file download failed");
  }
  return res.arrayBuffer();
}
