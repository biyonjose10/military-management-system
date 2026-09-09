/**
 * The data the seed inserts, built as plain objects.
 *
 * Split out of seed.mts so it can be exercised without a database: seed.mts
 * opens a connection at import time, while the properties that actually matter
 * here — determinism, unique service numbers, a rank pyramid that reads like a
 * real establishment — are properties of the objects, not of the insert.
 *
 * Each builder creates its OWN seeded PRNG from a fixed constant rather than
 * drawing from a shared module-level one. A shared generator makes the output
 * depend on call order, so a test calling `buildPersonnel` twice would get two
 * different rosters and the determinism guarantee would be quietly false.
 *
 * **Everything is invented.** The names come from a fixed pool, the unit
 * designations are made up, the service numbers are generated. Nothing here
 * corresponds to a real person or a real formation.
 */

import type {
  EquipmentCategory,
  Prisma,
  Rank,
  RankCategory,
  ReadinessStatus,
  Role,
} from "@prisma/client";

export type Echelon = "BRIGADE" | "BATTALION" | "COMPANY" | "PLATOON" | "SQUAD";

export type SeededUnit = {
  id: number;
  designation: string;
  echelon: Echelon;
  path: string;
};

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32. Small, fast, and — the only property that matters here — seeded. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

const pick = <T,>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/**
 * Dates are measured from a fixed epoch, never from `new Date()`.
 *
 * A "days ago" computed from the wall clock changes every run, which would make
 * the seed non-deterministic in a way nobody notices until an E2E assertion
 * about a cleared-until date starts failing overnight.
 */
export const EPOCH = new Date("2026-09-01T00:00:00.000Z").getTime();
const daysAgo = (days: number): Date => new Date(EPOCH - days * 86_400_000);
const daysAhead = (days: number): Date => new Date(EPOCH + days * 86_400_000);

// ---------------------------------------------------------------------------
// Invented name pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Ada", "Bela", "Caleb", "Dara", "Eli", "Fiona", "Gus", "Hana", "Ines",
  "Jonah", "Kira", "Liam", "Mira", "Noor", "Omar", "Priya", "Quinn", "Rosa",
  "Sanjay", "Tomas", "Uma", "Vera", "Wes", "Xiomara", "Yusuf", "Zane",
  "Anders", "Brigid", "Casper", "Delia", "Emeka", "Freya", "Gideon", "Halima",
  "Ivo", "Juno", "Kaito", "Lena", "Marek", "Nadia", "Otto", "Pilar",
];

const LAST_NAMES = [
  "Abara", "Bexley", "Calder", "Dunmore", "Eskild", "Fenwick", "Garro",
  "Halloran", "Imrie", "Jessop", "Kalvane", "Lindqvist", "Moreno", "Nakamura",
  "Ostrand", "Petrov", "Quillon", "Ravensworth", "Sardis", "Torvik", "Ulrich",
  "Vance", "Whitlock", "Xanthos", "Yarrow", "Zelenko", "Ashgrove", "Brennan",
  "Cortez", "Dashwood", "Eriksen", "Falkner", "Gowda", "Hendrix", "Idowu",
  "Jaeger", "Kowalski", "Lefevre", "Mbeki", "Novak", "Okonkwo", "Prosser",
];

// ---------------------------------------------------------------------------
// Unit tree — 1 + 3 + 12 + 48 + 96 = 160
// ---------------------------------------------------------------------------

const BATTALIONS = [
  { designation: "2-14 IN", name: "2nd Battalion, 14th Infantry" },
  { designation: "1-9 CAV", name: "1st Battalion, 9th Cavalry" },
  { designation: "3-27 FA", name: "3rd Battalion, 27th Field Artillery" },
];

const COMPANY_LETTERS = ["A", "B", "C", "D"];

export type UnitNode = {
  designation: string;
  name: string;
  echelon: Echelon;
  children: UnitNode[];
};

