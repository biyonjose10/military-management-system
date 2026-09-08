import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * What this project puts in the token and the session.
 *
 * `tokenVersion` is mirrored onto the session because `requireViewer()` needs
 * it server-side and `auth()` hands back a Session, not the raw JWT. It is a
 * plain counter and discloses nothing on its own — its whole value is in being
 * COMPARED against the live `User` row, never in being read.
 */

declare module "next-auth" {
  interface User {
    role: Role;
    unitId: number;
    unitPath: string;
    tokenVersion: number;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      unitId: number;
      unitPath: string;
      tokenVersion: number;
    } & DefaultSession["user"];
  }
}

// The JWT interface actually lives in @auth/core/jwt; `next-auth/jwt` only
// re-exports it, so augmenting that path alone silently does nothing and every
// `token.role` comes back as `unknown`.
declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    unitId: number;
    unitPath: string;
    tokenVersion: number;
  }
}

export {};
