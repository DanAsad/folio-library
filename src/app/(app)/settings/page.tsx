import { Building2, DatabaseZap, Mail } from "lucide-react";
import { DEMO_MODE } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/books/bits";
import { emailConfigured } from "@/lib/email";
import { ROLE_LABEL } from "@/lib/permissions";
import { requirePermissionPage } from "@/lib/session";
import { NewLibraryForm, ResetDemoButton, SettingsForm } from "./settings-forms";

export const metadata = { title: "Library settings" };

const money = (cents: number) => (cents / 100).toFixed(2);

export default async function SettingsPage() {
  const user = await requirePermissionPage("settings:manage");
  const l = user.library;

  return (
    <div className="space-y-10">
      <PageHeader title="Library settings" description={`Rules for ${l.name}. Every library sets its own.`} />

      <SettingsForm
        key={l.id}
        initial={{
          name: l.name,
          tagline: l.tagline ?? "",
          loanDays: String(l.loanDays),
          maxLoans: String(l.maxLoans),
          maxRenewals: String(l.maxRenewals),
          holdPickupDays: String(l.holdPickupDays),
          finePerDay: money(l.finePerDayCents),
          fineGraceDays: String(l.fineGraceDays),
          maxFine: money(l.maxFineCents),
          lostItemFee: money(l.lostItemFeeCents),
          blockAt: money(l.blockAtCents),
          currency: l.currency,
        }}
      />

      <Card id="new-library" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" /> Libraries
          </CardTitle>
          <CardDescription>
            Each library has its own catalogue, copies, members, roles, rules and reports. People can belong to several with a different role in each.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y rounded-lg border">
            {user.libraries.map((lib) => (
              <li key={lib.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{lib.name}</span>
                  {lib.tagline && <span className="block truncate text-xs text-muted-foreground">{lib.tagline}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {lib.id === l.id && <Badge>Current</Badge>}
                  <Badge variant="secondary">{ROLE_LABEL[lib.role]}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <p className="text-sm font-medium">Open a new library</p>
            <NewLibraryForm />
            <p className="text-xs text-muted-foreground">You&apos;ll be its admin. It starts with an empty catalogue and the default rules.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-primary" /> Reminders
            </CardTitle>
            <CardDescription>
              A daily job sends &ldquo;due soon&rdquo; reminders 2 days before the due date and overdue reminders on the first day and then weekly. Members also hear
              when a reserved copy is ready and when a fine is charged.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {emailConfigured() ? (
              <p>
                <Badge className="bg-success/15 text-success">Email on</Badge> Reminders are also emailed. Demo accounts never receive email.
              </p>
            ) : (
              <p className="text-muted-foreground">
                <Badge variant="outline">In-app only</Badge> Set <code className="font-mono">RESEND_API_KEY</code> and <code className="font-mono">EMAIL_FROM</code> to email
                them too.
              </p>
            )}
          </CardContent>
        </Card>

        {DEMO_MODE && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DatabaseZap className="size-5 text-primary" /> Demo data
              </CardTitle>
              <CardDescription>
                This is a shared demo, so the sample data is restored every night at 04:00 UTC. You can also restore it right away.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResetDemoButton />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
