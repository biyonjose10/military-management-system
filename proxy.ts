import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * A redirect, not a security boundary.
 *
 * Acceptance criterion for this file: **deleting it must not let anyone read
 * anything new.** All it does is send a browser with no session cookie to the
 * login page instead of rendering a shell that would 401 a moment later. Every
 * real check lives in `requireViewer()`, `requirePermission()`, the repositories
 * and the DTO — an API client that ignores redirects reaches exactly the same
 * walls.
 *
 * Two Next 16 facts that most references get wrong:
 *
 *   - The file is `proxy.ts`. `middleware.ts` was renamed in v16
 *     (node_modules/next/dist/docs/.../proxy.md:806).
 *   - It defaults to the Node.js runtime, and `export const runtime` in this
 *     file *throws* (proxy.md:255). So it technically COULD reach Prisma.
 *
 * It still must not. Proxy runs on every request including prefetches
 * (.../authentication.md:1033), so a database round-trip here multiplies load
 * across routes nobody is actually visiting. The cookie is read, nothing else,
 * and its contents are not even decoded — presence is all a redirect needs.
 */

/** Auth.js v5 cookie names. The `__Secure-` prefix is used over HTTPS. */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Round-trip the destination so a deep link survives the detour.
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Page navigations only.
   *
   * `/api/**` is excluded deliberately. A redirect is the right answer for a
   * browser that has wandered to a page it is not signed in for; it is the
   * wrong answer for a JSON client, which would otherwise receive a 307 to an
   * HTML login form instead of the 401 it can actually act on. Route handlers
   * authenticate themselves through `requireViewer()` and answer in JSON —
   * which they must do regardless, since this file is not a boundary.
   *
   * Static assets are excluded because without a matcher this also runs on
   * `_next/static` and redirects the CSS.
   */
  matcher: [
    "/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
