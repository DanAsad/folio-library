import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is personalised (roles, loans, holds), so we use the
  // classic dynamic rendering model instead of Cache Components.
  cacheComponents: false,
  // PGlite ships a WASM build of Postgres that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
