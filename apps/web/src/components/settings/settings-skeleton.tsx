import React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

const { body } = SETTINGS_METRICS;

/**
 * Yükleniyor durumu — SPEC §4.6, Ş5 §10.
 *
 * Dört blok (`96 · 150 · 112 · 64`) bir tahmin değil, ilk sekmenin gerçek grup yükseklikleri:
 * bölüm geldiğinde düzen zıplamaz. Yükseklikler sözlükten rem olarak okunur, ölçek adımıyla
 * birlikte büyür (SPEC-ANA-SAYFA §8.2).
 */
export function SettingsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col"
      data-testid="settings-skeleton"
      style={{ gap: pxToRem(body.skeletonGap) }}
    >
      {body.skeletonHeights.map((height, index) => (
        <Skeleton
          key={`${height}-${index}`}
          style={{
            background: `hsl(var(--surface-soft)/${body.skeletonSurfaceAlpha})`,
            borderRadius: pxToRem(body.skeletonRadius),
            height: pxToRem(height),
          }}
        />
      ))}
    </div>
  );
}
