import { z } from "zod";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = [
  "operator",
  "moderator",
  "global_admin",
  "tsar",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

// ---------------------------------------------------------------------------
// Admin session (Vare OAuth)
// ---------------------------------------------------------------------------

export const adminSessionSchema = z.object({
  vareId: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  role: z.enum(ADMIN_ROLES),
  roleBadge: z.string().optional(),
});

export type AdminSession = z.infer<typeof adminSessionSchema>;

// ---------------------------------------------------------------------------
// Common / pagination
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z.object({
  suggestionsPerHour: z.number().int().min(0).max(1000),
  suggestionsPerDay: z.number().int().min(0).max(10000),
  minIntervalSeconds: z.number().int().min(0).max(86400),
  duplicateWindowMinutes: z.number().int().min(0).max(10080),
  botEnabled: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = settingsSchema.partial();
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const tagSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  suggestionsCount: z.number().int(),
  archivedAt: z.string().nullable(),
});

export type TagDto = z.infer<typeof tagSchema>;

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const reorderTagsSchema = z.object({
  ids: z.array(z.number().int()).min(1),
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const SUGGESTION_STATUSES = [
  "new",
  "in_review",
  "accepted",
  "rejected",
  "archived",
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_TYPES = ["text", "photo", "video"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export const suggestionStatusSchema = z.enum(SUGGESTION_STATUSES);
export const suggestionTypeSchema = z.enum(SUGGESTION_TYPES);

export const listSuggestionsSchema = paginationSchema.extend({
  tagIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  status: suggestionStatusSchema.optional(),
  type: suggestionTypeSchema.optional(),
  userId: z.coerce.number().int().positive().optional(),
  q: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["created_at", "user", "tag"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListSuggestions = z.infer<typeof listSuggestionsSchema>;

export const updateSuggestionStatusSchema = z.object({
  status: suggestionStatusSchema,
  moderationNote: z.string().max(2000).nullable().optional(),
});

export const replySchema = z.object({
  text: z.string().trim().min(1).max(4096),
});
