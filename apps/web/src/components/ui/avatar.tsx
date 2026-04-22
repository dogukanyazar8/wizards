"use client";

import { cn } from "@/lib/utils";

type AvatarProps = {
  alt: string;
  className?: string;
  fallback: string;
  src?: string | null | undefined;
};

export function Avatar({ alt, className, fallback, src }: AvatarProps) {
  return (
    <div
      aria-label={alt}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-semibold uppercase",
        "border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-soft)/0.72)] text-[hsl(var(--foreground))]",
        className,
      )}
      role="img"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} className="h-full w-full object-cover" src={src} />
      ) : (
        <span>{fallback.slice(0, 2)}</span>
      )}
    </div>
  );
}
