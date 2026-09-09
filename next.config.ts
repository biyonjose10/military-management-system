import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables `forbidden()` and `app/forbidden.tsx`. Without it a page that
    // refuses a viewer renders the generic error boundary as a 500, which is
    // both the wrong status and a worse message than "you may not see this".
    // Experimental in Next 16 — if it is ever removed, requirePageScope() in
    // lib/auth/session.ts is the single place that calls it.
    authInterrupts: true,
  },
  turbopack: {
    // Pin the workspace root to this directory. Without it, Turbopack walks up
    // and finds an unrelated package-lock.json in the parent folder, warns, and
    // guesses. Being explicit keeps local builds identical to CI.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
