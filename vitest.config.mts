import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The generated Prisma client is a large module to transform on every run.
    fsModuleCache: true,
  },
});
