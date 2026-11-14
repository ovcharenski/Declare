import type { AdminRole } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    oauth?: {
      state: string;
      codeVerifier: string;
    };
    admin?: {
      vareId: string;
      username: string;
      displayName: string;
      email: string;
      role: AdminRole;
      roleBadge: string | null;
      accessToken: string;
      refreshToken: string;
      accessTokenIssuedAt: number;
      lastRoleCheckAt: number;
    };
  }
}
