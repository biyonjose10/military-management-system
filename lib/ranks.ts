import type { Rank, RankCategory } from "@prisma/client";

/**
 * Rank facts, in one place.
 *
 * `rankCategory` is stored on the row so rollups can group by it without a join
 * or a CASE expression, which makes it derived data — and derived data that two
 * modules compute independently eventually disagrees. The seed and the create
 * endpoint both call `categoryOf` here, and neither accepts a category from
 * outside: a client-supplied one could contradict the rank and quietly corrupt
 * every readiness breakdown that groups on it.
 */

export const OFFICER_RANKS: readonly Rank[] = [
  "SECOND_LIEUTENANT",
  "FIRST_LIEUTENANT",
  "CAPTAIN",
  "MAJOR",
  "LIEUTENANT_COLONEL",
  "COLONEL",
];

export const WARRANT_RANKS: readonly Rank[] = [
  "WARRANT_OFFICER_1",
  "CHIEF_WARRANT_OFFICER_2",
  "CHIEF_WARRANT_OFFICER_3",
  "CHIEF_WARRANT_OFFICER_4",
  "CHIEF_WARRANT_OFFICER_5",
];

export function categoryOf(rank: Rank): RankCategory {
  if (OFFICER_RANKS.includes(rank)) return "OFFICER";
  if (WARRANT_RANKS.includes(rank)) return "WARRANT";
  return "ENLISTED";
}

/** Short forms, as they appear on a roster. */
export const RANK_ABBREVIATIONS: Record<Rank, string> = {
  PRIVATE: "PVT",
  PRIVATE_FIRST_CLASS: "PFC",
  SPECIALIST: "SPC",
  CORPORAL: "CPL",
  SERGEANT: "SGT",
  STAFF_SERGEANT: "SSG",
  SERGEANT_FIRST_CLASS: "SFC",
  MASTER_SERGEANT: "MSG",
  FIRST_SERGEANT: "1SG",
  SERGEANT_MAJOR: "SGM",
  WARRANT_OFFICER_1: "WO1",
  CHIEF_WARRANT_OFFICER_2: "CW2",
  CHIEF_WARRANT_OFFICER_3: "CW3",
  CHIEF_WARRANT_OFFICER_4: "CW4",
  CHIEF_WARRANT_OFFICER_5: "CW5",
  SECOND_LIEUTENANT: "2LT",
  FIRST_LIEUTENANT: "1LT",
  CAPTAIN: "CPT",
  MAJOR: "MAJ",
  LIEUTENANT_COLONEL: "LTC",
  COLONEL: "COL",
};
