"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { useNotificationsSection } from "@/components/settings/sections/notifications/notifications-section-context";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §2. `Şu anki durum` — üç kutulu özet.
 *
 * Üç sayının üçü de **gerçek** veridir. Tasarımdaki `9/15 · 2/4 · 6` örnek veridir ve
 * sabitlenmez: bir özet kutusunun tek işi ekranın geri kalanını özetlemek ve yanlış bir özet,
 * doğru bir ekranı da şüpheli yapar.
 *
 * Payda ürünün kendi sayımından gelir: on dört açılabilir tür artı kilitli iki tür = 16.
 * Kilitli ikisi her zaman açık sayılır çünkü kapatılamıyorlar (tuzak #5).
 *
 * İstisna sayısı Ş4'ün ucunun **uzunluğudur**; ikinci bir sayaç kurulmaz. İki sayaç, bir gün
 * ayrışan iki sayı demektir — ve hangisinin doğru olduğunu kimse bilemez.
 *
 * Veri gelmeden sayı yerine tire çizilir. Yükleme sırasında sıfır yazmak, "hiçbir bildirim
 * türün açık değil" diyen bir ekran demekti.
 */

const { notifSummary } = SETTINGS_METRICS.blocks;
const { row } = SETTINGS_METRICS;

const PLACEHOLDER_VALUE = "—";

export function NotifSummaryBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const { summary } = useNotificationsSection();

  const cells: readonly { readonly label: string; readonly value: string }[] = [
    {
      label: t("settings.block.notifSummary.types"),
      value: summary
        ? t("settings.block.notifSummary.ratio", {
            open: summary.typesOpen,
            total: summary.typesTotal,
          })
        : PLACEHOLDER_VALUE,
    },
    {
      label: t("settings.block.notifSummary.channels"),
      value: summary
        ? t("settings.block.notifSummary.ratio", {
            open: summary.channelsOpen,
            total: summary.channelsTotal,
          })
        : PLACEHOLDER_VALUE,
    },
    {
      label: t("settings.block.notifSummary.exceptions"),
      value: summary
        ? summary.exceptionsTruncated
          ? t("settings.block.notifSummary.overflow", { count: summary.exceptions })
          : String(summary.exceptions)
        : PLACEHOLDER_VALUE,
    },
  ];

  return (
    <div
      aria-busy={summary ? undefined : true}
      className="grid"
      data-block="notifSummary"
      data-setting-block={rowDef.key}
      style={{ gridTemplateColumns: `repeat(${notifSummary.columns}, minmax(0, 1fr))` }}
    >
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          style={{
            ...(index % notifSummary.columns === 0
              ? {}
              : {
                  borderLeft: `${hairline(row.dividerWidth)} solid hsl(var(--border) / ${row.dividerAlpha})`,
                }),
            padding: `${pxToRem(notifSummary.cellPaddingY)} ${pxToRem(notifSummary.cellPaddingX)}`,
          }}
        >
          <div
            className="font-display text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(notifSummary.valueFontSize),
              fontWeight: notifSummary.valueWeight,
              lineHeight: notifSummary.valueLineHeight,
            }}
          >
            {cell.value}
          </div>
          <div
            className="text-pretty text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(notifSummary.labelFontSize),
              lineHeight: notifSummary.labelLineHeight,
              marginTop: pxToRem(notifSummary.labelMarginTop),
            }}
          >
            {cell.label}
          </div>
        </div>
      ))}
    </div>
  );
}
