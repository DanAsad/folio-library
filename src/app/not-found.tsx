import Link from "next/link";
import { BookX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <BookX className="size-6" />
      </div>
      <h1 className="text-3xl font-semibold">This page has been checked out</h1>
      <p className="max-w-sm text-muted-foreground">We couldn&apos;t find what you were looking for. It may have been moved or removed from the catalogue.</p>
      <Button asChild>
        <Link href="/books">Back to the catalogue</Link>
      </Button>
    </div>
  );
}
