"use client";

import { AdminDownloads } from "./admin-downloads";
import type { AdminDownloadArtifact } from "@/lib/downloads/admin-download-service";
import React, { useState } from "react";
import Link from "next/link";
import { Loader2, PackagePlus, Rocket } from "lucide-react";
import { Button } from "@wizards/ui";

import {
  AdminCard,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import type { listAdminReleases } from "@/lib/releases/admin-release-service";

type AdminReleaseList = Awaited<ReturnType<typeof listAdminReleases>>["releases"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value));
}

export function AdminReleases({
  canWrite = true,
  releases,
  artifacts = [],
  page = 1,
  hasMore = false,
  initialFilters = { product: "ALL", channel: "ALL", status: "ALL" },
}: {
  canWrite?: boolean;
  releases: AdminReleaseList;
  artifacts?: AdminDownloadArtifact[];
  page?: number;
  hasMore?: boolean;
  initialFilters?: { product: string; channel: string; status: string };
}) {
  const [product, setProduct] = useState(initialFilters.product);
  const [channel, setChannel] = useState(initialFilters.channel);
  const [status, setStatus] = useState(initialFilters.status);
  const pageHref = (target: number) =>
    `/admin/releases?${new URLSearchParams({ page: String(target), product, channel, status })}`;
  const filtered = releases.filter(
    (release) =>
      (product === "ALL" || release.product === product) &&
      (channel === "ALL" || release.channel === channel) &&
      (status === "ALL" ||
        (status === "WITHDRAWN"
          ? Boolean(release.withdrawnAt)
          : status === "DRAFT"
            ? !release.publishedAt
            : Boolean(release.publishedAt && !release.withdrawnAt))),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish(releaseId: string) {
    setBusyId(releaseId);
    setError(null);

    try {
      const response = await fetch(`/api/v1/admin/releases/${releaseId}/publish`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Sürüm yayınlanamadı.");
      }

      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sürüm yayınlanamadı.");
      setBusyId(null);
    }
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const releasedAt = String(data.get("releasedAt") ?? "");
    const payload = {
      product: String(data.get("product") ?? "MOBILE"),
      channel: String(data.get("channel") ?? "STABLE"),
      mandatory: false,
      releasedAt: new Date(`${releasedAt}T12:00:00.000Z`).toISOString(),
      version: String(data.get("version") ?? "").trim(),
    };

    try {
      const response = await fetch("/api/v1/admin/releases", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        release?: { id: string };
      } | null;

      if (!response.ok || !result?.release) {
        throw new Error(result?.error ?? "Taslak oluşturulamadı.");
      }

      window.location.href = `/admin/releases/${result.release.id}`;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Taslak oluşturulamadı.");
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        subtitle="Masaüstü ve mobil paketler, sürüm notları ve yayın geçmişi"
        title="Yayın Merkezi"
      />
      <form action="/admin/releases" method="get" className="flex flex-wrap items-end gap-3">
        <label>
          Ürün{" "}
          <select
            name="product"
            aria-label="Ürün filtresi"
            className="app-input rounded-lg border p-2"
            value={product}
            onChange={(event) => setProduct(event.target.value)}
          >
            <option value="ALL">Tümü</option>
            <option value="DESKTOP">Masaüstü</option>
            <option value="MOBILE">Mobil</option>
          </select>
        </label>
        <label>
          Kanal{" "}
          <select
            name="channel"
            aria-label="Kanal filtresi"
            className="app-input rounded-lg border p-2"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            <option value="ALL">Tümü</option>
            <option value="STABLE">Stable</option>
            <option value="UAT">Beta</option>
          </select>
        </label>
        <label>
          Durum{" "}
          <select
            name="status"
            aria-label="Durum filtresi"
            className="app-input rounded-lg border p-2"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">Tümü</option>
            <option value="PUBLISHED">Yayınlandı</option>
            <option value="DRAFT">Taslak</option>
            <option value="WITHDRAWN">Geri çekildi</option>
          </select>
        </label>
        <Button type="submit" variant="outline">
          Tüm geçmişi filtrele
        </Button>
      </form>

      {error ? (
        <p aria-live="polite" className="text-app-danger text-sm">
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <AdminCard>
          <h2 className="text-app-foreground text-base font-semibold">Yeni taslak</h2>
          <p className="text-app-muted mt-2 text-sm">
            Başarılı masaüstü ve Android yayınları otomatik eklenir. Taslak, önceden not hazırlamak
            içindir.
          </p>
          <form
            className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_180px_auto]"
            onSubmit={createDraft}
          >
            <label className="grid gap-1.5 text-sm">
              <span>Ürün</span>
              <select className="app-input h-11 rounded-[12px] border px-3" name="product">
                <option value="MOBILE">Mobil</option>
                <option value="DESKTOP">Masaüstü</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Versiyon</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                name="version"
                placeholder="0.9.0"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Kanal</span>
              <select className="app-input h-11 rounded-[12px] border px-3" name="channel">
                <option value="STABLE">Stable</option>
                <option value="UAT">Beta (UAT)</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Sürüm tarihi</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                name="releasedAt"
                required
                type="date"
              />
            </label>
            <Button className="self-end" disabled={creating} type="submit">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus />}
              Taslak oluştur
            </Button>
          </form>
        </AdminCard>
      ) : null}

      <AdminCard>
        <AdminGridTable
          columns="1.2fr 1fr 1.2fr .8fr 1fr 150px"
          emptyLabel="Henüz sürüm yok."
          headers={["Sürüm", "Kanal", "Tarih", "Madde", "Durum", "Eylem"]}
          rows={filtered.map((release) => ({
            cells: [
              <div key="version">
                <Link
                  className="text-app-foreground font-semibold hover:underline"
                  href={`/admin/releases/${release.id}`}
                >
                  {release.product === "DESKTOP" ? "Masaüstü" : "Mobil"} · {release.version}
                </Link>
                {release.codename ? (
                  <p className="text-app-muted text-xs">{release.codename}</p>
                ) : null}
              </div>,
              <AdminPill key="channel" tone="primary">
                {release.channel}
              </AdminPill>,
              <span className="text-app-muted text-xs" key="date">
                {formatDate(release.releasedAt)}
              </span>,
              <span key="changes">{release.changeCount}</span>,
              <AdminPill key="status" tone={release.publishedAt ? "success" : "warning"}>
                {release.withdrawnAt
                  ? "Geri çekildi"
                  : release.publishedAt
                    ? release.active
                      ? "Yayında"
                      : "Geçmiş"
                    : "Taslak"}
              </AdminPill>,
              release.publishedAt || !canWrite || release.product === "DESKTOP" ? (
                <Link
                  className="text-[hsl(var(--primary))] text-sm font-semibold"
                  href={`/admin/releases/${release.id}`}
                  key="edit"
                >
                  {canWrite ? "Düzenle" : "Görüntüle"}
                </Link>
              ) : (
                <Button
                  disabled={busyId === release.id}
                  key="publish"
                  onClick={() => void publish(release.id)}
                  size="sm"
                  type="button"
                >
                  {busyId === release.id ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="mr-1 h-4 w-4" />
                  )}
                  Yayınla
                </Button>
              ),
            ],
            id: release.id,
          }))}
        />
      </AdminCard>
      <nav aria-label="Yayın geçmişi sayfaları" className="flex gap-4 text-sm">
        {page > 1 ? <Link href={pageHref(page - 1)}>Önceki</Link> : null}
        <span>Sayfa {page}</span>
        {hasMore ? <Link href={pageHref(page + 1)}>Sonraki</Link> : null}
      </nav>
      <div id="packages">
        <AdminDownloads
          key={`${product}:${channel}`}
          artifacts={artifacts.filter(
            (item) =>
              (channel === "ALL" || item.channel === channel) &&
              (product === "ALL" ||
                (["ANDROID", "IOS"].includes(item.platform) ? "MOBILE" : "DESKTOP") === product),
          )}
          canWrite={canWrite}
        />
      </div>
    </section>
  );
}
