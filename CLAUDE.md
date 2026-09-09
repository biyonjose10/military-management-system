@AGENTS.md

# MMS — Military Management System

**Status: Personnel and Equipment modules working against a live local database.**

A personnel-readiness / equipment-logistics / RBAC admin dashboard. **Portfolio-demo project with
entirely fictional data** — realistic security model, no accreditation claims, no real personnel data.

The full approved design lives at
`C:\Users\biyon\.claude\plans\mission-brief-military-melodic-tulip.md`.
It carries the reasoning, the rejected alternatives, and a "Corrections applied during
implementation" section at the end that supersedes parts of the body.

## The one idea everything serves

The insecure path must be impossible to write by accident. Five enforcement layers, each a real
boundary; anything enforced only in `proxy.ts` or only in a component is a bug.

| Layer | Enforces | Security boundary? |
| --- | --- | --- |
| `proxy.ts` | cookie present → redirect | **No** — UX only |
| `requireViewer()` | identity, `active`, `tokenVersion` revocation | Yes |
| `requirePermission()` / `canWriteField()` | the RBAC matrix, per field | Yes |
| repository + branded `Scope` | row-level unit scoping + soft delete | Yes |
| `toPersonnelDTO()` | field-level PII masking | Yes |

## The database — no longer blocked

Local development runs **PGlite**: Postgres compiled to WASM, served over the real Postgres wire
protocol by `@electric-sql/pglite-socket`, so `@prisma/adapter-pg` talks to it as an ordinary
server. No account, no installer, no admin rights, no Docker.

```
npm run db:up      # starts it on 127.0.0.1:5433, leave running
npm run db:push    # apply the schema (see the migrate caveat below)
npm run db:seed    # idempotent; re-running inserts nothing
npm run verify     # all 8 invariants
```

`.env.local` already points at it. **Swapping in Neon later is two lines of `.env.local` and
nothing else** — the pooled URL for `DATABASE_URL`, the unpooled one for `DIRECT_URL`.

Two PGlite limitations, both local-only and both real:
- `prisma migrate dev` needs a **shadow database** and PGlite has exactly one, so local schema
  changes go through `db push`. `prisma/migrations/0_init/migration.sql` is generated via
  `migrate diff` and kept for a hosted Postgres.
- `prisma migrate resolve` also fails against it. Do not try to fix this; use a real Postgres
  when migration history starts to matter.

## Hard-won facts — do not regress these

- **`proxy.ts`, NOT `middleware.ts`.** Next 16 renamed it
  (`node_modules/next/dist/docs/.../proxy.md:806`). It defaults to the **Node.js runtime**, and
  `export const runtime` in a proxy file **throws** (`proxy.md:255`). Most model output is stale here.
- Proxy still must not touch the database — `authentication.md:1033`: it runs on every route
  *including prefetches*. Acceptance criterion: **deleting `proxy.ts` must not let anyone read
  anything new.**
- **Prisma 7 requires a driver adapter.** `new PrismaClient()` no longer reads `DATABASE_URL`;
  it needs `@prisma/adapter-pg` + `pg`. Not in the original pinned set — added 2026-09-08.
- **`prisma@latest` is `8.0.0-rc.13`, a release candidate.** Both packages pinned to `7.10.0`.
  Never `npm i prisma@latest` here. The two remaining `npm audit` highs (`deepmerge-ts`,
  `mysql2`) are inside the Prisma **CLI** devDependency and ship nowhere.
- **The JWT interface lives in `@auth/core/jwt`.** `next-auth/jwt` only re-exports it, so
  augmenting that path alone silently leaves every `token.role` typed `unknown`.
- **The package is CommonJS**, so tsx refuses top-level `await` in a `.ts` file. `scripts/verify.mts`,
  `prisma/seed.mts`, `prisma/fixtures.mts` and `vitest.config.mts` are `.mts` for that reason, and
  cross-imports between them must be written `./fixtures.mjs` (extensionless does not resolve).
