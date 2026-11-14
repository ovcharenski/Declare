import "dotenv/config";
import express, { type NextFunction, type Request, Response } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config, loadConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { errorHandler } from "./http/errors";
import { logger } from "./logger";

loadConfig();

const app = express();

app.set("trust proxy", 1);

const sessionMaxAge = 7 * 24 * 60 * 60 * 1000;
app.use(
  session({
    name: "declare.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      maxAge: sessionMaxAge,
    },
  }),
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: false }));

// Structured request logging (replaces the ad-hoc res.on('finish') logger).
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      logger.info("http", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    }
  });
  next();
});

(async () => {
  // Apply pending migrations at startup (idempotent).
  runMigrations();

  const server = await registerRoutes(app);

  // Unified error handler (must be registered after routes).
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      errorHandler(err, _req, res, _next);
    },
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = config.port;
  const host = config.host;

  server.listen({ port, host }, () => {
    log(`serving on http://${host}:${port}`);
  });
})();
