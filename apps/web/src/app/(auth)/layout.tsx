"use client";

import { AuthScreenLayout } from "@/components/auth/auth-screen";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthScreenLayout>{children}</AuthScreenLayout>;
}