- **No Visual Studio on this machine** → `node-gyp` fails → `bcryptjs`, never `bcrypt`/`argon2`.
- **`shadcn init` rewrites `app/globals.css`.** Already run (`radix` base, `nova` preset); the house
  token set is now layered on top, aliasing `--background`/`--foreground`/`--border`/`--ring` onto
  `--bg`/`--ink`/`--line`. Do not re-run `init`.
- `AuditLog` stores changed field **names, never values**. Storing values makes the audit viewer a
  complete bypass of the masking layer.
- Zod patch schemas are `.strict()` so a forbidden field returns **403 naming the field** rather
  than a silent drop — a silent drop is indistinguishable from a save that worked.
- Seed uses a **fixed-seed PRNG**, never `Math.random()`, and each builder makes its own so output
  does not depend on call order.
- The Prisma client is behind a **Proxy and built on first use**. An eager client made `next build`
  fail with no `DATABASE_URL`. Methods are bound to the real client so `$transaction` does not
  re-enter the trap with the wrong receiver.

## What exists

```
proxy.ts                     cookie-only redirect gate
app/(auth)/login/            server-action sign-in, lists the 8 demo accounts
app/(app)/layout.tsx         shell: nav filtered by can(), role + unit badges
app/(app)/personnel/         roster with readiness rollup; record detail
app/api/personnel/           GET list / POST, and GET / PATCH / DELETE by id
lib/auth/policy.ts           the RBAC matrix + field groups. PURE
lib/auth/scope.ts            branded Scope, resolveScope(), scopeWhere(). PURE
lib/auth/session.ts          requireViewer / requirePermission / requireScopeWith
lib/auth/config.ts           NextAuth v5 credentials + JWT
lib/db/client.ts             prismaUnsafe — the only PrismaClient, lint-locked
lib/db/repositories/         personnel.ts, users.ts — every fn takes a Scope first
lib/dto/personnel.ts         toPersonnelDTO — where masking happens
lib/audit/log.ts             entry builder + diff + client IP. PURE
lib/ranks.ts lib/units.ts    shared derived-data helpers. PURE
lib/dto/mask.ts              the masking primitives, shared by both DTOs
lib/dto/equipment.ts         toEquipmentDTO — masks the ASSIGNEE's service number
lib/db/repositories/equipment.ts  + openMaintenance / closeMaintenance
app/(app)/equipment/         property book with status rollup; item detail
app/api/equipment/           list / create / detail / patch / soft delete
app/api/.../maintenance      open a fault; close one at /api/maintenance/[id]/close
prisma/fixtures.mts          the seed's rows as plain objects. No DB. PURE
prisma/seed.mts              160 units / 1,128 personnel / 604 items / 8 users
scripts/verify.mts           invariant gate; DB checks skip loudly without a URL
test/                        95 tests, all green, none needs a database
```

Verified green on 2026-09-09: `typecheck`, `lint`, `test` (95), `verify` (8/8 invariants),
`next build` (14 routes + proxy).

## Verified by hand, in a browser, against real data

- `sgt.calder` (squad leader) sees exactly 9 records — own squad, not the sibling squad, not the
  parent platoon. Every service number masked to its last four.
- Requesting a sibling squad's soldier by id returns **404 from both the page and the API**. Not
  403, which would confirm the record exists.
- `cw2.petrov` (quartermaster) sees 604 items brigade-wide with assignees rendered as
  `SPC Calder ••••0418` — name for accountability, service number withheld.

## Still to do

1. `e2e/segregation.spec.ts` — automate the two checks above, which are currently only verified
   by hand. Needs `npx playwright install`.
2. The recharts command dashboard.
3. An audit-log viewer. The trail is written on every mutation but nothing reads it yet, and
   `can(COMMANDER, "audit", "read")` is already true.
4. CI mirroring crucible's `verify → test → typecheck → lint → build`, and the `scan-secrets`
   pre-commit hook. CI needs `db:up` as a service step before `verify`.
5. No git remote yet — pushing needs a decision on repo visibility.

## Commands

```
npm run dev          npm run build         npm run lint
npm run typecheck    npm test              npm run verify
npm run db:migrate   npm run db:seed       npm run db:studio
```
