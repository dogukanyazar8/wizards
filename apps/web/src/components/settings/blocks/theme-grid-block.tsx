"use client";

import React, { useSyncExternalStore } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { useThemeSelection } from "@/components/settings/blocks/simple-theme-block";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import {
  ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER,
  getThemePreviewBackground,
} from "@/lib/appearance";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Tüm temalar (`t2`) — 23 tema, üç kolon (SPEC §5.3, K6).
 *
 * **Kimlik ve renk korunur.** Ad `displayNameKey`'den, `Koyu`/`Açık` etiketi kaydın kendi
 * `mode` alanından gelir — tasarımın 13/10 sayımı değil, koddaki 14/9 geçerli
 * (SPEC_DEVIATIONS #1). Blok bir **sayaç yazmaz**; yalnız etiketler.
 *
 * Izgara ağır bölüm (PROMPT §performans): ilk boyada 23 swatch yerine tek bir iskelet çizilir
 * ve gerçek ızgara istemcide gelir. Kapı bir `useSyncExternalStore`: sunucu anlık görüntüsü
 * `false`, istemci `true`. `useEffect` + `setState` aynı işi yapardı ama render'dan sonra bir
 * kademe daha akıtırdı ve `react-hooks/set-state-in-effect` kuralına takılırdı.
 */

const { themeGrid } = SETTINGS_METRICS.blocks;
const { body } = SETTINGS_METRICS;

const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

export function ThemeGridBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

  if (!mounted) {
    return (
      <div
        aria-busy="true"
        aria-label={t("settings.control.block.loading")}
        className="motion-safe:animate-pulse"
        data-block="themeGrid"
        data-block-skeleton="themeGrid"
        role="status"
        style={{
          background: `hsl(var(--surface-soft) / ${body.skeletonSurfaceAlpha})`,
          borderRadius: pxToRem(SETTINGS_METRICS.row.customRadius),
          height: pxToRem(body.skeletonHeights[1] ?? 150),
        }}
      />
    );
  }

  return <ThemeGridBlockBody rowKey={rowDef.key} />;
}

export function ThemeGridBlockBody({ rowKey }: { readonly rowKey: string }) {
  const { t } = useI18n();
  const { select, selected } = useThemeSelection();

  return (
    <div
      aria-label={t("settings.block.theme.allLegend")}
      className="grid"
      data-block="themeGrid"
      data-testid={`settings-block-${rowKey}`}
      role="radiogroup"
      style={{
        gap: pxToRem(6),
        gridTemplateColumns: `repeat(${themeGrid.columns}, minmax(0, 1fr))`,
        padding: `${pxToRem(14)} ${pxToRem(15)}`,
      }}
    >
      {ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER.map((themeDefinition) => {
        const active = themeDefinition.id === selected;

        return (
          <button
            aria-checked={active}
            className="flex items-center text-left"
            data-testid={`settings-theme-${themeDefinition.id}`}
            data-theme-mode={themeDefinition.mode}
            key={themeDefinition.id}
            onClick={() => select(themeDefinition.id)}
            role="radio"
            style={{
              background: active ? "hsl(var(--primary) / 0.1)" : "transparent",
              border: `${hairline()} solid hsl(var(--border) / ${active ? 0.45 : 0.5})`,
              borderColor: active ? "hsl(var(--primary) / 0.45)" : undefined,
              borderRadius: pxToRem(11),
              fontFamily: "inherit",
              gap: pxToRem(9),
              padding: `${pxToRem(themeGrid.rowPaddingY)} ${pxToRem(themeGrid.rowPaddingX)}`,
            }}
            type="button"
          >
            <span
              aria-hidden="true"
              className="flex-none"
              style={{
                background: getThemePreviewBackground(themeDefinition.preview),
                borderRadius: pxToRem(themeGrid.swatchRadius),
                boxShadow: `inset 0 0 0 ${hairline()} hsl(var(--border) / 0.5)`,
                height: pxToRem(themeGrid.swatchSize),
                width: pxToRem(themeGrid.swatchSize),
              }}
            />
            <span
              className="min-w-0 flex-1 truncate"
              style={{
                color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                fontSize: pxToRem(11.5),
                fontWeight: active ? 600 : 500,
                lineHeight: 1.2,
              }}
            >
              {t(themeDefinition.displayNameKey)}
            </span>
            <span
              className="flex-none"
              style={{
                color: "hsl(var(--text-muted) / 0.85)",
                fontSize: pxToRem(9),
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {t(`settings.block.theme.mode.${themeDefinition.mode}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
