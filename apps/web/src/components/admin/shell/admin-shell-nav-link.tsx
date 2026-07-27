"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function isAdminNavPathActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShellNavLink({ children, href }: { children: ReactNode; href: string }) {
  const pathname = usePathname();
  const isActive = isAdminNavPathActive(pathname, href);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[12px] px-3 py-[9px] text-[13.5px] font-semibold transition-colors",
        isActive
          ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
          : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))]",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
