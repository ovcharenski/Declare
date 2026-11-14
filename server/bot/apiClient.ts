import { config } from "../config";
import { logger } from "../logger";
import type {
  ClaimUpdate,
  ClaimUpdateResponse,
  SyncUser,
  SyncUserResponse,
  BotTagsResponse,
  BotCreateSuggestion,
  BotSuggestionResponse,
  Heartbeat,
} from "../../shared/bot";

/**
 * Client for the internal /api/bot/* endpoints (plan §4: the bot has no DB
 * access, only HTTP). Uses the shared service token.
 */

export class BotApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BotApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function baseUrl(): string {
  return config.telegram.apiUrl.replace(/\/$/, "");
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.botServiceToken}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    logger.warn("botApi: request failed", { method, path, error: String(err) });
    throw new BotApiError(0, "NETWORK", "Cannot reach app process");
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; retryAfterSec?: number; banEndsAt?: string };
  } & T;

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new BotApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `HTTP ${res.status}`,
      (data as { error?: { retryAfterSec?: number; banEndsAt?: string } }).error,
    );
  }

  return data as T;
}

export const botApi = {
  claimUpdate(input: ClaimUpdate): Promise<ClaimUpdateResponse> {
    return request("POST", "/api/bot/updates/claim", input);
  },
  syncUser(input: SyncUser): Promise<SyncUserResponse> {
    return request("POST", "/api/bot/users/sync", input);
  },
  getTags(): Promise<BotTagsResponse> {
    return request("GET", "/api/bot/tags");
  },
  createSuggestion(input: BotCreateSuggestion): Promise<BotSuggestionResponse> {
    return request("POST", "/api/bot/suggestions", input);
  },
  heartbeat(input: Heartbeat): Promise<{ ok: boolean }> {
    return request("POST", "/api/bot/heartbeat", input);
  },
};
