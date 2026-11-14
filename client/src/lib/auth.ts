export const SESSION_KEY = "declare-session";

export const ALLOWED_ROLES = [
  "moderator",
  "global_admin",
  "operator",
  "tsar",
] as const;

export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export type Session = {
  vareId: string;
  username: string;
  displayName?: string;
  email: string;
  role: string;
  roleBadge?: string | null;
};

export const isMockMode = import.meta.env.VITE_MOCK === "true";

export function isAllowedRole(role: string): role is AllowedRole {
  return (ALLOWED_ROLES as readonly string[]).includes(role);
}

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

type AuthMeResponse = {
  session: Session;
};

/** Hydrate client session from the server cookie (survives tab close). */
export async function restoreSessionFromServer(): Promise<Session | null> {
  if (isMockMode) return getSession();

  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthMeResponse;
    setSession(data.session);
    return data.session;
  } catch {
    return null;
  }
}

/** Return cached session or restore from server cookie when missing. */
export async function ensureAuthenticated(): Promise<Session | null> {
  const cached = getSession();
  if (cached) return cached;
  return restoreSessionFromServer();
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("401:");
}

/** Clear client session and open the login page (e.g. expired cookie). */
export function redirectToLogin(navigate: (path: string) => void): void {
  clearSession();
  navigate("/login");
}

export const ROLE_LABELS: Record<string, string> = {
  operator: "Operator",
  moderator: "Moderator",
  global_admin: "Global Administrator",
  tsar: "Tsar",
  user: "User",
};
