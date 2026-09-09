/**
 * Row-level scoping, as a type the compiler can enforce.
 *
 * `Scope` is a branded type with exactly one constructor, `resolveScope()`.
 * Repository functions take a `Scope` as their first argument, so
 * `listPersonnel({ unitId: 3 })` is not a runtime bug to be caught in review —
 * it does not compile. An unscoped query has nowhere to come from.
 *
 * Pure by design: no database, no request, no Prisma runtime. `Viewer` is
 * assembled by `lib/auth/session.ts`, which does the database work of proving
 * the identity is real, active and not revoked; by the time a `Viewer` exists,
 * every claim on it has already been checked against the row.
 */

import type { Prisma, Role } from "@prisma/client";

/**
 * An authenticated, verified identity.
 *
 * Every field here was read from the `User` row on this request — none of it is
 * taken from the JWT. The token's copies of `role` and `unitPath` exist only so
 * `proxy.ts` can redirect without a database round-trip, and a redirect is not
 * a security boundary.
 */
export type Viewer = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  readonly unitId: number;
  /** Slash-terminated materialized path of the viewer's own unit, "/1/4/12/". */
  readonly unitPath: string;
  /** Human-readable designation of that unit, for badges and audit labels. */
  readonly unitDesignation: string;
};

declare const scopeBrand: unique symbol;

export type Scope = {
  readonly viewer: Viewer;
  readonly unitId: number;
  readonly unitPath: string;
  /**
   * True when the viewer sees their own unit and nothing below it. Squad
   * leaders are the only such role: a squad has no subtree worth walking, and
   * the narrower rule is the one that fails safe if the hierarchy is edited.
   */
  readonly ownUnitOnly: boolean;
  readonly [scopeBrand]: true;
};

/** Roles whose visibility stops at their own unit rather than their subtree. */
const OWN_UNIT_ONLY: ReadonlySet<Role> = new Set<Role>(["SQUAD_LEADER"]);

/**
 * The only way to obtain a `Scope`.
 *
 * Throws on a malformed path rather than returning a scope that silently
 * matches too much: `startsWith("/1/4")` — no trailing slash — also matches
 * "/1/40/", quietly handing a company commander a different battalion. The
 * invariant is cheap to assert and expensive to discover in production.
 */
export function resolveScope(viewer: Viewer): Scope {
  assertWellFormedPath(viewer.unitPath);

  return {
    viewer,
    unitId: viewer.unitId,
    unitPath: viewer.unitPath,
    ownUnitOnly: OWN_UNIT_ONLY.has(viewer.role),
  } as Scope;
}

export function assertWellFormedPath(path: string): void {
  if (!/^\/(\d+\/)+$/.test(path)) {
    throw new Error(
      `Malformed unit path ${JSON.stringify(path)}. Paths must be slash-delimited ` +
        `and slash-terminated at both ends, e.g. "/1/4/12/".`,
    );
  }
}

/**
 * The `where` fragment every scoped read must include.
 *
 * Covers two things at once, because forgetting either has the same shape of
 * consequence: the unit restriction, and the soft-delete filter. A separated
 * "and remember to add deletedAt" would be forgotten exactly once.
 */
export function scopeWhere(scope: Scope): {
  deletedAt: null;
  unitId?: number;
  unit?: { path: { startsWith: string } };
} {
  return scope.ownUnitOnly
    ? { deletedAt: null, unitId: scope.unitId }
    : { deletedAt: null, unit: { path: { startsWith: scope.unitPath } } };
}

/** Same restriction for Units themselves, which have no `deletedAt`. */
export function unitScopeWhere(scope: Scope): Prisma.UnitWhereInput {
  return scope.ownUnitOnly
    ? { id: scope.unitId }
    : { path: { startsWith: scope.unitPath } };
}

/**
 * Pure predicate mirroring `scopeWhere`, for tests and for the rare in-memory
 * check. Kept in the same file as the query fragment so the two cannot drift
 * without someone noticing them sitting next to each other.
 */
export function isWithinScope(scope: Scope, unit: { id: number; path: string }): boolean {
  return scope.ownUnitOnly
    ? unit.id === scope.unitId
    : unit.path.startsWith(scope.unitPath);
}
