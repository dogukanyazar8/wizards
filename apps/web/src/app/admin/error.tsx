"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/kit/admin-primitives";

export default function AdminOverviewError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Özet verisi yüklenemedi." title="Genel Bakış" />
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
