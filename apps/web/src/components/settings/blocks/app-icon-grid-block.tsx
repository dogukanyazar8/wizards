"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { APP_ICON_OPTIONS, type AppIconId } from "@/lib/app-icons";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { useAppStore } from "@/lib/store";

/**
 * Uygulama simgesi (`n1`) — SPEC §5.3.
 *
 * Yedi kutu: Whispr ve Wave 5…0. Seçim **gerçekten** favicon'u değiştirir: kutu `appIconId`'yi
 * yazar, `AppIconProvider` (`app/layout.tsx`) `link[rel="icon"]` etiketlerini o kimliğe göre
 * yeniden yazar ve masaüstünde tepsi simgesi aynı kaynaktan gelir. Yazılıp uygulanmayan bir
 * tercih bırakılmadı; bu yüzden blok kendi `<link>` yazıcısını **kurmaz** — iki yazıcı olsaydı
 * biri diğerinin üstüne yazardı.
 *
 * Görseller `public/app-icons/` altından gelir; kutu tonu token'dan (`--primary`), sabit renk
 * üretilmez.
 */

const { appIconGrid } = SETTINGS_METRICS.blocks;

export function AppIconGridBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const appIconId = useAppStore((state) => state.appIconId);
  const setAppIconId = useAppStore((state) => state.setAppIconId);

  return (
    <div
      aria-label={t("settings.block.appIcons.legend")}
      className="flex flex-wrap"
      data-block="appIcons"
      data-testid={`settings-block-${rowDef.key}`}
      role="radiogroup"
      style={{ gap: pxToRem(8), padding: `${pxToRem(14)} ${pxToRem(15)}` }}
    >
      {APP_ICON_OPTIONS.map((option) => {
        const active = option.id === appIconId;

        return (
          <button
            aria-checked={active}
            className="flex flex-col items-center"
            data-testid={`settings-app-icon-${option.id}`}
            key={option.id}
            onClick={() => setAppIconId(option.id as AppIconId)}
            role="radio"
            style={{
              background: active ? "hsl(var(--primary) / 0.08)" : "transparent",
              border: `${pxToRem(appIconGrid.selectedBorderWidth)} solid ${
                active ? "hsl(var(--primary))" : "transparent"
              }`,
              borderRadius: pxToRem(13),
              fontFamily: "inherit",
              gap: pxToRem(7),
              padding: pxToRem(9),
              width: pxToRem(appIconGrid.tileSize + 20),
            }}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Sabit 38 px'lik yerel
                bir PNG; `next/image` burada bir optimizasyon değil, ek bir yükleyici katmanı
                olurdu ve blok testleri Next çalışma zamanı olmadan çiziliyor. */}
            <img
              alt=""
              aria-hidden="true"
              height={appIconGrid.tileSize}
              src={option.src}
              style={{
                borderRadius: pxToRem(appIconGrid.tileRadius),
                height: pxToRem(38),
                width: pxToRem(38),
              }}
              width={appIconGrid.tileSize}
            />
            <span
              className="whitespace-nowrap"
              style={{
                color: active ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
                fontSize: pxToRem(10.5),
                fontWeight: active ? 600 : 500,
                lineHeight: 1,
              }}
            >
              {t(`settings.block.appIcons.${option.id.replace("-", "")}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
