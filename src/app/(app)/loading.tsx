import { Skeleton } from "@/components/ui/skeleton";
import { getI18n } from "@/i18n/server";

/** Shown instantly while a page's data loads, so a click always gets feedback. */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div className="space-y-6" aria-busy="true" aria-label={t("common.loading")}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
