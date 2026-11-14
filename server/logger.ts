import { randomUUID } from "node:crypto";

/**
 * Lightweight structured JSON logger with secret redaction.
 *
 * Emits one JSON object per line to stdout (journald-friendly). Replaces the
 * ad-hoc `log()` from vite.ts with a redacting, level-aware logger. Kept
 * dependency-free per project decision (instead of pino).
 */

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// Any value under these keys (or containing these substrings) is redacted.
const SECRET_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "api_key",
  "apikey",
  "code_verifier",
  "access_token",
  "refresh_token",
];

function redactString(value: string): string {
  if (value.length <= 4) return "***";
  // Keep a short visible tail so distinct secrets remain distinguishable in
  // logs without leaking them.
  return "***" + value.slice(-4);
}

export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 8) return "[redacted:max-depth]";

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (SECRET_KEYS.some((s) => lower.includes(s))) {
        out[key] = redactString(String(val));
      } else {
        out[key] = redact(val, depth + 1);
      }
    }
    return out;
  }

  return value;
}

function safeSerialize(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

const threshold = resolveThreshold();

function resolveThreshold(): number {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw in LEVELS) return LEVELS[raw as LogLevel];
  return LEVELS.info;
}

function write(level: LogLevel, msg: string, data?: unknown): void {
  if (LEVELS[level] < threshold) return;

  const record: Record<string, unknown> = {
    level: LEVELS[level],
    time: new Date().toISOString(),
    msg,
  };

  if (data !== undefined) {
    record.data = redact(data);
  }

  const line = safeSerialize(record);
  if (level === "error" || level === "fatal") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  trace: (msg: string, data?: unknown) => write("trace", msg, data),
  debug: (msg: string, data?: unknown) => write("debug", msg, data),
  info: (msg: string, data?: unknown) => write("info", msg, data),
  warn: (msg: string, data?: unknown) => write("warn", msg, data),
  error: (msg: string, data?: unknown) => write("error", msg, data),
  fatal: (msg: string, data?: unknown) => write("fatal", msg, data),

  /** A child logger that always attaches a base context (e.g. `module`). */
  child(base: Record<string, unknown>) {
    const baseData = redact(base) as Record<string, unknown>;
    return {
      trace: (msg: string, data?: unknown) =>
        write("trace", msg, { ...baseData, ...(data as object) }),
      debug: (msg: string, data?: unknown) =>
        write("debug", msg, { ...baseData, ...(data as object) }),
      info: (msg: string, data?: unknown) =>
        write("info", msg, { ...baseData, ...(data as object) }),
      warn: (msg: string, data?: unknown) =>
        write("warn", msg, { ...baseData, ...(data as object) }),
      error: (msg: string, data?: unknown) =>
        write("error", msg, { ...baseData, ...(data as object) }),
      fatal: (msg: string, data?: unknown) =>
        write("fatal", msg, { ...baseData, ...(data as object) }),
    };
  },
};

/** Generate a correlation id for a request (kept dependency-free). */
export function requestId(): string {
  return randomUUID();
}
