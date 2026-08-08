"use client";

import React, { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@wizards/ui";
import {
  AdminAvatarSquare,
  AdminCard,
  AdminCardHeader,
  AdminGridTable,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminInt } from "@/components/admin/format/admin-format";
import type { listAdminServerAuditTrail, listAdminServers } from "@/lib/admin/management";
import { AdminManagementPagination } from "./admin-management-pagination";

type AdminServersResult = Awaited<ReturnType<typeof listAdminServers>>;
type AdminServerRow = AdminServersResult["servers"][number];
type AdminServerAuditTrail = Awaited<ReturnType<typeof listAdminServerAuditTrail>>;

export type AdminServersFilters = {
  query?: string;
};

const ACTION_LABEL: Record<string, string> = {
  "server.create": "oluşturdu",
  "server.delete": "sildi",
  "server.recount": "sayacı onardı",
  "server.update": "güncelledi",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

async function sendServerRequest(path: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(body ? { headers: { "Content-Type": "application/json" } } : {}),
    method,
  });

  if (!response.ok) {
    throw new Error("İşlem tamamlanamadı.");
  }
}

function useServerAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "İşlem tamamlanamadı.");
      }
    });
  }

  return { error, pending, run };
}

/**
 * The create form is the only way a `COMMUNITY` server comes into existence —
 * `POST /api/v1/admin/servers` shipped in S1 without a surface. The type select
 * drives the two visibility switches because the contract refuses a community
 * server that is not publicly joinable.
 */
function AdminServerCreateForm() {
  const { error, pending, run } = useServerAction();
  const [type, setType] = useState<"COMMUNITY" | "PERSONAL">("COMMUNITY");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discoverable, setDiscoverable] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const communitySelected = type === "COMMUNITY";

  return (
    <AdminCard>
      <AdminCardHeader
        subtitle="Topluluk sunucusu yalnız buradan açılabilir."
        title="Yeni sunucu"
      />
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() =>
            sendServerRequest("/api/v1/admin/servers", "POST", {
              discoverable: communitySelected ? discoverable : false,
              isPublic: communitySelected ? true : isPublic,
              name: name.trim(),
              type,
              ...(description.trim() ? { description: description.trim() } : {}),
            }),
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-app-muted text-[12px]">Sunucu adı</span>
            <input
              className="app-input mt-1 h-11 w-full rounded-[12px] border px-3 text-sm outline-hidden"
              maxLength={64}
              minLength={2}
              onChange={(event) => setName(event.target.value)}
              placeholder="Whispr Topluluk"
              required
              value={name}
            />
          </label>
          <label className="block">
            <span className="text-app-muted text-[12px]">Tür</span>
            <select
              className="app-input mt-1 h-11 w-full rounded-[12px] border px-3 text-sm outline-hidden"
              onChange={(event) =>
                setType(event.target.value === "PERSONAL" ? "PERSONAL" : "COMMUNITY")
              }
              value={type}
            >
              <option value="COMMUNITY">Topluluk</option>
              <option value="PERSONAL">Kişisel</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-app-muted text-[12px]">Açıklama</span>
          <input
            className="app-input mt-1 h-11 w-full rounded-[12px] border px-3 text-sm outline-hidden"
            maxLength={160}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Kısa tanıtım"
            value={description}
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <label className="text-app-muted flex items-center gap-2 text-[12.5px]">
            <input
              checked={communitySelected ? true : isPublic}
              disabled={communitySelected}
              onChange={(event) => setIsPublic(event.target.checked)}
              type="checkbox"
            />
            Herkese açık {communitySelected ? "(toplulukta zorunlu)" : null}
          </label>
          <label className="text-app-muted flex items-center gap-2 text-[12.5px]">
            <input
              checked={communitySelected ? discoverable : false}
              disabled={!communitySelected}
              onChange={(event) => setDiscoverable(event.target.checked)}
              type="checkbox"
            />
            Keşifte görünsün
          </label>
          <Button disabled={pending || name.trim().length < 2} type="submit">
            Oluştur
          </Button>
        </div>

        {error ? <p className="text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
      </form>
    </AdminCard>
  );
}

