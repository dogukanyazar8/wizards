"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/kit/admin-primitives";

/**
 * Shared by every admin segment, so the copy stays module-independent: naming a
 * single module here mislabels the failure on the other five routes.
 */
export default function AdminModuleError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Bu modül yüklenemedi." title="Yönetim Konsolu" />
      <AdminCard>
        <p className="text-app-muted text-sm">Lütfen yeniden deneyin.</p>
        <button
          className="mt-4 rounded-[12px] bg-[hsl(var(--primary))] px-4 py-[9px] text-[13px] font-bold text-[hsl(var(--primary-foreground))]"
          onClick={reset}
          type="button"
        >
          Yeniden Dene
        </button>
      </AdminCard>
    </section>
  );
}
