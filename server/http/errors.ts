import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger";

/**
 * Unified API error format (plan §11):
 *   { "error": { "code": "...", "message": "...", "details": [] } }
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DUPLICATE"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  details: unknown[];

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details: unknown[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function badRequest(message: string, details: unknown[] = []): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, "CONFLICT", message);
}

/**
 * Express error handler middleware. Renders ApiError as the unified JSON
 * envelope, ZodError as a VALIDATION_ERROR, and anything else as a safe 500
 * (without leaking internal details).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json(err.toJSON());
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // Some libraries throw objects with status/statusCode.
  const e = err as { status?: number; statusCode?: number; message?: string };
  const status = e.status || e.statusCode || 500;

  if (status >= 500) {
    logger.error("unhandled error", { message: e.message, status });
  }

  res.status(status).json({
    error: {
      code: "INTERNAL_ERROR",
      message: status >= 500 ? "Internal Server Error" : (e.message || "Error"),
      details: [],
    },
  });
}

/** Wrap an async route handler so rejections reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
