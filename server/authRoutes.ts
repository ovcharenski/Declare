import type { Express, Request, Response } from "express";
import { config, vareProfileUrl } from "./config";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchProfile,
  generatePkce,
  generateState,
  refreshTokens,
  resolveUsername,
  resolveVareId,
} from "./vare";
import { resolveRoleAndBadge, isAllowedRole } from "./roles";
import { requireAdmin } from "./http/requireAdmin";
import { adminsRepo, auditRepo } from "./repositories";
import { logger } from "./logger";

/** How often (ms) the server re-checks the Vare role/badges (§6). */
const ROLE_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Access token TTL guard — refresh before it expires (§6, 15 min). */
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/vare/login", (req, res) => {
    if (config.isMock) {
      res.redirect("/login");
      return;
    }
    const { codeVerifier, codeChallenge } = generatePkce();
    const state = generateState();
    req.session.oauth = { state, codeVerifier };
    res.redirect(buildAuthorizeUrl(state, codeChallenge));
  });

  app.get("/auth/vare/callback", async (req, res) => {
    const oauthError = req.query.error as string | undefined;
    if (oauthError === "access_denied") {
      res.redirect("/login?error=denied");
      return;
    }

    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const pending = req.session.oauth;

    if (!code || !state || !pending || state !== pending.state) {
      res.redirect("/login?error=oauth");
      return;
    }

    const tokens = await exchangeCodeForTokens(code, pending.codeVerifier);
    delete req.session.oauth;

    if (!tokens?.access_token) {
      res.redirect("/login?error=oauth");
      return;
    }

    const profile = await fetchProfile(tokens.access_token);
    if (!profile) {
      res.redirect("/login?error=oauth");
      return;
    }

    const vareId = resolveVareId(profile, tokens.access_token);
    if (!vareId) {
      res.redirect("/login?error=oauth");
      return;
    }

    const username = resolveUsername(profile);
    const { role, badgeName: roleBadge } = resolveRoleAndBadge(profile.badges);

    if (!isAllowedRole(role)) {
      res.redirect("/access-denied");
      return;
    }

    const displayName = profile.name?.trim() || username;

    // Persist the admin identity (§6: upsert into admins) and record the login
    // in the audit log. Refresh token is stored server-side in the session.
    try {
      adminsRepo().upsert({
        id: vareId,
        username,
        display_name: displayName,
        email: profile.email ?? null,
        avatar_url: profile.avatar_url ?? null,
        role: role as never,
        role_badge: roleBadge,
      });

      auditRepo().write({
        admin_id: vareId,
        action: "auth.login",
        entity_type: "admin",
        entity_id: vareId,
        details: { role, badge: roleBadge, username },
        ip: clientIp(req),
        user_agent: req.get("user-agent") ?? null,
      });
    } catch (err) {
      logger.error("auth: failed to persist admin/audit", { error: String(err) });
    }

    req.session.admin = {
      vareId,
      username,
      displayName,
      email: profile.email ?? "",
      role: role as never,
      roleBadge,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? "",
      accessTokenIssuedAt: Date.now(),
      lastRoleCheckAt: Date.now(),
    };

    res.redirect("/");
  });

  app.get("/api/auth/me", async (req, res) => {
    const admin = req.session.admin;
    if (!admin) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Refresh the access token if it is close to expiry (§6, 15 min TTL).
    await ensureFreshAccessToken(req);

    // Periodically re-check the Vare role/badges (§6, ≤ every 5 minutes).
    await recheckRole(req);

    const current = req.session.admin;
    if (!current) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    res.json({
      session: {
        vareId: current.vareId,
        username: current.username,
        displayName: current.displayName,
        email: current.email,
        role: current.role,
        roleBadge: current.roleBadge,
      },
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const admin = req.session.admin;

    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: "Logout failed" });
        return;
      }

      // Record logout in the audit log (best-effort, after session destroy).
      if (admin) {
        try {
          auditRepo().write({
            admin_id: admin.vareId,
            action: "auth.logout",
            entity_type: "admin",
            entity_id: admin.vareId,
            ip: clientIp(req),
            user_agent: req.get("user-agent") ?? null,
          });
        } catch (e) {
          logger.error("auth: failed to write logout audit", { error: String(e) });
        }
      }

      res.clearCookie("declare.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/me/profile", requireAdmin, (req, res) => {
    const admin = req.session.admin!;
    res.json({
      vareId: admin.vareId,
      username: admin.username,
      displayName: admin.displayName,
      email: admin.email,
      role: admin.role,
      roleBadge: admin.roleBadge,
      vareProfileUrl: vareProfileUrl(admin.username),
    });
  });
}

/**
 * Refresh the access token when it is near expiry (§6). On failure the session
 * is destroyed so the next request sends the user back to /login.
 */
async function ensureFreshAccessToken(req: Request): Promise<void> {
  const admin = req.session.admin;
  if (!admin) return;

  const issuedAt = admin.accessTokenIssuedAt ?? admin.lastRoleCheckAt;
  const age = Date.now() - issuedAt;
  if (age < ACCESS_TOKEN_TTL_MS - 60_000) return; // still fresh

  if (!admin.refreshToken) {
    // No refresh token — can't renew, but keep the session until it fails.
    return;
  }

  const tokens = await refreshTokens(admin.refreshToken);
  if (!tokens?.access_token) {
    logger.warn("auth: token refresh failed, destroying session", {
      vareId: admin.vareId,
    });
    await destroySession(req);
    return;
  }

  req.session.admin = {
    ...admin,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? admin.refreshToken,
    accessTokenIssuedAt: Date.now(),
  };
}

/**
 * Re-check the Vare role/badges at most once per ROLE_RECHECK_INTERVAL_MS.
 * If the badge was revoked, the session is destroyed (access closed).
 */
async function recheckRole(req: Request): Promise<void> {
  const admin = req.session.admin;
  if (!admin) return;

  const last = admin.lastRoleCheckAt ?? 0;
  if (Date.now() - last < ROLE_RECHECK_INTERVAL_MS) return;

  const profile = await fetchProfile(admin.accessToken);
  if (!profile) {
    logger.warn("auth: role re-check profile fetch failed", {
      vareId: admin.vareId,
    });
    return; // transient error — keep session, retry next time
  }

  const { role, badgeName } = resolveRoleAndBadge(profile.badges);
  if (!isAllowedRole(role)) {
    logger.warn("auth: role revoked, destroying session", {
      vareId: admin.vareId,
      role,
    });
    await destroySession(req);
    return;
  }

  req.session.admin = {
    ...admin,
    role: role as never,
    roleBadge: badgeName,
    lastRoleCheckAt: Date.now(),
  };

  // Persist the refreshed role to the admins table.
  try {
    adminsRepo().updateRole(admin.vareId, role as never, badgeName);
  } catch (err) {
    logger.error("auth: failed to persist role re-check", { error: String(err) });
  }
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
}
