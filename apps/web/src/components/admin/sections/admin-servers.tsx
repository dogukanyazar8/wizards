import React from "react";
import { Search } from "lucide-react";
import { Button } from "@wizards/ui";
import {
  AdminAvatarSquare,
  AdminCard,
  AdminGridTable,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt } from "@/components/admin/format/admin-format";
import type { listAdminServers } from "@/lib/admin/management";
import { AdminManagementPagination } from "./admin-management-pagination";

type AdminServersResult = Awaited<ReturnType<typeof listAdminServers>>;

export type AdminServersFilters = {
  query?: string;
};

export function AdminServers({
  filters,
  result,
  serverHealth,
}: {
  filters: AdminServersFilters;
  result: AdminServersResult;
  serverHealth: Pick<
    {
      activeServers: number;
      publicServers: number;
      totalServers: number;
    },
    "activeServers" | "publicServers" | "totalServers"
  >;
}) {
  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Topluluklar, kanallar ve platform görünürlüğü" title="Sunucular" />

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminMiniStat
          label="Toplam sunucu"
          tone="primary"
          value={formatAdminInt(serverHealth.totalServers)}
        />
        <AdminMiniStat
          label="24s aktif"
          tone="success"
          value={formatAdminInt(serverHealth.activeServers)}
        />
        <AdminMiniStat
          label="Herkese açık"
          tone="neutral"
          value={formatAdminInt(serverHealth.publicServers)}
        />
      </div>

      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
            <input
              className="app-input h-11 w-full rounded-[12px] border pl-10 pr-3 text-sm outline-hidden"
              defaultValue={filters.query}
              name="query"
              placeholder="Sunucu, açıklama veya davet kodu ara"
            />
          </label>
          <Button type="submit">Uygula</Button>
        </form>

        <div className="mt-5">
          <AdminGridTable
            columns="2fr 1.4fr 1fr 1fr 1.4fr"
            emptyLabel="Bu filtrelerle sunucu bulunamadı."
            headers={["Sunucu", "Sahip", "Kanallar", "Mesajlar", "Durum"]}
            rows={result.servers.map((server) => ({
              cells: [
                <div className="flex min-w-0 items-center gap-3" key="server">
                  <AdminAvatarSquare
                    avatarUrl={server.iconUrl}
                    name={server.name}
                    seed={server.id}
                    size={34}
                  />
                  <div className="min-w-0">
                    <p className="text-app-foreground truncate font-semibold">{server.name}</p>
                    <p className="text-app-muted line-clamp-1 text-[11.5px]">
                      {server.description ?? "Açıklama yok."}
                    </p>
                  </div>
                </div>,
                <div className="min-w-0" key="owner">
                  <p className="text-app-foreground truncate text-[12px] font-semibold">
                    {server.owner.displayName}
                  </p>
                  <p className="text-app-muted truncate text-[11px]">@{server.owner.username}</p>
                </div>,
                <span className="text-app-muted text-[12px]" key="channels">
                  {formatAdminInt(server.channelCount)} kanal
                  <br />
                  <span className="text-app-soft text-[11px]">
                    {formatAdminInt(server.textChannelCount)} metin ·{" "}
                    {formatAdminInt(server.voiceChannelCount)} ses
                  </span>
                </span>,
                <span className="text-app-foreground text-[12px] font-semibold" key="messages">
                  {formatAdminInt(server.messageCount)}
                </span>,
                <div className="flex flex-wrap gap-1" key="status">
                  {server.discoverable ? <AdminPill tone="success">Doğrulanmış</AdminPill> : null}
                  {server.isPublic ? <AdminPill tone="primary">Herkese açık</AdminPill> : null}
                  {!server.discoverable && !server.isPublic ? <AdminPill>Özel</AdminPill> : null}
                </div>,
              ],
              id: server.id,
            }))}
          />
        </div>

        <div className="mt-5">
          <AdminManagementPagination
            page={result.pagination.page}
            pathname="/admin/servers"
            search={filters}
            total={result.pagination.total}
            totalPages={result.pagination.totalPages}
          />
        </div>
      </AdminCard>
    </section>
  );
}
