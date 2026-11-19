import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, users, type Role } from "@/lib/db/schema";
import { DEMO_USERS } from "@/lib/db/seed";

export const DEMO_MODE = process.env.DEMO_MODE !== "false";

export const ssoProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
};

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const providers: NextAuthConfig["providers"] = [];
if (ssoProviders.google) providers.push(Google);
if (ssoProviders.github) providers.push(GitHub);
if (DEMO_MODE) {
  // One-click demo accounts so reviewers can try every role without an SSO account.
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo account",
      credentials: { role: { label: "Role", type: "text" } },
      async authorize(credentials) {
        const role = String(credentials?.role ?? "member") as Role;
        const demo = DEMO_USERS.find((u) => u.role === role);
        if (!demo) return null;
        const db = await getDb();
        const user = await db.query.users.findFirst({ where: eq(users.email, demo.email) });
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-only-insecure-secret-change-me-in-production" : undefined),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "demo") return true;
      if (!user.email) return false;
      // SSO: create the library account on first sign-in.
      const db = await getDb();
      const email = user.email.toLowerCase();
      const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!existing) {
        const role: Role = adminEmails.includes(email) ? "admin" : "member";
        const [created] = await db
          .insert(users)
          .values({ email, name: user.name, image: user.image, role })
          .returning();
        await db.insert(activity).values({
          actorId: created.id,
          action: "user.join",
          subjectUserId: created.id,
          message: `${created.name ?? email} joined via ${account?.provider ?? "SSO"}`,
        });
      } else {
        await db
          .update(users)
          .set({
            name: existing.name ?? user.name,
            image: user.image ?? existing.image,
            role: adminEmails.includes(email) ? "admin" : existing.role,
          })
          .where(eq(users.id, existing.id));
      }
      return true;
    },
    async jwt({ token, user }) {
      const db = await getDb();
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (!email) return null;
      // Re-read the role on every request so an admin's role change applies immediately.
      const dbUser = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!dbUser) return null;
      token.uid = dbUser.id;
      token.role = dbUser.role;
      token.name = dbUser.name;
      token.picture = dbUser.image;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
