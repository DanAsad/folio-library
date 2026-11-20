import { Building2, DatabaseZap, Mail } from "lucide-react";
import { DEMO_MODE } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/books/bits";
import { emailConfigured } from "@/lib/email";
import { getI18n } from "@/i18n/server";
import { requirePermissionPage } from "@/lib/session";
import { NewLibraryForm, ResetDemoButton, SettingsForm } from "./settings-forms";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.settings") };
}

const money = (cents: number) => (cents / 100).toFixed(2);

export default async function SettingsPage() {
  const user = await requirePermissionPage("settings:manage");
  const l = user.library;
  const { t, rich } = await getI18n();

  return (
    <div className="space-y-10">
      <PageHeader title={t("nav.settings")} description={t("settings.description", { library: l.name })} />

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
            <Building2 className="size-5 text-primary" /> {t("settings.libraries")}
          </CardTitle>
          <CardDescription>{t("settings.librariesBody")}</CardDescription>
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
                  {lib.id === l.id && <Badge>{t("settings.current")}</Badge>}
                  <Badge variant="secondary">{t(`roles.${lib.role}`)}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("settings.openNew")}</p>
            <NewLibraryForm />
            <p className="text-xs text-muted-foreground">{t("settings.openNewHint")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-primary" /> {t("settings.reminders")}
            </CardTitle>
            <CardDescription>{t("settings.remindersBody")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {emailConfigured() ? (
              <p>
                <Badge className="bg-success/15 text-success">{t("settings.emailOn")}</Badge> {t("settings.emailOnBody")}
              </p>
            ) : (
              <p className="text-muted-foreground">
                <Badge variant="outline">{t("settings.inAppOnly")}</Badge>{" "}
                {rich("settings.emailOffBody", { key: <code className="font-mono">RESEND_API_KEY</code>, from: <code className="font-mono">EMAIL_FROM</code> })}
              </p>
            )}
          </CardContent>
        </Card>

        {DEMO_MODE && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DatabaseZap className="size-5 text-primary" /> {t("settings.demoData")}
              </CardTitle>
              <CardDescription>{t("settings.demoDataBody")}</CardDescription>
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
