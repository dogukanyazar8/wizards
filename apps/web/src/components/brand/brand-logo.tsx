import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";

const LOGO_BAR_HEIGHTS = [17, 25, 34, 24, 18];

export function BrandLogo({
  animated = true,
  className,
  interactive = true,
}: {
  animated?: boolean;
  className?: string;
  interactive?: boolean;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn("whispr-logo-icon", animated && "whispr-logo-icon-animated")}
      >
        {LOGO_BAR_HEIGHTS.map((height, index) => (
          <span
            className="whispr-logo-bar"
            key={`${height}-${index}`}
            style={{
              animationDelay: `${index * 0.13}s`,
              height,
            }}
          />
        ))}
      </span>
      <span className="whispr-logo-wordmark">Whispr</span>
    </>
  );

  if (!interactive) {
    return (
      <span aria-label="Whispr" className={cn("whispr-brand-logo", className)} role="img">
        {content}
      </span>
    );
  }

  return (
    <Link className={cn("whispr-brand-logo", className)} href="/login">
      {content}
    </Link>
  );
}
