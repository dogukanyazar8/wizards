import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/utils";

export default async function MainLayout({ children }: { children: ReactNode }) {
  await requireAuth();

  return <>{children}</>;
}
