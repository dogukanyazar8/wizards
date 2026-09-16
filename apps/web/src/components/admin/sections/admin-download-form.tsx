"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@wizards/ui";
import { AdminCard, AdminCardHeader } from "@/components/admin/kit/admin-primitives";
import {
  readAdminDownloadForm,
  toDownloadDateTimeInput,
} from "@/lib/downloads/admin-download-client";
import type {
  AdminDownloadArtifact,
  AdminDownloadArtifactInput,
} from "@/lib/downloads/admin-download-service";

const inputClass = "app-input h-11 w-full min-w-0 rounded-[12px] border px-3";

export function AdminDownloadForm({
  artifact,
  busy,
  onCancel,
  onSave,
}: {
  artifact: AdminDownloadArtifact | null;
  busy: boolean;
  onCancel(): void;
  onSave(input: AdminDownloadArtifactInput): Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    try {
      await onSave(readAdminDownloadForm(new FormData(event.currentTarget)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Paket kaydedilemedi.");
    }
  }

  return (
    <AdminCard>
      <AdminCardHeader
        title={artifact ? "Paketi Düzenle" : "Yeni İndirme Paketi"}
        subtitle="Paketin HTTPS bağlantısını veya mağaza bağlantısını girin. Her ortam ve platform için tek güncel paket bulunur."
      />
      <p className="text-app-muted mb-4 text-sm">
        {artifact?.publishedAt
          ? "Bu paket yayında. Kaydettiğiniz değişiklikler indirme penceresine hemen yansır."
          : "Paket taslak olarak kaydedilir. Kullanıcılara açmak için ayrıca Yayınla düğmesini kullanın."}
      </p>
      <form aria-label={artifact ? "Paketi düzenle" : "Paket ekle"} onSubmit={submit}>
        <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2" disabled={busy}>
          <label className="grid gap-1.5 text-sm">
            <span>Ortam</span>
            <select
              autoFocus
              className={inputClass}
              defaultValue={artifact?.channel ?? "UAT"}
              name="channel"
            >
              <option value="UAT">UAT (Beta)</option>
              <option value="STABLE">PROD (Kararlı)</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Platform</span>
            <select
              className={inputClass}
              defaultValue={artifact?.platform ?? "WINDOWS"}
              name="platform"
            >
              <option value="WINDOWS">Windows</option>
              <option value="MACOS">macOS</option>
              <option value="LINUX">Linux</option>
              <option value="ANDROID">Android</option>
              <option value="IOS">iOS</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Dağıtım türü</span>
            <select
              className={inputClass}
              defaultValue={artifact?.delivery ?? "DIRECT"}
              name="delivery"
            >
              <option value="DIRECT">Doğrudan indirme</option>
              <option value="STORE">Mağaza</option>
              <option value="TESTFLIGHT">TestFlight</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Sürüm tarihi (yerel saat)</span>
            <input
              className={inputClass}
              defaultValue={toDownloadDateTimeInput(
                artifact?.releasedAt ?? new Date().toISOString(),
              )}
              name="releasedAt"
              required
              step="0.001"
              type="datetime-local"
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm sm:col-span-2">
            <span>HTTPS bağlantısı</span>
            <input
              className={inputClass}
              defaultValue={artifact?.url ?? ""}
              maxLength={2048}
              name="url"
              placeholder="https://downloads.example.com/uat/setup.exe"
              required
              type="url"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Sürüm</span>
            <input
              className={inputClass}
              defaultValue={artifact?.versionLabel ?? ""}
              maxLength={32}
              name="versionLabel"
              placeholder="1.2.3"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Derleme numarası (isteğe bağlı)</span>
            <input
              className={inputClass}
              defaultValue={artifact?.buildLabel ?? ""}
              maxLength={32}
              name="buildLabel"
            />
          </label>
          {(
            [
              ["extensionLabelTr", "Paket etiketi (TR)", ".exe · x64"],
              ["extensionLabelEn", "Paket etiketi (EN)", ".exe · x64"],
              ["metaLabelTr", "Platform açıklaması (TR)", "Windows 10/11 · 96 MB"],
              ["metaLabelEn", "Platform açıklaması (EN)", "Windows 10/11 · 96 MB"],
            ] as const
          ).map(([name, label, placeholder]) => (
            <label className="grid gap-1.5 text-sm" key={name}>
              <span>{label}</span>
              <input
                className={inputClass}
                defaultValue={artifact?.[name] ?? ""}
                maxLength={120}
                name={name}
                placeholder={placeholder}
                required
              />
            </label>
          ))}
          <label className="grid gap-1.5 text-sm">
            <span>Dosya boyutu (bayt, isteğe bağlı)</span>
            <input
              className={inputClass}
              defaultValue={artifact?.sizeBytes ?? ""}
              max={Number.MAX_SAFE_INTEGER}
              min={1}
              name="sizeBytes"
              step={1}
              type="number"
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm">
            <span>SHA-256 (isteğe bağlı)</span>
            <input
              autoCapitalize="none"
              className={inputClass}
              defaultValue={artifact?.sha256 ?? ""}
              maxLength={64}
              name="sha256"
              spellCheck={false}
            />
          </label>
          <div className="sm:col-span-2">
            {error ? (
              <p className="text-app-danger mb-3 text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} type="submit">
                {busy ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
                {busy ? "Kaydediliyor…" : artifact ? "Değişiklikleri Kaydet" : "Taslak Oluştur"}
              </Button>
              <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
                Vazgeç
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </AdminCard>
  );
}
