"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Yenilikler (`o4`) — SPEC §5.6, üç kart: Bildirimler · Etkinlikler · Keşfet.
 *
 * Grubun başlığı sürüm numarasını taşır (`Yenilikler · 2.4.1`, ağaçta `titleData: "appVersion"`);
 * kartların kendisi sürüm numarası yazmaz.
 *
 * Ölçü notu: referans (`Ayarlar-referans.dc.html`) bu üçlüyü **satır** olarak çiziyor
 * (`display:flex;gap:13px;padding:13px 15px;border-top`), üç kolonlu bir ızgara olarak değil.
 * Otorite sırası referansın inline `style`'ını SPEC'in "üç kart" ifadesinin üstüne koyduğu için
 * çizim satır ölçülerini kullanır; `blocks.whatsNew.columns` kart **sayısıdır**.
 */

const { whatsNew } = SETTINGS_METRICS.blocks;

/** Ton token adıdır, renk değil — referans `primary` / `warning` / `success` sırasını veriyor. */
const CARD_TONE_TOKENS = ["--primary", "--warning", "--success"] as const;

export function WhatsNewBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();

  return (
    <div
      className="grid"
      data-block="whatsNew"
      data-testid={`settings-block-${rowDef.key}`}
      role="list"
      style={{ gridTemplateColumns: "max-content minmax(0,1fr)" }}
    >
      {CARD_TONE_TOKENS.map((toneToken, index) => {
        const card = index + 1;

        return (
          <article
            className="grid"
            data-whats-new={card}
            key={toneToken}
            role="listitem"
            style={{
              ...(index > 0
                ? {
                    borderTop: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                  }
                : {}),
              gap: pxToRem(whatsNew.rowGap),
              gridColumn: "1 / -1",
              gridTemplateColumns: "subgrid",
              padding: `${pxToRem(whatsNew.rowPaddingY)} ${pxToRem(whatsNew.rowPaddingX)}`,
            }}
          >
            <span
              className="h-fit flex-none rounded-full"
              style={{
                background: `hsl(var(${toneToken}) / ${whatsNew.tagSurfaceAlpha})`,
                color: `hsl(var(${toneToken}))`,
                fontSize: pxToRem(whatsNew.tagFontSize),
                fontWeight: whatsNew.tagWeight,
                lineHeight: 1.6,
                padding: `${pxToRem(whatsNew.tagPaddingY)} ${pxToRem(whatsNew.tagPaddingX)}`,
              }}
            >
              {t(`settings.block.whatsNew.${card}.tag`)}
            </span>

            <div className="min-w-0 flex-1">
              <div
                className="text-[hsl(var(--foreground))]"
                style={{
                  fontSize: pxToRem(whatsNew.titleFontSize),
                  fontWeight: whatsNew.titleWeight,
                  lineHeight: 1.25,
                }}
              >
                {t(`settings.block.whatsNew.${card}.title`)}
              </div>
              <div
                className="text-pretty text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(whatsNew.bodyFontSize),
                  lineHeight: whatsNew.bodyLineHeight,
                  marginTop: pxToRem(whatsNew.bodyMarginTop),
                }}
              >
                {t(`settings.block.whatsNew.${card}.body`)}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
