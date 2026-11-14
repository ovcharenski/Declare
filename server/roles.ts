// Role priority per the Declare plan (§7):
//   tsar > operator > global_admin > moderator
const ROLE_PRIORITY: Record<string, number> = {
  tsar: 100,
  operator: 80,
  global_admin: 60,
  moderator: 40,
};

/** Badge id/slug from Vare → Declare admin role. */
const BADGE_TO_ROLE: Record<string, string> = {
  tsar: "tsar",
  global_admin: "global_admin",
  globaladmin: "global_admin",
  moderator: "moderator",
  operator: "operator",
  staff_operator: "operator",
  staff_moderator: "moderator",
  staff_global_admin: "global_admin",
  staff_tsar: "tsar",
};

export const ALLOWED_ROLES = ["operator", "moderator", "global_admin", "tsar"] as const;

function normalizeBadgeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extractBadgeKeys(badges: unknown): string[] {
  if (!badges) return [];
  if (Array.isArray(badges)) {
    return badges.flatMap((item) => {
      if (typeof item === "string") return [normalizeBadgeKey(item)];
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const key =
          o.id ?? o.slug ?? o.name ?? o.key ?? o.badge_id ?? o.badge;
        if (typeof key === "string") return [normalizeBadgeKey(key)];
      }
      return [];
    });
  }
  if (typeof badges === "object") {
    return Object.keys(badges as Record<string, unknown>).map(normalizeBadgeKey);
  }
  return [];
}

export function resolveRoleAndBadge(badges: unknown): {
  role: string;
  badgeName: string | null;
} {
  const keys = extractBadgeKeys(badges);
  let bestRole = "user";
  let bestBadgeName: string | null = null;
  let bestPriority = -1;

  for (const key of keys) {
    const role = BADGE_TO_ROLE[key];
    if (!role) continue;
    const priority = ROLE_PRIORITY[role] ?? 0;
    if (priority > bestPriority) {
      bestPriority = priority;
      bestRole = role;
      bestBadgeName = key;
    }
  }

  if (bestRole !== "user" && !bestBadgeName) {
    bestBadgeName = bestRole;
  }

  return { role: bestRole, badgeName: bestBadgeName };
}

export function isAllowedRole(role: string): boolean {
  return (ALLOWED_ROLES as readonly string[]).includes(role);
}

export function roleFromBadges(badges: unknown): string {
  return resolveRoleAndBadge(badges).role;
}
