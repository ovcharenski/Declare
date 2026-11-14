import { z } from "zod";
import { suggestionTypeSchema } from "./schema";

// ---------------------------------------------------------------------------
// Internal bot <-> backend API DTOs (plan §11 "Bot (внутренние)").
// These are consumed by the grammY bot via /api/bot/* and produced by the
// backend. The backend trusts only the service token (see requireBotToken).
// ---------------------------------------------------------------------------

/** POST /api/bot/updates/claim */
export const claimUpdateSchema = z.object({
  updateId: z.number().int().positive(),
});
export type ClaimUpdate = z.infer<typeof claimUpdateSchema>;

export const claimUpdateResponseSchema = z.object({
  duplicate: z.boolean(),
});
export type ClaimUpdateResponse = z.infer<typeof claimUpdateResponseSchema>;

/** POST /api/bot/users/sync */
export const syncUserSchema = z.object({
  telegramId: z.number().int().positive(),
  username: z.string().max(255).nullable().optional(),
  firstName: z.string().max(255).default(""),
  lastName: z.string().max(255).nullable().optional(),
  languageCode: z.string().max(16).nullable().optional(),
});
export type SyncUser = z.infer<typeof syncUserSchema>;

export const syncUserResponseSchema = z.object({
  user: z.object({
    id: z.number(),
    telegramId: z.number(),
    username: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    languageCode: z.string().nullable(),
  }),
  banned: z.boolean(),
  ban: z
    .object({
      reason: z.string(),
      endsAt: z.string().nullable(),
    })
    .nullable(),
});
export type SyncUserResponse = z.infer<typeof syncUserResponseSchema>;

/** GET /api/bot/tags */
export const botTagSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type BotTag = z.infer<typeof botTagSchema>;

export const botTagsResponseSchema = z.object({
  tags: z.array(botTagSchema),
});
export type BotTagsResponse = z.infer<typeof botTagsResponseSchema>;

/** POST /api/bot/suggestions */
export const botCreateSuggestionSchema = z.object({
  telegramId: z.number().int().positive(),
  tagId: z.number().int().positive(),
  type: suggestionTypeSchema,
  text: z.string().max(4096).nullable().optional(),
  idempotencyKey: z.string().min(1).max(255),
  telegramMessageId: z.number().int().positive().optional(),
  // Media files received via Telegram. Backend resolves file metadata and
  // downloads content itself using these file_ids.
  media: z
    .array(
      z.object({
        kind: z.enum(["photo", "video"]),
        fileId: z.string().min(1),
        fileUniqueId: z.string().nullable().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        durationSec: z.number().int().positive().optional(),
        sizeBytes: z.number().int().positive().optional(),
        mimeType: z.string().optional(),
      }),
    )
    .max(10)
    .default([]),
});
export type BotCreateSuggestion = z.infer<typeof botCreateSuggestionSchema>;

export const botSuggestionResponseSchema = z.object({
  suggestion: z.object({
    id: z.number(),
    status: z.string(),
    dedupeKey: z.string(),
  }),
  alreadyExists: z.boolean(),
});
export type BotSuggestionResponse = z.infer<typeof botSuggestionResponseSchema>;

/** POST /api/bot/heartbeat */
export const heartbeatSchema = z.object({
  version: z.string().max(64).optional(),
});
export type Heartbeat = z.infer<typeof heartbeatSchema>;
