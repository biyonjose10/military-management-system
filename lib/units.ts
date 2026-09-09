/**
 * Materialized-path helpers.
 *
 * Pure and dependency-free so the seed, `npm run verify` and any future
 * re-parenting routine all derive paths the same way. Two implementations of
 * this rule would eventually disagree, and the symptom of disagreement is a
 * commander quietly seeing a unit that is not theirs.
 */

export const ROOT_PATH = "/";

/** The path of a unit with the given id under the given parent path. */
export function childPath(parentPath: string | null, id: number): string {
  return `${parentPath ?? ROOT_PATH}${id}/`;
}

/**
 * Paths are slash-delimited AND slash-terminated at both ends.
 *
 * The termination is not cosmetic: `"/1/4".startsWith("/1/4")` is also true of
 * `"/1/40"`, so an unterminated path silently widens a battalion commander's
 * scope to include a neighbouring battalion whose id happens to share a prefix.
 */
export function isWellFormedPath(path: string): boolean {
  return /^\/(\d+\/)+$/.test(path);
}

/** Ancestor ids, outermost first. `"/1/4/12/"` -> `[1, 4, 12]`. */
export function pathIds(path: string): number[] {
  return path.split("/").filter(Boolean).map(Number);
}
