import { AdminCard } from "@/components/admin/kit/admin-primitives";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminRouteLoading() {
  return (
    <section aria-busy="true" aria-label="Yönetim görünümü yükleniyor" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
      <AdminCard className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </AdminCard>
    </section>
  );
}
