import Link from "next/link";
import { LibraryBig } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/dashboard" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <LibraryBig className="size-4.5" />
      </span>
      <span className="font-heading text-xl font-semibold tracking-tight">Folio</span>
    </Link>
  );
}