/**
 * The order of battle, as data.
 *
 * seed.mts walks this to create rows and the test walks it to check the shape,
 * so there is one description of the hierarchy rather than two that can drift.
 * Designations are the natural key: they are what `upsert` matches on, which is
 * what makes re-seeding idempotent.
 */
export const UNIT_TREE: UnitNode = {
  designation: "3 IBCT",
  name: "3rd Infantry Brigade Combat Team",
  echelon: "BRIGADE",
  children: BATTALIONS.map((bn) => ({
    designation: bn.designation,
    name: bn.name,
    echelon: "BATTALION" as Echelon,
    children: COMPANY_LETTERS.map((letter) => ({
      designation: `${bn.designation} / ${letter}`,
      name: `${letter} Company, ${bn.name}`,
      echelon: "COMPANY" as Echelon,
      children: [1, 2, 3, 4].map((p) => ({
        designation: `${bn.designation} / ${letter} / ${p}PLT`,
        name: `${p} Platoon`,
        echelon: "PLATOON" as Echelon,
        children: [1, 2].map((sq) => ({
          designation: `${bn.designation} / ${letter} / ${p}PLT / ${sq}SQD`,
          name: `${sq} Squad`,
          echelon: "SQUAD" as Echelon,
          children: [],
        })),
      })),
    })),
  })),
};

/** Flattens the tree depth-first, assigning synthetic ids and paths. Used by tests. */
export function flattenTree(node: UnitNode = UNIT_TREE): SeededUnit[] {
  const out: SeededUnit[] = [];
  let nextId = 1;

  const walk = (n: UnitNode, parentPath: string | null): void => {
    const id = nextId;
    nextId += 1;
    const path = `${parentPath ?? "/"}${id}/`;
    out.push({ id, designation: n.designation, echelon: n.echelon, path });
    for (const child of n.children) walk(child, path);
  };

  walk(node, null);
  return out;
}

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------

const OFFICER_RANKS: Rank[] = [
  "SECOND_LIEUTENANT", "FIRST_LIEUTENANT", "CAPTAIN", "MAJOR",
  "LIEUTENANT_COLONEL", "COLONEL",
];

const WARRANT_RANKS: Rank[] = [
  "WARRANT_OFFICER_1", "CHIEF_WARRANT_OFFICER_2", "CHIEF_WARRANT_OFFICER_3",
  "CHIEF_WARRANT_OFFICER_4", "CHIEF_WARRANT_OFFICER_5",
];

export function categoryOf(rank: Rank): RankCategory {
  if (OFFICER_RANKS.includes(rank)) return "OFFICER";
  if (WARRANT_RANKS.includes(rank)) return "WARRANT";
  return "ENLISTED";
}

/**
 * Billets per echelon, written out rather than sampled from a distribution.
 *
 * A rank pyramid drawn at random produces platoons with four captains and no
 * privates. Fixing the establishment instead makes the roster read like a real
 * one, and the resulting mix lands where the brief asked: ~7.8% officer, ~1.7%
 * warrant, the rest enlisted.
 */
export const BILLETS: Record<Echelon, Rank[]> = {
  SQUAD: [
    "SERGEANT", "CORPORAL",
    "SPECIALIST", "SPECIALIST", "SPECIALIST",
    "PRIVATE_FIRST_CLASS", "PRIVATE_FIRST_CLASS", "PRIVATE", "PRIVATE",
  ],
  PLATOON: ["FIRST_LIEUTENANT", "SERGEANT_FIRST_CLASS", "SPECIALIST"],
  COMPANY: [
    "CAPTAIN", "FIRST_LIEUTENANT", "FIRST_SERGEANT", "STAFF_SERGEANT",
    "WARRANT_OFFICER_1", "SPECIALIST",
  ],
  BATTALION: [
    "LIEUTENANT_COLONEL", "MAJOR", "CAPTAIN", "CAPTAIN",
    "SERGEANT_MAJOR", "MASTER_SERGEANT",
    "CHIEF_WARRANT_OFFICER_2", "CHIEF_WARRANT_OFFICER_2",
    "SERGEANT", "SERGEANT", "SERGEANT", "SERGEANT",
  ],
  BRIGADE: [
    "COLONEL", "LIEUTENANT_COLONEL", "MAJOR", "MAJOR",
    "SERGEANT_MAJOR", "MASTER_SERGEANT", "MASTER_SERGEANT",
    "CHIEF_WARRANT_OFFICER_3",
    "STAFF_SERGEANT", "STAFF_SERGEANT", "STAFF_SERGEANT", "STAFF_SERGEANT",
  ],
};

