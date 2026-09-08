@AGENTS.md

# MMS — Military Management System

**Status: SCAFFOLD ONLY. No application code written yet.** Paused 2026-09-08 mid-build.

A personnel-readiness / equipment-logistics / RBAC admin dashboard. **Portfolio-demo project with
entirely fictional data** — realistic security model, no accreditation claims, no real personnel data.

The full approved design lives at
`C:\Users\biyon\.claude\plans\mission-brief-military-melodic-tulip.md`.
**Read it before writing any code** — it carries the reasoning, the rejected alternatives, and a
"Corrections applied during implementation" section at the end that supersedes parts of the body.

## The one idea everything serves

The insecure path must be impossible to write by accident. Four enforcement layers, each a real
boundary; anything enforced only in `proxy.ts` or only in a component is a bug.

| Layer | Enforces | Security boundary? |
| --- | --- | --- |
| `proxy.ts` | cookie present → redirect | **No** — UX only |
| `requireViewer()` | identity, active, `tokenVersion` revocation | Yes |
| `requirePermission()` | the RBAC matrix | Yes |
| repository + branded `Scope` | row-level unit scoping + soft delete | Yes |
| `toPersonnelDTO()` | field-level PII masking | Yes |

## Hard-won facts — do not regress these

- **`proxy.ts`, NOT `middleware.ts`.** Next 16 renamed it. Verified in
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:806`.
  It defaults to the **Node.js runtime**, and `export const runtime` in a proxy file **throws**.
  Every tutorial and most model output will be stale on this.
- Proxy still must not touch the database — `01-app/02-guides/authentication.md:1033`: it runs on
  every route *including prefetches*, so read only the cookie.
- **`prisma@latest` is `8.0.0-rc.13`, a release candidate.** Both `prisma` and `@prisma/client` are
  pinned to `7.10.0`. Never run `npm i prisma@latest` here.
- **This machine has no Visual Studio**, so `node-gyp` native builds fail. Hashing is `bcryptjs`
  (pure JS) — not `bcrypt`, not `argon2`.
- **`@types/node` had to go to `^22`**; vitest 5 refuses the scaffold's `^20`.
- **Run `shadcn init` BEFORE authoring `app/globals.css`** — it rewrites that file. `globals.css`
  is currently still the create-next-app default and must be replaced with the crucible token set
  (near-monochrome dark, colour reserved for status, tabular numerals).
  `npx shadcn@4.21.0 init --yes` — note `--base-color` is **not** a valid flag in 4.21.0.
- `AuditLog` stores changed field **names, never values**. Storing values would make the audit
  viewer a complete bypass of the masking layer.
- Zod patch schemas are `.strict()` so a forbidden field returns **403 naming the field** rather
  than silently dropping it — a silent drop looks like a successful save that never happened.
- Seed must use a **fixed-seed PRNG**, never `Math.random()`; the E2E masking tests assert on
  specific seeded values.

## Done so far

- `create-next-app` 16.3.4 — App Router, TypeScript, Tailwind v4, ESLint, **no `src/`**,
  `@/*` alias, Turbopack.
- All dependencies installed and pinned (see `package.json`).

## Next steps, in order

1. `npx shadcn@4.21.0 init --yes`, then replace `app/globals.css` with the crucible token set,
   aliasing shadcn's `--background`/`--foreground`/`--border`/`--ring` names onto the house
   `--bg`/`--ink`/`--line` tokens inside `@theme inline`.
2. Copy `tsconfig.json` + `eslint.config.mjs` from `../crucible` verbatim; add `turbopack.root`
   to `next.config.ts` (sibling lockfiles confuse Next's root inference).
3. `prisma/schema.prisma` — all six models in migration 1 (`User`, `Unit`, `Personnel`,
   `Equipment`, `MaintenanceLog`, `AuditLog`), so logistics needs no second destructive migration.
4. **BLOCKED — needs the user's Neon `DATABASE_URL`.** Then `prisma migrate dev --name init`.
5. `prisma/seed.ts` — 160 units / ~1,128 personnel / 8 demo users, deterministic and idempotent.
6. `lib/auth/policy.ts` (pure), `lib/auth/scope.ts` (branded `Scope`), `lib/auth/session.ts`.
7. `lib/db/client.ts` (exports `prismaUnsafe` only), `lib/db/repositories/personnel.ts`.
8. `lib/dto/personnel.ts`, `lib/audit/`, then the API routes and the Personnel UI.

## Blocking dependency

Step 4 onward needs a free Neon Postgres project and its pooled `DATABASE_URL` plus an unpooled
`DIRECT_URL` for migrations. Nothing DB-backed can run until the user supplies these.

## Commands

```
npm run dev        # next dev
npm run build
npm run lint
```
Scripts for `typecheck` / `test` / `verify` / `db:*` are not wired yet — they come with step 2 and 3.
