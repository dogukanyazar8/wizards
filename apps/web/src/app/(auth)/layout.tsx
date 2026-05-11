"use client";

import { usePathname } from "next/navigation";
import { AuthScreenLayout } from "@/components/auth/auth-screen";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password")
  ) {
    return <>{children}</>;
  }

  return <AuthScreenLayout>{children}</AuthScreenLayout>;
}
