import "dotenv/config";
import { Bot, type Context } from "grammy";
import { config, loadConfig } from "../config";
import { logger } from "../logger";
import { registerHandlers } from "./handlers";
import { botApi } from "./apiClient";
import { sweepSessions } from "./session";
import { runMigrations } from "../db/migrate";
import { getDb } from "../db/connection";
import packageJson from "../../package.json";

/**
 * Bot process entry (plan §4, §10). Runs as a separate systemd unit, talks to
 * Telegram via long polling, and to the app via /api/bot/*. It owns the FSM
 * dialogue and does not touch SQLite directly — but it opens the DB only to
 * apply migrations at startup (shared schema), matching the app's behaviour.
 */

loadConfig();

if (!config.telegram.botToken) {
  logger.fatal("bot: TELEGRAM_BOT_TOKEN is not configured");
  process.exit(1);
}
if (!config.botServiceToken) {
  logger.fatal("bot: BOT_SERVICE_TOKEN is not configured");
  process.exit(1);
}

// Apply pending migrations (idempotent) so schema exists before the app is
// called. The app also runs these; both are safe.
try {
  runMigrations();
} catch (err) {
  logger.fatal("bot: migrations failed", { error: String(err) });
  process.exit(1);
}
void getDb();

const bot = new Bot(config.telegram.botToken);

bot.catch((err) => {
  logger.error("bot: unhandled error", { error: String(err.error ?? err) });
});

// Claim update deduplication before processing (plan §10).
bot.use(async (ctx, next) => {
  if (ctx.update.update_id) {
    try {
      const { duplicate } = await botApi.claimUpdate({
        updateId: ctx.update.update_id,
      });
      if (duplicate) {
        logger.debug("bot: duplicate update skipped", {
          updateId: ctx.update.update_id,
        });
        return;
      }
    } catch (err) {
      logger.warn("bot: update claim failed", { error: String(err) });
      // Continue anyway; claim failures shouldn't block the dialogue.
    }
  }
  await next();
});

registerHandlers(bot);

// Heartbeat every 30s (plan §10). Dashboard shows online/offline (90s threshold).
const heartbeat = setInterval(() => {
  botApi
    .heartbeat({ version: packageJson.version ?? "unknown" })
    .catch((err) => {
      logger.warn("bot: heartbeat failed", { error: String(err) });
    });
}, 30_000);
heartbeat.unref?.();

// Sweep expired FSM sessions every minute.
const sweeper = setInterval(() => {
  const removed = sweepSessions();
  if (removed > 0) logger.debug("bot: swept sessions", { removed });
}, 60_000);
sweeper.unref?.();

logger.info("bot: starting long polling");
bot.start({
  onStart: (info) => {
    logger.info("bot: polling started", {
      username: info.username,
    });
  },
});

async function shutdown(): Promise<void> {
  clearInterval(heartbeat);
  clearInterval(sweeper);
  await bot.stop();
  logger.info("bot: stopped");
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
