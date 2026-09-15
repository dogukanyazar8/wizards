"use client";

// The default import is what the node test runner's classic JSX transform resolves this
// component's elements against; Next's compiler does not need it.
import React from "react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsSaveIndicator } from "@/components/settings/settings-save-indicator";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import type { SettingsSaveState } from "@/components/settings/settings-window-state";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

const { header } = SETTINGS_METRICS;

export type SettingsHeaderProps = {
  readonly leadKey: string;
  readonly onClose: () => void;
  readonly onRetrySave?: (() => void) | undefined;
  readonly saveState: SettingsSaveState;
  readonly titleId: string;
  readonly titleKey: string;
};

/**
 * İçerik başlığı — SPEC §4.2, Ş5 §4.
 *
 * **Web / Masaüstü segmenti çizilmez** (K11, sapma #3): çalışma zamanı zaten bilinir, segment
 * referansta bir inceleme aracıdır. Geometrisi sözlükte `header.runtimeSegment` altında
 * duruyor çünkü başlığın kalan boşluğu ona göre hesaplandı — çizilmemesi ölçüyü silmez.
 *
 * Bölüm adı ve alt satırı `nowrap` + `ellipsis`: uzun bir çeviri başlığı iki satıra taşırsa
 * başlık yüksekliği değişir ve altındaki sekme şeridi zıplar.
 */
export function SettingsHeader({
  leadKey,
  onClose,
  onRetrySave,
  saveState,
  titleId,
  titleKey,
}: SettingsHeaderProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      data-testid="settings-header"
      style={{
        background: "hsl(var(--surface-card))",
        borderBottom: `${hairline()} solid hsl(var(--border)/${header.borderBottomAlpha})`,
        gap: pxToRem(header.gap),
        padding: `${pxToRem(header.paddingY)} ${pxToRem(header.paddingX)}`,
      }}
    >
      <div className="min-w-0">
        <h2
          className={cn("truncate whitespace-nowrap text-[hsl(var(--foreground))]", DISPLAY_FONT)}
          id={titleId}
          style={{
            fontSize: pxToRem(header.titleFontSize),
            fontWeight: header.titleWeight,
            lineHeight: header.titleLineHeight,
          }}
        >
          {t(titleKey)}
        </h2>
        <p
          className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(header.leadFontSize),
            fontWeight: header.leadWeight,
            lineHeight: header.leadLineHeight,
            marginTop: pxToRem(header.leadMarginTop),
          }}
        >
          {t(leadKey)}
        </p>
      </div>

      <div
        className="flex min-w-0 max-w-[70%] shrink-0 items-center"
        style={{ gap: pxToRem(header.gap) }}
      >
        <SettingsSaveIndicator onRetry={onRetrySave} state={saveState} />

        <WindowCloseButton
          aria-label={t("settings.close")}
          onClick={onClose}
          testId="in-app-settings-close"
        />
      </div>
    </div>
  );
}
