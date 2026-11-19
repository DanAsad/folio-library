"use client";

import { useTransition, useState } from "react";
import { BookUser, Crown, Library, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { demoSignIn, ssoSignIn } from "@/lib/actions/auth";
import type { Role } from "@/lib/db/schema";
import { ROLE_DESCRIPTION } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const DEMO_ROLES: { role: Role; name: string; icon: typeof Crown }[] = [
  { role: "member", name: "Jordan · Member", icon: BookUser },
  { role: "librarian", name: "Sam · Librarian", icon: Library },
  { role: "admin", name: "Alex · Admin", icon: Crown },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

export function LoginCard({ demoMode, google, github }: { demoMode: boolean; google: boolean; github: boolean }) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string | null>(null);

  const go = (key: string, fn: () => Promise<void>) => {
    setActive(key);
    startTransition(async () => {
      await fn();
    });
  };

  const sso = [
    { id: "google" as const, label: "Continue with Google", icon: <GoogleIcon />, enabled: google },
    { id: "github" as const, label: "Continue with GitHub", icon: <GitHubIcon />, enabled: github },
  ];

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-2xl">Welcome to Folio</CardTitle>
        <CardDescription>Sign in with your organisation account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2">
          {sso.map((p) => {
            const button = (
              <Button
                key={p.id}
                variant="outline"
                size="lg"
                className="h-10 w-full"
                disabled={!p.enabled || pending}
                onClick={() => go(p.id, () => ssoSignIn(p.id))}
              >
                {pending && active === p.id ? <Loader2 className="animate-spin" /> : p.icon}
                {p.label}
              </Button>
            );
            return p.enabled ? (
              button
            ) : (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>{button}</span>
                </TooltipTrigger>
                <TooltipContent>Not configured on this deployment. See the README to enable it.</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {demoMode && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or explore with a demo account
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-2">
              {DEMO_ROLES.map(({ role, name, icon: Icon }) => (
                <button
                  key={role}
                  type="button"
                  disabled={pending}
                  onClick={() => go(role, () => demoSignIn(role))}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/60 disabled:opacity-60",
                  )}
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