const MEDICAL_NOTES = [
  "Grade II ankle sprain. No ruck marches until re-evaluated.",
  "Post-operative shoulder rehabilitation. Lifting restricted to 15kg.",
  "Awaiting dental clearance before deployment screening.",
  "Seasonal respiratory condition, managed. No restriction on field duty.",
  "Concussion protocol complete. Cleared for graduated return to training.",
];

function readinessFor(rng: Rng): ReadinessStatus {
  const roll = rng();
  if (roll < 0.85) return "DEPLOYABLE";
  if (roll < 0.95) return "LIMITED_DUTY";
  return "NON_DEPLOYABLE";
}

export function buildPersonnel(
  units: SeededUnit[],
): Prisma.PersonnelCreateManyInput[] {
  const rng = makeRng(0x4d4d5301); // "MMS\1"
  const rows: Prisma.PersonnelCreateManyInput[] = [];
  let sequence = 0;

  for (const unit of units) {
    for (const rank of BILLETS[unit.echelon]) {
      sequence += 1;

      const firstName = pick(rng, FIRST_NAMES);
      const lastName = pick(rng, LAST_NAMES);
      const readiness = readinessFor(rng);
      const slug = `${firstName}.${lastName}`.toLowerCase();

      // Unique by construction: the sequence number supplies the last four
      // digits, which is exactly the fragment the masking layer preserves.
      const serviceId = `${int(rng, 100, 999)}-${int(rng, 10, 99)}-${String(
        10000 + sequence,
      ).slice(-4)}`;

      rows.push({
        serviceId,
        firstName,
        lastName,
        rank,
        rankCategory: categoryOf(rank),
        unitId: unit.id,
        readiness,

        // Medical detail exists only where readiness says it should. A
        // deployable soldier carrying an open injury note is a contradiction
        // the dashboard would surface as a bug in the app.
        medicalNotes: readiness === "DEPLOYABLE" ? null : pick(rng, MEDICAL_NOTES),
        medicalClearedUntil:
          readiness === "LIMITED_DUTY" ? daysAhead(int(rng, 14, 120)) : null,
        lastPhysicalAt: daysAgo(int(rng, 20, 700)),

        phone: `+1-555-0${String(100 + (sequence % 900))}`,
        email: `${slug}.${sequence}@example.mil`,
        dateOfBirth: daysAgo(int(rng, 19, 45) * 365 + int(rng, 0, 364)),
        emergencyContactName: `${pick(rng, FIRST_NAMES)} ${lastName}`,
        emergencyContactPhone: `+1-555-1${String(100 + ((sequence * 7) % 900))}`,

        enlistedAt: daysAgo(int(rng, 90, 6000)),
        deployedUntil:
          readiness === "DEPLOYABLE" && rng() < 0.12
            ? daysAhead(int(rng, 30, 240))
            : null,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

const CATALOGUE: Record<EquipmentCategory, { name: string; nsn: string }[]> = {
  WEAPON: [
    { name: "Rifle, 5.56mm, M-series", nsn: "1005-01-231-0973" },
    { name: "Machine gun, 7.62mm, crew-served", nsn: "1005-01-025-8095" },
    { name: "Grenade launcher, 40mm", nsn: "1010-01-166-7616" },
  ],
  VEHICLE: [
    { name: "Light tactical vehicle, 4x4", nsn: "2320-01-107-7155" },
    { name: "Medium cargo truck, 5-ton", nsn: "2320-01-354-3025" },
    { name: "Trailer, cargo, 1.5-ton", nsn: "2330-01-372-5641" },
  ],
  COMMS: [
    { name: "Radio set, manpack, VHF", nsn: "5820-01-451-8250" },
    { name: "Antenna group, mast-mounted", nsn: "5985-01-359-0193" },
    { name: "Field telephone set", nsn: "5805-01-101-4415" },
  ],
  RATIONS: [
    { name: "Ration pack, individual, case of 12", nsn: "8970-01-372-2833" },
    { name: "Water purification unit, 125 gph", nsn: "4610-01-379-2698" },
    { name: "Field kitchen, containerised", nsn: "7360-01-473-2601" },
  ],
};

export const FAULTS = [
  "Scheduled 500-hour service.",
  "Hydraulic leak at the rear actuator.",
  "Failed pre-operation checks; battery will not hold charge.",
  "Corrosion on the antenna mount.",
  "Awaiting replacement part on back order.",
];

/** Which categories are held at which echelon — squads do not sign for trucks. */
const HOLDINGS: Partial<
  Record<Echelon, { category: EquipmentCategory; count: number }[]>
> = {
  SQUAD: [
    { category: "WEAPON", count: 4 },
    { category: "COMMS", count: 1 },
  ],
  COMPANY: [
    { category: "VEHICLE", count: 4 },
    { category: "RATIONS", count: 2 },
  ],
  BATTALION: [
    { category: "VEHICLE", count: 6 },
    { category: "COMMS", count: 4 },
    { category: "RATIONS", count: 4 },
  ],
  BRIGADE: [
    { category: "VEHICLE", count: 4 },
    { category: "RATIONS", count: 6 },
  ],
};

export function buildEquipment(
  units: SeededUnit[],
): Prisma.EquipmentCreateManyInput[] {
  const rng = makeRng(0x4551504d); // "EQPM"
  const rows: Prisma.EquipmentCreateManyInput[] = [];
  let sequence = 0;

  for (const unit of units) {
    for (const holding of HOLDINGS[unit.echelon] ?? []) {
      for (let i = 0; i < holding.count; i += 1) {
        sequence += 1;
        const item = pick(rng, CATALOGUE[holding.category]);

        const roll = rng();
        const status =
          roll < 0.86 ? "OPERATIONAL" : roll < 0.96 ? "IN_MAINTENANCE" : "DEADLINE";
        const lastServiced = daysAgo(int(rng, 10, 400));

        rows.push({
          serialNumber: `SN-${String(100000 + sequence)}`,
          nsn: item.nsn,
          name: item.name,
          category: holding.category,
          status,
          unitId: unit.id,
          acquiredAt: daysAgo(int(rng, 400, 4000)),
          lastServicedAt: lastServiced,
          nextServiceDueAt: new Date(lastServiced.getTime() + 180 * 86_400_000),
        });
      }
    }
  }

  return rows;
}

export function buildMaintenanceLogs(
  items: { id: string; status: "IN_MAINTENANCE" | "DEADLINE" }[],
): Prisma.MaintenanceLogCreateManyInput[] {
  const rng = makeRng(0x4d41494e); // "MAIN"
  return items.map((item) => ({
    equipmentId: item.id,
    status: item.status,
    openedAt: daysAgo(int(rng, 1, 60)),
    summary: pick(rng, FAULTS),
    technician: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    laborHours: int(rng, 1, 40),
  }));
}

// ---------------------------------------------------------------------------
// Demo users — two per role, at deliberately different echelons
// ---------------------------------------------------------------------------

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
