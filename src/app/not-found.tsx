import Link from "next/link";
import { BookX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <BookX className="size-6" />
      </div>
      <h1 className="text-3xl font-semibold">{t("notFound.title")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("notFound.body")}</p>
      <Button asChild>
        <Link href="/books">{t("notFound.back")}</Link>
      </Button>
    </div>
  );
}
