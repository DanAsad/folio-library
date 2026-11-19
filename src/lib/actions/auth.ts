"use server";

import { signIn, signOut } from "@/auth";
import type { Role } from "@/lib/db/schema";

export async function demoSignIn(role: Role) {
  await signIn("demo", { role, redirectTo: "/dashboard" });
}

export async function ssoSignIn(provider: "google" | "github") {
  await signIn(provider, { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
