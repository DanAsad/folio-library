"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Muted, bookish cloth colours for generated covers.
const CLOTHS = [
  ["#1f4d3f", "#e9dcc0"],
  ["#6b2d2a", "#f1e2c8"],
  ["#22395c", "#e6dcc5"],
  ["#5a4a2b", "#f3e7cf"],
  ["#3d2f4f", "#eadfcb"],
  ["#2f4f4f", "#efe4cd"],
  ["#7a4b20", "#f6ead2"],
  ["#40513b", "#ece2c9"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function BookCover({
  title,
  author,
  coverUrl,
  className,
  size = "md",
}: {
  title: string;
  author: string;
  coverUrl?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const showImage = coverUrl && !failed;
  const [bg, fg] = CLOTHS[hash(title + author) % CLOTHS.length];

  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-md bg-muted shadow-[0_1px_2px_rgba(0,0,0,0.12),0_8px_20px_-12px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from arbitrary hosts
        <img
          src={coverUrl}
          alt={`Cover of ${title}`}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // Open Library returns a 1×1 placeholder when it has no cover.
            if (e.currentTarget.naturalWidth < 10) setFailed(true);
          }}
        />
      ) : (
        <div
          className="flex size-full flex-col justify-between p-[9%]"
          style={{ background: `linear-gradient(160deg, ${bg}, color-mix(in oklch, ${bg} 70%, black))`, color: fg }}
          role="img"
          aria-label={`Cover of ${title}`}
        >
          <div className="h-px w-full opacity-50" style={{ background: fg }} />
          <div className="space-y-[6%] text-center">
            <p
              className={cn(
                "font-heading leading-tight font-semibold text-balance",
                size === "sm" ? "text-[0.6rem]" : size === "lg" ? "text-2xl" : "text-sm",
              )}
            >
              {title}
            </p>
            <p className={cn("tracking-wide uppercase opacity-80", size === "lg" ? "text-xs" : "text-[0.5rem]")}>{author}</p>
          </div>
          <div className="h-px w-full opacity-50" style={{ background: fg }} />
        </div>
      )}
      {/* subtle spine shading */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 to-transparent" />
    </div>
  );
}
