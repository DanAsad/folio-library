"use client";

import { useTransition, useState } from "react";
import { BookUser, Crown, Library, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoSignIn } from "@/lib/actions/auth";
import type { Role } from "@/lib/db/schema";
import { ROLE_DESCRIPTION } from "@/lib/permissions";

const DEMO_ROLES: { role: Role; name: string; icon: typeof Crown }[] = [
  { role: "member", name: "Jordan · Member", icon: BookUser },
  { role: "librarian", name: "Sam · Librarian", icon: Library },
  { role: "admin", name: "Alex · Admin", icon: Crown },
];

export function LoginCard() {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Role | null>(null);

  const signInAs = (role: Role) => {
    setActive(role);
    startTransition(async () => {
      await demoSignIn(role);
    });
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-2xl">Welcome to Folio</CardTitle>
        <CardDescription>Pick an account to sign in. Each one shows a different role.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {DEMO_ROLES.map(({ role, name, icon: Icon }) => (
          <button
            key={role}
            type="button"
            disabled={pending}
            onClick={() => signInAs(role)}
            className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/60 disabled:opacity-60"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground">
              {pending && active === role ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            </span>
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{name}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</span>
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
