import { AdminCard, AdminPageHeader } from "@/components/admin/kit/admin-primitives";

export function AdminModulePlaceholder({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle={subtitle} title={title} />
      <AdminCard className="min-h-56">
        <p className="text-app-muted text-sm">Görünüm hazırlanıyor.</p>
      </AdminCard>
    </section>
  );
}
