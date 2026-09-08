import "server-only";

import { auth } from "@/lib/auth/config";
import { can, type Action, type Resource } from "@/lib/auth/policy";
import { resolveScope, type Scope, type Viewer } from "@/lib/auth/scope";
import { loadViewer } from "@/lib/db/repositories/users";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * The request-time half of the security core.
 *
 * `proxy.ts` redirects an unauthenticated browser to /login, and that is a
 * convenience, not a boundary — an API client that ignores redirects sails
 * straight past it. Everything real starts here.
 *
 * The order matters and is always the same:
 *
 *   requireViewer()      is this a live, non-revoked identity?   -> 401
 *   requirePermission()  may this role do this at all?           -> 403
 *   repository + Scope   may they do it to THIS row?             -> 404
 *   toPersonnelDTO()     which fields may they see of it?
 */

/**
 * Proves the caller is who the token says, against the database, on every
 * request.
 *
 * A stateless JWT stays valid until it expires no matter what happens to the
 * account behind it. Re-reading the row is what gives it a revocation point:
 * `active` false or a bumped `tokenVersion` and the session is over on the next
 * request. `unitPath` is re-read at the same time, so a unit re-parenting takes
 * effect immediately rather than at the next sign-in.
 */
export async function requireViewer(): Promise<Viewer> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();

  // tokenVersion comes from the signed token via the session callback; the
  // signature is what makes it trustworthy as an INPUT to the comparison. It
  // is never the answer — loadViewer() rejects the session unless the live
  // User row still carries the same number.
  const viewer = await loadViewer(session.user.id, session.user.tokenVersion);
  if (!viewer) throw new UnauthorizedError("Session is no longer valid.");

  return viewer;
}

/** The verified identity plus its row-level scope. What repositories take. */
export async function requireScope(): Promise<Scope> {
  return resolveScope(await requireViewer());
}

/**
 * Role-level gate. Throws rather than returning a boolean so that forgetting to
 * check the result is not a way to pass the check.
 */
export function requirePermission(
  viewer: Viewer,
  resource: Resource,
  action: Action,
): void {
  if (!can(viewer.role, resource, action)) {
    throw new ForbiddenError(
      `Role ${viewer.role} may not ${action} ${resource}.`,
    );
  }
}

/** Convenience for the common "authenticate, then check one permission" opening. */
export async function requireScopeWith(
  resource: Resource,
  action: Action,
): Promise<Scope> {
  const viewer = await requireViewer();
  requirePermission(viewer, resource, action);
  return resolveScope(viewer);
}
