"use client";

import React, { useState } from "react";
import { Award, Ban, Check, Loader2, Search } from "lucide-react";
import { Button } from "@wizards/ui";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { AdminUserBadges, type AdminBadgeUser } from "./admin-user-badges";
import {
  AdminAvatarSquare,
  AdminCard,
  AdminGridTable,
  AdminMiniStat,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import { formatAdminDuration, formatAdminInt } from "@/components/admin/format/admin-format";
import type { UserStatus } from "@wizards/db";
import type { listAdminUsers } from "@/lib/admin/management";
import { AdminManagementPagination } from "./admin-management-pagination";

type AdminUsersResult = Awaited<ReturnType<typeof listAdminUsers>>;

export type AdminUsersFilters = {
  banned?: string;
  query?: string;
  status?: UserStatus | "ALL";
  verified?: string;
};

type AdminUserAction = {
  banned: boolean;
  user: AdminUsersResult["users"][number];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "ONLINE") {
    return "success" as const;
  }

  if (status === "DND") {
    return "danger" as const;
  }

  if (status === "IDLE") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function getAdminBanReasonError(reason: string) {
  return reason.trim() ? null : "Neden zorunludur.";
}

export function AdminUsers({
  canBan,
  canReadBadges = false,
  canWriteBadges = false,
  filters,
  result,
}: {
  canBan: boolean;
  /**
   * `badge.read` opens the panel; `badge.write` is what draws the grant form and
   * the revoke controls inside it. A session without the write capability never
   * renders them at all (08 §3).
   */
  canReadBadges?: boolean;
  canWriteBadges?: boolean;
  filters: AdminUsersFilters;
  result: AdminUsersResult;
}) {
  const [badgeUser, setBadgeUser] = useState<AdminBadgeUser | null>(null);
  const [action, setAction] = useState<AdminUserAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const verifiedOnPage = result.users.filter((user) => user.emailVerified).length;
  const unverifiedOnPage = result.users.length - verifiedOnPage;
  const bannedOnPage = result.users.filter((user) => user.isBanned).length;

  async function submitAction() {
    if (!action) {
      return;
    }

    const reasonError = getAdminBanReasonError(reason);

    if (reasonError) {
      setError(reasonError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/admin/users/${action.user.id}`, {
        body: JSON.stringify({ isBanned: action.banned, reason: reason.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Kullanıcı güncellenemedi.");
      }

      setAction(null);
      setReason("");
      setSaving(false);
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Kullanıcı güncellenemedi.");
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader subtitle="Hesap erişimi ve son etkinlik" title="Kullanıcılar" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMiniStat
          label="Eşleşen kullanıcı"
          tone="primary"
          value={formatAdminInt(result.pagination.total)}
        />
        <AdminMiniStat
          label="Bu sayfada doğrulanmış"
          tone="success"
          value={formatAdminInt(verifiedOnPage)}
        />
        <AdminMiniStat
          label="Bu sayfada doğrulanmamış"
          tone="warning"
          value={formatAdminInt(unverifiedOnPage)}
        />
        <AdminMiniStat
          label="Bu sayfada banlı"
          tone="danger"
          value={formatAdminInt(bannedOnPage)}
        />
      </div>

      <AdminCard>
        <form
          className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_150px_150px_150px_auto]"
          method="get"
        >
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
            <input
              className="app-input h-11 w-full rounded-[12px] border pl-10 pr-3 text-sm outline-hidden"
              defaultValue={filters.query}
              name="query"
              placeholder="Kullanıcı, kullanıcı adı veya e-posta ara"
            />
          </label>
          <select
            aria-label="Durum"
            className="app-input h-11 rounded-[12px] border px-3 text-sm outline-hidden"
            defaultValue={filters.status ?? "ALL"}
            name="status"
          >
            <option value="ALL">Durum: tümü</option>
            <option value="ONLINE">Çevrimiçi</option>
            <option value="IDLE">Boşta</option>
            <option value="DND">Rahatsız etmeyin</option>
            <option value="OFFLINE">Çevrimdışı</option>
            <option value="INVISIBLE">Görünmez</option>
          </select>
          <select
            aria-label="Doğrulama"
            className="app-input h-11 rounded-[12px] border px-3 text-sm outline-hidden"
            defaultValue={filters.verified ?? "ALL"}
            name="verified"
          >
            <option value="ALL">Doğrulama: tümü</option>
            <option value="true">Doğrulanmış</option>
            <option value="false">Doğrulanmamış</option>
          </select>
          <select
            aria-label="Ban durumu"
            className="app-input h-11 rounded-[12px] border px-3 text-sm outline-hidden"
            defaultValue={filters.banned ?? "ALL"}
            name="banned"
          >
            <option value="ALL">Ban durumu: tümü</option>
            <option value="false">Aktif</option>
            <option value="true">Banlı</option>
          </select>
          <Button type="submit">Uygula</Button>
        </form>

        <div className="mt-5">
          <AdminGridTable
            columns="2.2fr 1.9fr 1.1fr 1fr 1fr 1.1fr 76px"
            emptyLabel="Bu filtrelerle kullanıcı bulunamadı."
            headers={["Kullanıcı", "Durum", "Son oturum", "30g etkinlik", "Sunucular", "Kayıt", ""]}
            rows={result.users.map((user) => ({
              cells: [
                <div className="flex min-w-0 items-center gap-3" key="identity">
                  <AdminAvatarSquare
                    avatarUrl={user.avatarUrl}
                    name={user.displayName}
                    seed={user.id}
                    size={34}
                  />
                  <div className="min-w-0">
                    <p className="text-app-foreground truncate font-semibold">{user.displayName}</p>
                    <p className="text-app-muted truncate text-[11.5px]">{user.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {user.adminRole ? (
                        <AdminPill tone="primary">{user.adminRole}</AdminPill>
                      ) : null}
                      <AdminPill tone={user.emailVerified ? "success" : "warning"}>
                        {user.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}
                      </AdminPill>
                    </div>
                  </div>
                </div>,
                <div className="flex flex-wrap gap-1" key="status">
                  <AdminPill tone={statusTone(user.status)}>{user.status}</AdminPill>
                  {user.isBanned ? <AdminPill tone="danger">Banlı</AdminPill> : null}
                </div>,
                <div className="text-app-muted text-[12px]" key="session">
                  <p>{user.lastSession?.clientType ?? "Oturum yok"}</p>
                  <p className="text-app-soft truncate text-[11px]">
                    {user.lastSession
                      ? [user.lastSession.os, user.lastSession.browser].filter(Boolean).join(" · ")
                      : "—"}
                  </p>
                </div>,
                <div className="text-app-muted text-[12px]" key="activity">
                  <p>{formatAdminDuration(user.metrics.appSeconds)} uygulama</p>
                  <p className="text-app-soft text-[11px]">
                    {formatAdminInt(user.metrics.messageCount + user.metrics.dmMessageCount)} mesaj
                  </p>
                </div>,
                <span className="text-app-foreground font-semibold" key="servers">
                  {formatAdminInt(user.serverCount)}
                </span>,
                <span className="text-app-muted text-[12px]" key="registered">
                  {formatDate(user.registeredAt)}
                </span>,
                <div className="flex items-center justify-end gap-1" key="action">
                  {canReadBadges ? (
                    <button
                      aria-label={`${user.displayName} rozetleri`}
                      className="text-app-muted flex h-9 w-9 items-center justify-center rounded-[10px] hover:bg-[hsl(var(--primary)/0.12)]"
                      onClick={() =>
                        setBadgeUser({
                          avatarUrl: user.avatarUrl,
                          displayName: user.displayName,
                          email: user.email,
                          id: user.id,
                        })
                      }
                      type="button"
                    >
                      <Award size={16} />
                    </button>
                  ) : null}
                  {canBan ? (
                    <button
                      aria-label={
                        user.isBanned
                          ? `${user.displayName} banını kaldır`
                          : `${user.displayName} banla`
                      }
                      className={
                        user.isBanned
                          ? "text-app-success flex h-9 w-9 items-center justify-center rounded-[10px] hover:bg-[hsl(var(--success)/0.12)]"
                          : "text-app-danger flex h-9 w-9 items-center justify-center rounded-[10px] hover:bg-[hsl(var(--danger)/0.12)]"
                      }
                      onClick={() => {
                        setAction({ banned: !user.isBanned, user });
                        setError(null);
                        setReason("");
                      }}
                      type="button"
                    >
                      {user.isBanned ? <Check size={16} /> : <Ban size={16} />}
                    </button>
                  ) : null}
                </div>,
              ],
              id: user.id,
            }))}
          />
        </div>

        <div className="mt-5">
          <AdminManagementPagination
            page={result.pagination.page}
            pathname="/admin/users"
            search={filters}
            total={result.pagination.total}
            totalPages={result.pagination.totalPages}
          />
        </div>
      </AdminCard>

      <AdminUserBadges
        canWrite={canWriteBadges}
        onClose={() => setBadgeUser(null)}
        open={Boolean(badgeUser)}
        user={badgeUser}
      />

      <Modal
        description={
          action?.banned
            ? "Aktif oturumlar kapatılır ve işlem denetim kaydına yazılır."
            : "Ban kaldırma işlemi denetim kaydına yazılır."
        }
        onClose={() => {
          if (!saving) {
            setAction(null);
          }
        }}
        open={Boolean(action)}
        title={action?.banned ? "Kullanıcıyı banla" : "Banı kaldır"}
      >
        {action ? (
          <div className="space-y-4">
            <div className="app-panel-soft flex items-center gap-3 rounded-[12px] border p-3">
              <AdminAvatarSquare
                avatarUrl={action.user.avatarUrl}
                name={action.user.displayName}
                seed={action.user.id}
                size={36}
              />
              <div className="min-w-0">
                <p className="text-app-foreground truncate text-sm font-semibold">
                  {action.user.displayName}
                </p>
                <p className="text-app-muted truncate text-xs">{action.user.email}</p>
              </div>
            </div>
            <label className="block">
              <span className="text-app-foreground mb-2 block text-sm font-semibold">Neden</span>
              <Textarea
                disabled={saving}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="İşlem nedenini yazın"
                required
                value={reason}
              />
            </label>
            {error ? (
              <p aria-live="polite" className="text-app-danger text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button
                disabled={saving}
                onClick={() => setAction(null)}
                type="button"
                variant="outline"
              >
                Vazgeç
              </Button>
              <Button
                disabled={saving || Boolean(getAdminBanReasonError(reason))}
                onClick={submitAction}
                type="button"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {action.banned ? "Banla" : "Banı kaldır"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
