import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { promises as fs } from "fs";
import path from "path";
import { registerAuthRoutes } from "./authRoutes";
import { registerBotRoutes } from "./modules/bot/botRoutes";
import { getDb } from "./db/connection";
import { heartbeatRepo } from "./repositories/heartbeat";
import { logger } from "./logger";
import packageJson from "../package.json";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerBotRoutes(app);

  app.get("/locales/:lang/:ns.json", async (req, res) => {
    try {
      const { lang, ns } = req.params;
      if (lang !== "ru" && lang !== "en") {
        res.status(404).json({ error: "Translation file not found" });
        return;
      }
      const filePath = path.join(
        process.cwd(),
        "public",
        "locales",
        lang,
        `${ns}.json`,
      );
      const content = await fs.readFile(filePath, "utf-8");
      res.json(JSON.parse(content));
    } catch {
      res.status(404).json({ error: "Translation file not found" });
    }
  });

  app.get("/api/health", (_req, res) => {
    let dbOk = true;
    try {
      getDb().prepare("SELECT 1").get();
    } catch (err) {
      dbOk = false;
      logger.error("health: database check failed", { error: String(err) });
    }

    const heartbeat = heartbeatRepo(getDb()).ageSeconds(90_000);

    res.json({
      status: dbOk ? "healthy" : "degraded",
      timestamp: Math.floor(Date.now() / 1000),
      version: packageJson.version ?? "unknown",
      database: dbOk ? "ok" : "error",
      bot: {
        online: heartbeat.online,
        lastSeenSecondsAgo: heartbeat.ageSeconds,
      },
    });
  });

  return createServer(app);
}
