"use client";

import { confirmAction } from "@/lib/confirmation";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { Button } from "@wizards/ui";

import { AdminCard, AdminPageHeader, AdminPill } from "@/components/admin/kit/admin-primitives";
import type { getAdminRelease } from "@/lib/releases/admin-release-service";

type AdminRelease = Awaited<ReturnType<typeof getAdminRelease>>["release"];
type AdminReleaseChange = AdminRelease["changes"][number];

export function AdminReleaseEditor({
  canWrite = true,
  release,
}: {
  canWrite?: boolean;
  release: AdminRelease;
}) {
  const [form, setForm] = useState({
    product: release.product,
    channel: release.channel,
    codename: release.codename ?? "",
    highlight: release.highlight ?? "",
    mandatory: release.mandatory,
    releasedAt: release.releasedAt.slice(0, 10),
    summary: release.summary ?? "",
    version: release.version,
  });
  const [changes, setChanges] = useState<AdminReleaseChange[]>(release.changes);
  const [busy, setBusy] = useState<"delete" | "publish" | "save" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestJson(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "İşlem tamamlanamadı.");
    }

    return payload;
  }

  async function save() {
    setBusy("save");
    setError(null);

    try {
      await requestJson(`/api/v1/admin/releases/${release.id}`, {
        body: JSON.stringify({
          product: form.product,
          channel: form.channel,
          codename: form.codename.trim() || null,
          highlight: form.highlight.trim() || null,
          mandatory: form.mandatory,
          releasedAt: release.managed
            ? release.releasedAt
            : new Date(`${form.releasedAt}T12:00:00.000Z`).toISOString(),
          summary: form.summary.trim() || null,
          version: form.version.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await requestJson(`/api/v1/admin/releases/${release.id}/changes`, {
        body: JSON.stringify({
          changes: changes.map(({ detail, title, type }) => ({
            detail: detail?.trim() || null,
            title: title.trim(),
            type,
          })),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sürüm kaydedilemedi.");
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setError(null);

    try {
      await requestJson(`/api/v1/admin/releases/${release.id}/publish`, { method: "POST" });
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sürüm yayınlanamadı.");
      setBusy(null);
    }
  }

  async function withdraw() {
    if (
      !(await confirmAction(
        "Bu yayının indirmeleri ve yeni güncellemeleri durdurulacak. Kurulu uygulamalar eski sürüme dönmez. Devam edilsin mi?",
        true,
      ))
    )
      return;
    setBusy("withdraw");
    setError(null);
    try {
      await requestJson(`/api/v1/admin/releases/${release.id}/withdraw`, { method: "POST" });
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Yayın geri çekilemedi.");
      setBusy(null);
    }
  }

  async function removeRelease() {
    if (!(await confirmAction(`${release.version} sürümünü silmek istiyor musun?`, true))) {
      return;
    }

    setBusy("delete");
    setError(null);

    try {
      await requestJson(`/api/v1/admin/releases/${release.id}`, { method: "DELETE" });
      window.location.href = "/admin/releases";
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sürüm silinemedi.");
      setBusy(null);
    }
  }

  function updateChange(index: number, patch: Partial<AdminReleaseChange>) {
    setChanges((current) =>
      current.map((change, changeIndex) =>
        changeIndex === index ? { ...change, ...patch } : change,
      ),
    );
  }

  function moveChange(index: number, direction: -1 | 1) {
    setChanges((current) => {
      const target = index + direction;

      if (target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function addChange() {
    setChanges((current) => [
      ...current,
      {
        detail: null,
        id: `new-${current.length}`,
        position: current.length,
        title: "",
        type: "NEW",
      },
    ]);
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={
          canWrite ? (
            <>
              <Button
                disabled={busy !== null || Boolean(release.withdrawnAt)}
                onClick={() => void (release.publishedAt ? withdraw() : removeRelease())}
                type="button"
                variant="outline"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {release.publishedAt ? "Yayını geri çek" : "Sil"}
              </Button>
              {!release.publishedAt && release.product === "MOBILE" ? (
                <Button
                  disabled={busy !== null}
                  onClick={() => void publish()}
                  type="button"
                  variant="outline"
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  Yayınla
                </Button>
              ) : null}
              <Button disabled={busy !== null} onClick={() => void save()} type="button">
                {busy === "save" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Kaydet
              </Button>
            </>
          ) : undefined
        }
        subtitle={`${release.product === "DESKTOP" ? "Masaüstü" : "Mobil"} · ${release.withdrawnAt ? "Geri çekildi" : release.publishedAt ? "Yayınlandı" : "Taslak"}`}
        title={`${release.version} sürümünü düzenle`}
      />

      <Link
        className="text-app-muted inline-flex items-center gap-2 text-sm font-semibold hover:text-app-foreground"
        href="/admin/releases"
      >
        <ArrowLeft className="h-4 w-4" />
        Sürümlere dön
      </Link>

      {error ? (
        <p aria-live="polite" className="text-app-danger text-sm">
          {error}
        </p>
      ) : null}

      {release.sourceRunUrl ? (
        <a
          href={release.sourceRunUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[hsl(var(--primary))] text-sm"
        >
          GitHub yayın çalışması · {release.sourceSha?.slice(0, 12)} · Başarısız finalizasyon için
          “Re-run failed jobs”
        </a>
      ) : null}
      {release.packages.length ? (
        <AdminCard>
          <h2 className="mb-3 font-semibold">Yayın paketleri</h2>
          <div className="space-y-3">
            {release.packages.map((item) => (
              <div key={item.platform} className="app-panel-soft rounded-lg border p-3 text-sm">
                <p>
                  {item.platform} · {item.arch} · {(item.sizeBytes / 1048576).toFixed(1)} MB
                  {item.versionCode ? ` · Build ${item.versionCode}` : ""}
                </p>
                <a className="break-all text-[hsl(var(--primary))]" href={item.url}>
                  {item.url}
                </a>
                <p className="break-all text-xs">SHA-256: {item.sha256}</p>
                {item.signature ? (
                  <details>
                    <summary>Güncelleme imzası</summary>
                    <p className="break-all text-xs">{item.signature}</p>
                  </details>
                ) : null}
                {item.signingCertSha256 ? (
                  <p className="break-all text-xs">Sertifika: {item.signingCertSha256}</p>
                ) : null}
              </div>
            ))}
          </div>
        </AdminCard>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <AdminCard className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Versiyon</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                disabled={!canWrite || release.publishedAt !== null}
                onChange={(event) => setForm({ ...form, version: event.target.value })}
                value={form.version}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Kod adı</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                onChange={(event) => setForm({ ...form, codename: event.target.value })}
                value={form.codename}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Kanal</span>
              <select
                className="app-input h-11 rounded-[12px] border px-3"
                onChange={(event) =>
                  setForm({ ...form, channel: event.target.value as AdminRelease["channel"] })
                }
                disabled={!canWrite || Boolean(release.publishedAt)}
                value={form.channel}
              >
                <option value="STABLE">Stable</option>
                <option value="UAT">Beta (UAT)</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Sürüm tarihi</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                onChange={(event) => setForm({ ...form, releasedAt: event.target.value })}
                type="date"
                disabled={!canWrite || release.managed}
                value={form.releasedAt}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Build</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                min="0"
                readOnly
                type="number"
                value={release.buildNumber ?? ""}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Boyut (byte)</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                min="0"
                readOnly
                type="number"
                value={release.sizeBytes ?? ""}
              />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                checked={form.mandatory}
                onChange={(event) => setForm({ ...form, mandatory: event.target.checked })}
                type="checkbox"
              />
              <span className="text-app-foreground font-semibold">Zorunlu güncelleme</span>
            </label>
            <label className="grid gap-1.5 text-sm md:col-span-2">
              <span className="text-app-muted text-xs font-semibold">Özet</span>
              <textarea
                className="app-input min-h-24 rounded-[12px] border p-3"
                maxLength={600}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                value={form.summary}
              />
            </label>
            <label className="grid gap-1.5 text-sm md:col-span-2">
              <span className="text-app-muted text-xs font-semibold">Öne çıkan</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                maxLength={160}
                onChange={(event) => setForm({ ...form, highlight: event.target.value })}
                value={form.highlight}
              />
            </label>
          </AdminCard>

          <AdminCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-app-foreground text-base font-semibold">
                  Değişiklik maddeleri
                </h2>
                <p className="text-app-muted text-xs">Liste sırası `position` olarak kaydedilir.</p>
              </div>
              <Button onClick={addChange} type="button" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Madde ekle
              </Button>
            </div>
            <div className="space-y-3">
              {changes.map((change, index) => (
                <div
                  className="app-panel-soft grid gap-3 rounded-[14px] border p-4 md:grid-cols-[150px_1fr_auto]"
                  key={change.id}
                >
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-app-muted text-xs font-semibold">Tip</span>
                    <select
                      className="app-input h-10 rounded-[10px] border px-3"
                      onChange={(event) =>
                        updateChange(index, {
                          type: event.target.value as AdminReleaseChange["type"],
                        })
                      }
                      value={change.type}
                    >
                      <option value="NEW">Yeni</option>
                      <option value="IMPROVED">İyileştirme</option>
                      <option value="FIXED">Düzeltme</option>
                    </select>
                  </label>
                  <div className="grid gap-3">
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-app-muted text-xs font-semibold">Başlık</span>
                      <input
                        className="app-input h-10 rounded-[10px] border px-3"
                        maxLength={200}
                        onChange={(event) => updateChange(index, { title: event.target.value })}
                        value={change.title}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-app-muted text-xs font-semibold">Açıklama</span>
                      <textarea
                        className="app-input min-h-20 rounded-[10px] border p-3"
                        maxLength={600}
                        onChange={(event) => updateChange(index, { detail: event.target.value })}
                        value={change.detail ?? ""}
                      />
                    </label>
                  </div>
                  <div className="flex gap-1 md:flex-col">
                    <button
                      aria-label="Yukarı taşı"
                      className="text-app-muted rounded-lg p-2 hover:bg-[var(--surface-hover)]"
                      disabled={index === 0}
                      onClick={() => moveChange(index, -1)}
                      type="button"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Aşağı taşı"
                      className="text-app-muted rounded-lg p-2 hover:bg-[var(--surface-hover)]"
                      disabled={index === changes.length - 1}
                      onClick={() => moveChange(index, 1)}
                      type="button"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Maddeyi sil"
                      className="text-app-danger rounded-lg p-2 hover:bg-[hsl(var(--danger)/0.12)]"
                      onClick={() =>
                        setChanges((current) =>
                          current.filter((_entry, changeIndex) => changeIndex !== index),
                        )
                      }
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>

        <aside>
          <div className="sticky top-4">
            <p className="text-app-muted mb-2 text-xs font-bold tracking-wide uppercase">
              Sürüm notları önizlemesi
            </p>
            <div
              className="rounded-[24px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card))] p-5"
              style={{ width: 358 }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-app-muted text-[11px] font-bold uppercase">
                    Sürüm {form.version || "—"}
                  </p>
                  <h3 className="text-app-foreground mt-1 text-lg font-bold">
                    {form.codename || "Yenilikler"}
                  </h3>
                </div>
                <AdminPill tone={release.publishedAt ? "success" : "warning"}>
                  {release.publishedAt ? "Yayında" : "Taslak"}
                </AdminPill>
              </div>
              {form.summary ? (
                <p className="text-app-muted mt-3 text-sm leading-6">{form.summary}</p>
              ) : null}
              <div className="mt-4 space-y-3">
                {changes.map((change) => (
                  <div className="rounded-[14px] bg-[hsl(var(--surface-soft))] p-3" key={change.id}>
                    <p className="text-[hsl(var(--primary))] text-[10px] font-bold">
                      {change.type}
                    </p>
                    <p className="text-app-foreground mt-1 text-sm font-semibold">
                      {change.title || "Başlıksız madde"}
                    </p>
                    {change.detail ? (
                      <p className="text-app-muted mt-1 text-xs">{change.detail}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
