# MMS — Military Management System

A personnel-readiness, equipment-logistics and chain-of-command access-control dashboard.

**This is a portfolio demonstration. Every soldier, unit, serial number and medical record in it
is invented.** It is not an accredited system and does not claim to be one. The access-control
model is implemented properly because that is the entire point of the exercise.

<!-- Screenshots: add after the first deploy. -->

---

## The one idea

Most access-control bugs are not exotic. They are a `findMany()` with no `where`, a field masked in
JSX while the real value still rides along in the JSON, a permission checked in the redirect and
nowhere else. So the goal here was not "add authorization" — it was to make **the insecure version
hard to write by accident**.

Five layers. Four of them are real boundaries, and the first one deliberately is not:

| Layer | Enforces | A boundary? |
| --- | --- | --- |
| `proxy.ts` | session cookie present → redirect | **No** — convenience only |
| `requireViewer()` | identity, `active`, `tokenVersion` revocation | Yes |
| `requirePermission()` / `canWriteField()` | the role matrix, per field | Yes |
| repository + branded `Scope` | row-level unit scoping, soft delete | Yes |
| `toPersonnelDTO()` / `toEquipmentDTO()` | field-level PII masking | Yes |

The acceptance criterion for `proxy.ts` is that **deleting it must not let anyone read anything
new**. An API client that ignores redirects hits exactly the same walls.

### Unscoped queries do not compile

Prisma has no row-level security, so the realistic failure is a route handler querying the whole
roster. That is prevented structurally rather than by review:

- `lib/db/client.ts` is the only module that constructs a `PrismaClient`, and it exports it as
  **`prismaUnsafe`** — the name is the documentation.
- An ESLint rule bans importing it from anywhere but `lib/db/**`, so a violation is a build
  failure. A second test scans source text, because lint is skippable and the consequence is the
  entire brigade's roster.
- Every repository function takes a **`Scope`** as its first argument. `Scope` is a branded type
  whose only constructor is `resolveScope(viewer)`, so there is no way to query without having
  said who is asking — and no way to forget, because it does not typecheck.

### Masking happens before the wire, not in the component

A field masked in JSX still ships its real value inside the RSC payload — one devtools tab away.
So masking lives at serialization, and `test/masking.test.ts` asserts on `JSON.stringify` of the
response rather than on rendered output. A withheld field is *present* and marked withheld with a
reason, never omitted: an empty cell claims the soldier has no next of kin, which is a different
and wrong statement.

### Rank and permission are different axes

The rule the whole project exists to demonstrate:

> A **Commander** outranks a **Medical Officer**, sees every soldier in the brigade, and **may not
> set anyone's deployability.** Declaring a soldier non-deployable is a medical judgement.
> Conversely the Medical Officer may write that field and **may not rename a soldier.**

Both directions are enforced per field, before anything is written, and both are tested.

### An unaudited write cannot exist

Every mutation runs its scope check, its write and its audit insert in **one transaction**. If the
audit row fails, the change rolls back. The honest cost: audit availability becomes write
availability.

The trail records **which fields changed, never what they changed to.** Storing values would make
the audit viewer a complete bypass of every masking rule elsewhere — the most tempting mistake in
the design, and the one that looks like an improvement when someone makes it.

---

## Running it

Node 22. No Docker, no Postgres install, no cloud account.

### First time

```bash
npm install
cp .env.example .env.local          # set AUTH_SECRET; the PGlite URLs already work

npm run db:up                       # terminal 1 — leave it running
npm run db:push                     # terminal 2 — apply the schema
npm run db:seed                     #             160 units, 1,128 personnel, 604 items, 8 users
npm run dev                         #             http://localhost:3000
```

### Every time after that

Two terminals, and the database has to come up first or the app errors on its
first query. `.pglite/` is a real Postgres data directory on disk, so the seeded
data survives a reboot — there is no need to push or seed again.

```bash
npm run db:up                       # terminal 1 — leave it running
npm run dev                         # terminal 2 — http://localhost:3000
```

Use `npm run build && npm start` instead of `npm run dev` to serve the
production build.

The database is **PGlite** — Postgres compiled to WebAssembly, served over the real Postgres wire
protocol, so Prisma connects to it as an ordinary server. Real Postgres matters here: the schema
uses enums and a `String[]` column that SQLite would have flattened into strings.

Moving to a hosted Postgres (Neon and the like) is two lines of `.env.local` and nothing else.

