"use client";

// The default import is what the node test runner's classic JSX transform
// resolves `<Avatar>`'s own elements against; Next's compiler does not need it.
import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type AvatarProps = {
  alt: string;
  className?: string;
  fallback: string;
  style?: CSSProperties;
  src?: string | null | undefined;
};

function getFallbackInitials(value: string) {
  const tokens = value
    .trim()
    .split(/[\s_]+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);

  if (tokens.length === 0) {
    return "??";
  }

  if (tokens.length === 1) {
    return tokens[0]!.slice(0, 2).toUpperCase();
  }

  return `${tokens[0]![0] ?? ""}${tokens[tokens.length - 1]![0] ?? ""}`.toUpperCase();
}

export function Avatar({ alt, className, fallback, src, style }: AvatarProps) {
  const accessibleName = alt.trim() || fallback.trim();

  return (
    <div
      aria-hidden={accessibleName ? undefined : true}
      aria-label={accessibleName || undefined}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-semibold uppercase",
        "border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-soft)/0.72)] text-[hsl(var(--foreground))]",
        className,
      )}
      role={accessibleName ? "img" : undefined}
      style={style}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" aria-hidden="true" className="h-full w-full object-cover" src={src} />
      ) : (
        <span>{getFallbackInitials(fallback)}</span>
      )}
    </div>
  );
}
