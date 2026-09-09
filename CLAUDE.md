@AGENTS.md

# MMS — Military Management System

**Status: Personnel slice code-complete. Nothing has ever run against a database.**

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

## Blocking dependency — the only thing stopping the next step

A free Neon Postgres project: the pooled `DATABASE_URL` (host contains `-pooler`) and the
unpooled `DIRECT_URL`. Put both in `.env.local` (see `.env.example`), then:

```
npm run db:migrate -- --name init
npm run db:seed
npm run verify        # its 5 database invariants stop skipping
```

`.env.local` already exists with a working `AUTH_SECRET` and no database URLs.

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
prisma/fixtures.mts          the seed's rows as plain objects. No DB. PURE
prisma/seed.mts              160 units / 1,128 personnel / ~640 items / 8 users
scripts/verify.mts           invariant gate; DB checks skip loudly without a URL
test/                        84 tests, all green, none needs a database
```

Verified green on 2026-09-09: `typecheck`, `lint`, `test` (84), `verify` (3 static ok, 5 skipped),
`next build` (8 routes + proxy).

## Still to do

1. **Neon URLs**, then migrate + seed + `verify` (above). Nothing below can be trusted until then.
2. `e2e/segregation.spec.ts` — sign in as `sgt.calder@example.mil`, request a soldier from
   `2SQD` by id, expect 404 rather than a rendered record.
3. Equipment / logistics module — reuse `Scope`, the repository shape and the audit machinery.
4. The recharts command dashboard.
5. CI mirroring crucible's `verify → test → typecheck → lint → build`, and the `scan-secrets`
   pre-commit hook.
6. No git remote yet — pushing needs a decision on repo visibility.

## Commands

```
npm run dev          npm run build         npm run lint
npm run typecheck    npm test              npm run verify
npm run db:migrate   npm run db:seed       npm run db:studio
```
