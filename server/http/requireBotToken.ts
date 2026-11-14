import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { unauthorized, forbidden } from "./errors";

/**
 * Service-token guard for internal /api/bot/* endpoints (plan §11). The bot
 * process authenticates with `Authorization: Bearer BOT_SERVICE_TOKEN`.
 */
export function requireBotToken(req: Request, res: Response, next: NextFunction): void {
  const token = config.botServiceToken;
  if (!token) {
    next(forbidden("Bot service token not configured"));
    return;
  }

  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== token) {
    next(unauthorized("Invalid bot service token"));
    return;
  }

  next();
}
