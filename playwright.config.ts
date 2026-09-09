import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for the segregation spec.
 *
 * Port 3111 rather than 3000 so a run cannot silently attach to whatever the
 * developer already has open on the default port — a spec that asserts "9
 * records" against somebody else's half-migrated database is worse than no
 * spec, because it fails for a reason that has nothing to do with the code.
 *
 * The suite needs a seeded database. PGlite is started separately with
 * `npm run db:up`; it is not spawned here because it holds a directory lock on
 * ./.pglite and a second instance racing the one already running is a much
 * more confusing failure than "connection refused".
 */
export default defineConfig({
  testDir: "./e2e",

  /**
   * One worker, no parallelism.
   *
   * `npm run db:up` starts PGlite with --max-connections=10, and the dev
   * server's Prisma pool plus this suite's own client already sit inside that
   * budget. Parallel workers each open a browser context that drives more
   * connections, and the failure mode is an intermittent "sorry, too many
   * clients already" that reads like an application bug.
   */
  workers: 1,
  fullyParallel: false,

  reporter: process.env.CI ? "list" : "line",
  timeout: 60_000,

  use: {
    baseURL: "http://localhost:3111",
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "npm run dev -- --port 3111",
    // /login rather than / — the root redirects, and waiting on a route that
    // actually renders proves the server compiled rather than merely bound.
    url: "http://localhost:3111/login",
    reuseExistingServer: true,
    // Next dev compiles on first request; a cold start here is routinely 30s.
    timeout: 120_000,
  },
});
