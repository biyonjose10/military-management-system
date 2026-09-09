import "server-only";

import { prismaUnsafe } from "@/lib/db/client";
import type { Viewer } from "@/lib/auth/scope";

/**
 * The only two user queries in the system, and the only repository functions in
 * the project that do NOT take a `Scope`.
 *
 * That exemption is deliberate and narrow: both run *before* a viewer exists.
 * `findForSignIn` is the credentials check itself, and `loadViewer` is what
 * turns a token into the identity every other scope is derived from. Neither
 * returns anything about other people, so there is no unit boundary to cross.
 *
 * Every other repository takes a `Scope` first and cannot be called without one.
 */

/** The row the credentials provider needs. Includes the hash — never leaves this layer. */
export async function findForSignIn(email: string) {
  return prismaUnsafe.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      unitId: true,
      unitPath: true,
      passwordHash: true,
      active: true,
      tokenVersion: true,
    },
  });
}

/**
 * Re-reads the identity behind a token on every authenticated request.
 *
 * The JWT is stateless, so without this a deactivated account keeps working
 * until its token expires and a compromised one cannot be revoked at all. Two
 * conditions are checked against the live row:
 *
 *   - `active` — deactivation takes effect on the next request, not at expiry.
 *   - `tokenVersion` — incrementing it invalidates every token already issued.
 *
 * `unitPath` is re-read here rather than trusted from the token, so a unit
 * re-parenting takes effect immediately instead of at the next sign-in.
 * Returns null for anything that fails, with no distinction between causes —
 * the caller's only correct response to all of them is the same.
 */
export async function loadViewer(
  userId: string,
  tokenVersion: number,
): Promise<Viewer | null> {
  const user = await prismaUnsafe.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      unitId: true,
      active: true,
      tokenVersion: true,
      unit: { select: { path: true, designation: true } },
    },
  });

  if (!user || !user.active || user.tokenVersion !== tokenVersion) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    unitId: user.unitId,
    unitPath: user.unit.path,
    unitDesignation: user.unit.designation,
  };
}

export async function recordSignIn(userId: string): Promise<void> {
  await prismaUnsafe.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}
