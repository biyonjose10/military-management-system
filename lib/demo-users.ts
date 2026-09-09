import type { Role } from "@prisma/client";

/**
 * The eight demo accounts — two per role, at deliberately different echelons.
 *
 * Lives in lib/ rather than prisma/ because the login page lists them: a
 * portfolio demo whose whole point is "sign in as each role and watch the same
 * record render differently" is unusable if the reader has to read the seed
 * source to find the credentials.
 *
 * The password is here in plain text on purpose. These are fictional accounts
 * in a fictional brigade, and pretending otherwise would be theatre.
 */

export const DEMO_PASSWORD = "Bravo-Zulu-2026";

export type DemoUser = {
  email: string;
  name: string;
  role: Role;
  /** Designation of the unit they sit in. */
  unit: string;
  /** What this account is here to demonstrate. */
  demonstrates: string;
};

export const DEMO_USERS: DemoUser[] = [
  {
    email: "col.vance@example.mil",
    name: "COL A. Vance",
    role: "COMMANDER",
    unit: "3 IBCT",
    demonstrates: "Sees every soldier in the brigade. Reads medical detail, cannot write it.",
  },
  {
    email: "ltc.moreno@example.mil",
    name: "LTC R. Moreno",
    role: "COMMANDER",
    unit: "2-14 IN",
    demonstrates: "Same role one echelon down — their subtree only, nothing above it.",
  },
  {
    email: "maj.okonkwo@example.mil",
    name: "MAJ D. Okonkwo",
    role: "MEDICAL_OFFICER",
    unit: "3 IBCT",
    demonstrates: "The only role that may WRITE medical readiness. Cannot edit a roster.",
  },
  {
    email: "cpt.lindqvist@example.mil",
    name: "CPT S. Lindqvist",
    role: "MEDICAL_OFFICER",
    unit: "1-9 CAV",
    demonstrates: "Medical write authority confined to one battalion.",
  },
  {
    email: "cw2.petrov@example.mil",
    name: "CW2 M. Petrov",
    role: "QUARTERMASTER",
    unit: "3 IBCT",
    demonstrates: "Full equipment CRUD brigade-wide. Every service number masked.",
  },
  {
    email: "sfc.hendrix@example.mil",
    name: "SFC J. Hendrix",
    role: "QUARTERMASTER",
    unit: "2-14 IN / A",
    demonstrates: "Company-level supply. No medical access at all, not even read.",
  },
  {
    email: "sgt.calder@example.mil",
    name: "SGT P. Calder",
    role: "SQUAD_LEADER",
    unit: "2-14 IN / A / 1PLT / 1SQD",
    demonstrates: "One squad. Not the sibling squad, not the parent platoon.",
  },
  {
    email: "sgt.yarrow@example.mil",
    name: "SGT N. Yarrow",
    role: "SQUAD_LEADER",
    unit: "2-14 IN / A / 1PLT / 2SQD",
    demonstrates: "The sibling squad — the pair is what proves lateral segregation.",
  },
];
