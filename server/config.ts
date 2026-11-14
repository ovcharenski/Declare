function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeScopes(raw: string): string {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export const config = {
  isMock: process.env.MOCK === "true",
  port: parseInt(process.env.PORT || "5784", 10),
  host: process.env.HOST || "127.0.0.1",
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  nodeEnv: process.env.NODE_ENV || "development",
  vare: {
    webClientUrl: "",
    apiBaseUrl: "",
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    scopes: "openid profile email badges avatar name",
  },
  botServiceToken: "",
  databasePath: process.env.DATABASE_PATH || "./data/declare.db",
  mediaDir: process.env.MEDIA_DIR || "./data/media",
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    apiUrl: process.env.BOT_API_URL || "http://127.0.0.1:5784",
  },
  mediaLimits: {
    maxPhotoMb: parseInt(process.env.MAX_PHOTO_MB || "10", 10),
    maxVideoMb: parseInt(process.env.MAX_VIDEO_MB || "20", 10),
  },
};

export function loadConfig(): void {
  config.botServiceToken = process.env.BOT_SERVICE_TOKEN || "";
  config.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN || "";

  if (config.isMock) {
    // Mock mode: Vare OAuth is skipped; dev login is used instead.
    return;
  }

  config.vare = {
    webClientUrl: requireEnv("VARE_WEB_CLIENT_URL").replace(/\/$/, ""),
    apiBaseUrl: requireEnv("VARE_API_BASE_URL").replace(/\/$/, ""),
    clientId: requireEnv("VARE_CLIENT_ID"),
    clientSecret: requireEnv("VARE_CLIENT_SECRET"),
    redirectUri: requireEnv("VARE_REDIRECT_URI"),
    scopes: normalizeScopes(
      process.env.VARE_SCOPES || "openid profile email badges avatar name",
    ),
  };

  config.botServiceToken = requireEnv("BOT_SERVICE_TOKEN");
}

export function vareProfileUrl(username: string): string {
  if (!config.vare.webClientUrl) return "";
  return `${config.vare.webClientUrl}/u/${encodeURIComponent(username)}`;
}
