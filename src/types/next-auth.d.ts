import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    // Roles are per library, so they are resolved per request in lib/session.ts, not stored in the token.
    user: { id: string } & DefaultSession["user"];
  }
}
