import type { Request } from "express";
import type { ZodType } from "zod";
import { badRequest } from "./errors";

/**
 * Parse and validate request body against a Zod schema. On failure throws a
 * VALIDATION_ERROR (caught by the error middleware); on success returns the
 * typed, parsed value.
 */
export function validateBody<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw badRequest("Validation failed", details);
  }
  return result.data;
}

/** Parse and validate URL query params against a Zod schema. */
export function validateQuery<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw badRequest("Invalid query parameters", details);
  }
  return result.data;
}