### Adding records

Two roles can write new rows from the browser, and only those two:

| Page | Who sees the form | What it creates |
| --- | --- | --- |
| `/personnel` | Commander | A soldier, in any unit at or below their own |
| `/equipment` | Quartermaster | An item on the property book, unissued |

The unit dropdown is filled from `/api/units`, which returns only the units in
the viewer's scope — a squad leader's list has exactly one entry.

Hiding the button is presentation. The boundary is `requirePermission()` inside
`POST /api/personnel` and `POST /api/equipment`, so a Quartermaster who posts to
the personnel endpoint by hand gets a 403 naming the rule, not a record. Every
create lands in the audit trail as a CREATE against the account that made it.

The personnel form has no readiness control on purpose: a Commander may read
deployability and may not set it, so a new soldier starts Deployable and the
Medical Officer decides otherwise.

### Demo accounts

Password for all of them: `Bravo-Zulu-2026`. The login page lists them too.

| Account | Role | Demonstrates |
| --- | --- | --- |
| `col.vance@example.mil` | Commander | Whole brigade. Reads medical detail, cannot write it |
| `ltc.moreno@example.mil` | Commander | Same role one echelon down — subtree only, nothing above |
| `maj.okonkwo@example.mil` | Medical Officer | The only role that may set deployability. Cannot edit a roster |
| `cpt.lindqvist@example.mil` | Medical Officer | Same authority, confined to one battalion |
| `cw2.petrov@example.mil` | Quartermaster | Full equipment CRUD. Every service number masked |
| `sfc.hendrix@example.mil` | Quartermaster | Company supply. No medical access at all, not even read |
| `sgt.calder@example.mil` | Squad Leader | One squad — not the sibling squad, not the parent platoon |
| `sgt.yarrow@example.mil` | Squad Leader | The sibling squad; the pair proves lateral segregation |

**The demo worth doing:** open the same soldier as `col.vance` and then as `cw2.petrov`. Same
record, same endpoint, different payload.

---

## Verifying it

```bash
npm run verify      # invariants that compare two artefacts meant to agree
npm test            # 100 unit tests, none of which needs a database
npm run e2e         # 3 Playwright tests through a real browser
npm run typecheck && npm run lint && npm run build
```

CI runs all of it, starting PGlite as a background step rather than a service container.

The tests that matter are not coverage decoration. Each is a rule someone will eventually be
tempted to "simplify":

- **`test/policy.test.ts`** — the full role × resource × action grid, including the deliberate case
  that a Commander cannot set deployability.
- **`test/scope.test.ts`** — a battalion at `/1/4/` must not match its neighbour at `/1/40/`. Unit
  paths are terminated at both ends precisely so that prefix collision cannot silently widen a
  commander's scope.
- **`test/masking.test.ts`** — asserts on the serialized payload, and separately that a field
  marked masked does not still carry the real value.
- **`test/no-direct-prisma.test.ts`** — scans source text for the unscoped client, and includes a
  positive control so that a green run means "no offenders" rather than "the pattern matches
  nothing".
- **`e2e/segregation.spec.ts`** — signs in as a squad leader in a real browser and requests another
  squad's soldier by id. Expects **404, not 403**: a 403 confirms the record exists, and an
  attacker who can tell the difference can enumerate a roster they were never allowed to see.

`npm run verify` covers what tests cannot — it compares the Prisma schema against the masking
layer, so **adding a Personnel column that nobody classifies as public, PII or medical fails the
build.** A new `homeAddress` that nobody thought about would otherwise ship in the clear.

---

## Stack

Next.js 16 (App Router) · TypeScript · Prisma 7 · PGlite / Postgres · NextAuth v5 (credentials +
JWT) · Zod 4 · TanStack Query · Tailwind v4 · shadcn/ui · Recharts · Vitest · Playwright

Colour is reserved for status. Everything structural is greyscale, so a roster reads as data rather
than decoration — and no status is ever carried by colour alone.

## Notes

- Seed data is generated from a **fixed-seed PRNG**, never `Math.random()`, so the E2E assertions
  refer to a soldier who is still there on the next run.
- Deletion is always soft. The row survives so the audit entries referencing it keep meaning
  something, and `npm run verify` fails if equipment is left signed out to a deleted person.
- `CLAUDE.md` carries the implementation notes and the traps worth not rediscovering.
