import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./src"),
      // `server-only` throws when imported outside a React Server Component build.
      "server-only": here("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Each file gets its own in-memory Postgres; booting it and migrating takes a moment.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
