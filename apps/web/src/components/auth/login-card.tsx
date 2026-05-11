"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoginCard({
  children,
  className,
  label = "Whispr auth form",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section className={cn("modern-login-card-shell", className)} aria-label={label}>
      <div className="modern-login-card-gradient" aria-hidden="true" />
      <div className="modern-login-card">{children}</div>
    </section>
  );
}
