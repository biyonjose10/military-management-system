import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { findForSignIn, recordSignIn } from "@/lib/db/repositories/users";

/**
 * NextAuth v5, credentials + JWT.
 *
 * No database adapter: with `strategy: "jwt"` no session rows are persisted, so
 * the only thing the auth layer reads is the `User` table. Swapping in an OAuth
 * provider later touches this file and nothing else — the authorization model
 * downstream never learns how the identity was established.
 *
 * What the token carries and why: `role` and `unitPath` are in there so
 * `proxy.ts` could make coarse redirect decisions without a database round-trip.
 * They are **never** trusted as authorization. `requireViewer()` re-reads both
 * from the live row on every request; see lib/auth/session.ts.
 */

/**
 * A real bcrypt hash of a value nobody knows, compared against when the email
 * does not exist. Without it, "no such user" returns in a millisecond while a
 * wrong password takes ~80ms, and the difference enumerates valid accounts.
 */
const DUMMY_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await findForSignIn(email);

        // Always spend the bcrypt round, even with no user, so the response
        // time does not distinguish "wrong password" from "no such account".
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !ok) return null;

        // A deactivated account fails here rather than at the first request,
        // so the user gets "invalid credentials" instead of a session that
        // mysteriously 401s on every page.
        if (!user.active) return null;

        await recordSignIn(user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          unitId: user.unitId,
          unitPath: user.unitPath,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      // `user` is present only on the sign-in request. Auth.js types `id` as
      // optional because adapter users may not have one yet; ours always does,
      // and a token without a uid is useless to requireViewer() anyway.
      if (user?.id) {
        token.uid = user.id;
        token.role = user.role;
        token.unitId = user.unitId;
        token.unitPath = user.unitPath;
        token.tokenVersion = user.tokenVersion;
      }
      return token;
    },

    session({ session, token }) {
      // Mirrored so client components can render a role badge, and so
      // requireViewer() can reach tokenVersion at all — auth() returns a
      // Session, not the raw JWT. None of these values authorize anything;
      // requireViewer() re-reads every one of them from the User row.
      session.user.id = token.uid;
      session.user.role = token.role;
      session.user.unitId = token.unitId;
      session.user.unitPath = token.unitPath;
      session.user.tokenVersion = token.tokenVersion;
      return session;
    },
  },
});
