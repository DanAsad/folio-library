import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, type Role } from "@/lib/db/schema";
import { DEMO_LOGINS } from "@/lib/db/seed";

/** `false` turns off demo resets (the nightly job and the button in Library settings). */
export const DEMO_MODE = process.env.DEMO_MODE !== "false";

const PROVIDER = "demo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Sign-in is limited to the pre-made demo accounts: one per role, no passwords, no sign-up.
  providers: [
    Credentials({
      id: PROVIDER,
      name: "Demo account",
      credentials: { role: { label: "Role", type: "text" } },
      async authorize(credentials) {
        const email = DEMO_LOGINS[String(credentials?.role ?? "member") as Role];
        if (!email) return null;
        const db = await getDb();
        const user = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (!user?.isDemo) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-only-insecure-secret-change-me-in-production" : undefined),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user, account }) {
      if (user && account) {
        // Sign-in: store who it is and how they signed in.
        token.uid = user.id;
        token.provider = account.provider;
      }
      // Sessions from anything but a demo account (e.g. the old GitHub sign-in) are no longer valid.
      // The account itself is checked against the database on every request in getCurrentUser().
      return token.uid && token.provider === PROVIDER ? token : null;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
