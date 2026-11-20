"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { setLocale } from "@/lib/actions/locale";

export function LanguageSwitcher({ withLabel = false }: { withLabel?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={withLabel ? "sm" : "icon"} aria-label={t("common.language")}>
          {pending ? <Loader2 className="animate-spin" /> : <Languages />}
          {withLabel && LOCALE_NAMES[locale]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            lang={l}
            onSelect={() =>
              start(async () => {
                await setLocale(l);
                router.refresh();
              })
            }
          >
            <span className="flex-1">{LOCALE_NAMES[l]}</span>
            {l === locale && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