function AdminServerRowActions({ server }: { server: AdminServerRow }) {
  const { error, pending, run } = useServerAction();
  const [confirmationName, setConfirmationName] = useState<string | null>(null);
  const community = server.type === "COMMUNITY";

  function patch(body: Record<string, unknown>) {
    run(() => sendServerRequest(`/api/v1/admin/servers/${server.id}`, "PATCH", body));
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          disabled={pending}
          onClick={() => patch({ type: community ? "PERSONAL" : "COMMUNITY" })}
          size="sm"
          type="button"
          variant="outline"
        >
          {community ? "Kişiselleştir" : "Topluluğa terfi"}
        </Button>
        <Button
          disabled={pending}
          onClick={() => patch({ verified: !server.verified })}
          size="sm"
          type="button"
          variant="outline"
        >
          {server.verified ? "Doğrulamayı kaldır" : "Doğrula"}
        </Button>
        <Button
          disabled={pending}
          onClick={() => patch({ featured: !server.featured })}
          size="sm"
          type="button"
          variant="outline"
        >
          {server.featured ? "Öne çıkarmayı kaldır" : "Öne çıkar"}
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            run(() => sendServerRequest(`/api/v1/admin/servers/${server.id}/recount`, "POST"))
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Sayacı yeniden hesapla
        </Button>
        <Button
          className="text-[hsl(var(--danger))]"
          disabled={pending}
          onClick={() => setConfirmationName(confirmationName === null ? "" : null)}
          size="sm"
          type="button"
          variant="outline"
        >
          Sil
        </Button>
      </div>

      {confirmationName !== null ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* Same shape as `deleteWorkspaceServer`'s `confirmationName`: the
              exact name has to be typed before the button does anything. */}
          <input
            aria-label="Silmek için sunucu adını yazın"
            className="app-input h-9 rounded-[10px] border px-2 text-[12px] outline-hidden"
            onChange={(event) => setConfirmationName(event.target.value)}
            placeholder={server.name}
            value={confirmationName}
          />
          <Button
            className="text-[hsl(var(--danger))]"
            disabled={pending || confirmationName !== server.name}
            onClick={() =>
              run(() => sendServerRequest(`/api/v1/admin/servers/${server.id}`, "DELETE"))
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Kalıcı olarak sil
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-[12px] text-[hsl(var(--danger))]">{error}</p> : null}
    </div>
  );
}

export function AdminServers({
  auditTrail,
  canWrite,
  filters,
  result,
  serverHealth,
}: {
  auditTrail: AdminServerAuditTrail;
  canWrite: boolean;
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

      {canWrite ? <AdminServerCreateForm /> : null}

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
            columns={canWrite ? "1.7fr 1.1fr 0.9fr 1.1fr 1.9fr" : "2fr 1.4fr 1fr 1fr 1.4fr"}
            emptyLabel="Bu filtrelerle sunucu bulunamadı."
            headers={
              canWrite
                ? ["Sunucu", "Sahip", "Kanallar", "Üyeler", "Durum & eylemler"]
                : ["Sunucu", "Sahip", "Kanallar", "Mesajlar", "Durum"]
            }
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
                canWrite ? (
                  <span className="text-app-foreground text-[12px] font-semibold" key="members">
                    {formatAdminInt(server.memberCount)} üye
                    <br />
                    <span
                      className={
                        server.memberCount === server.storedMemberCount
                          ? "text-app-soft text-[11px]"
                          : "text-[11px] text-[hsl(var(--danger))]"
                      }
                    >
                      sayaç: {formatAdminInt(server.storedMemberCount)}
                    </span>
                  </span>
                ) : (
                  <span className="text-app-foreground text-[12px] font-semibold" key="messages">
                    {formatAdminInt(server.messageCount)}
                  </span>
                ),
                <div className="flex flex-col gap-2" key="status">
                  <div className="flex flex-wrap gap-1">
                    <AdminPill tone={server.type === "COMMUNITY" ? "primary" : "neutral"}>
                      {server.type === "COMMUNITY" ? "Topluluk" : "Kişisel"}
                    </AdminPill>
                    {server.verified ? <AdminPill tone="success">Doğrulanmış</AdminPill> : null}
                    {server.featured ? <AdminPill tone="warning">Öne çıkan</AdminPill> : null}
                    {server.discoverable ? (
                      <AdminPill tone="success">Keşfedilebilir</AdminPill>
                    ) : null}
                    {server.isPublic ? <AdminPill tone="primary">Herkese açık</AdminPill> : null}
                    {!server.discoverable && !server.isPublic ? <AdminPill>Özel</AdminPill> : null}
                  </div>
                  {canWrite ? <AdminServerRowActions server={server} /> : null}
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

      <AdminCard>
        <AdminCardHeader
          subtitle="Bu ekrandan yapılan her yazma denetim kaydına düşer."
          title="Son sunucu işlemleri"
        />
        {auditTrail.length === 0 ? (
          <p className="text-app-muted mt-3 text-[13px]">Henüz sunucu işlemi yok.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {auditTrail.map((entry) => (
              <div className="flex flex-wrap items-center gap-2" key={entry.id}>
                <span className="text-app-muted text-[11.5px]">
                  {formatDateTime(entry.createdAt)}
                </span>
                <span className="text-app-foreground text-[12.5px] font-semibold">
                  {entry.actor ? `@${entry.actor.username}` : "sistem"}
                </span>
                <span className="text-app-muted text-[12px]">
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <span className="text-app-soft font-mono text-[11px]">{entry.targetId ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </section>
  );
}
