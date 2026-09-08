/**
 * Loads .env.local for CLI scripts.
 *
 * Next.js does this automatically for the app; tsx and Prisma 7 do not. Prisma
 * dropped its built-in dotenv loading in v7, so prisma.config.ts calls this
 * before it reads DIRECT_URL.
 *
 * Existing environment variables always win, so CI can override without
 * editing files.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(root: string = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}
