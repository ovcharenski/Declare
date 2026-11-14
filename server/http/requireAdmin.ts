import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "./errors";

/**
 * Admin authentication guard (plan §7): all authenticated admins share the
 * same rights, so this is the only server-side authorization check needed.
 * Sends 401 when there is no active admin session.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.admin) {
    next(unauthorized("Authentication required"));
    return;
  }
  next();
}
