"use client";

import React, { useCallback, useTransition } from "react";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { updateThemePreferenceAction } from "@/lib/appearance/actions";
import {
  applyWizardsThemeToDocument,
  getThemePreviewBackground,
  normalizeWizardsThemeId,
  SIMPLE_WIZARDS_THEMES,
  type WizardsThemeId,
} from "@/lib/appearance";
import { SETTINGS_METRICS, pxToEm, pxToRem } from "@/lib/settings/metrics";

/**
 * Basit temalar (`t1`) — SPEC §5.3, K6.
 *
 * Dört kart: Light · Ash · Dark · Onyx. **Hiçbir tema kimliği ve rengi değişmez**; kart yalnız
 * `displayNameKey`'i çizer. Seçim üç yere birden gider (belge sınıfı, `next-themes`, sunucu) ve
 * bu sıra önemlidir: önce belge, sonra kalıcılık — kullanıcı rengin değiştiğini isteğin
 * dönüşünü beklemeden görür, sunucu düşerse de görünüm doğru kalır.
 */

const { simpleThemes } = SETTINGS_METRICS.blocks;

export type ThemeSelection = {
  readonly pending: boolean;
  readonly select: (themeId: WizardsThemeId) => void;
  readonly selected: WizardsThemeId;
};

/**
 * İki tema bloğunun paylaştığı seçim yolu.
 *
 * Izgara ve kartlar aynı kararı yazıyor; iki ayrı uygulama, biri `applyWizardsThemeToDocument`
 * çağırmayı unuttuğunda sessizce ayrışırdı.
 */
export function useThemeSelection(): ThemeSelection {
  const { setTheme, theme } = useTheme();
  const [pending, startTransition] = useTransition();

  const select = useCallback(
    (themeId: WizardsThemeId) => {
      const next = applyWizardsThemeToDocument(themeId);
      setTheme(next);

      startTransition(async () => {
        await updateThemePreferenceAction(next);
      });
    },
    [setTheme],
  );

  return { pending, select, selected: normalizeWizardsThemeId(theme) };
}

export function SimpleThemeBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const { select, selected } = useThemeSelection();

  return (
    <div
      aria-label={t("settings.block.theme.simpleLegend")}
      className="grid"
      data-block="themes"
      data-testid={`settings-block-${rowDef.key}`}
      role="radiogroup"
      style={{
        gap: pxToRem(9),
        gridTemplateColumns: `repeat(${simpleThemes.columns}, minmax(0, 1fr))`,
        padding: `${pxToRem(14)} ${pxToRem(15)}`,
      }}
    >
      {SIMPLE_WIZARDS_THEMES.map((themeDefinition) => {
        const active = themeDefinition.id === selected;

        return (
          <button
            aria-checked={active}
            className="block overflow-hidden text-left"
            data-testid={`settings-theme-${themeDefinition.id}`}
            key={themeDefinition.id}
            onClick={() => select(themeDefinition.id)}
            role="radio"
            style={{
              background: "transparent",
              border: `${pxToRem(simpleThemes.selectedBorderWidth)} solid ${
                active ? "hsl(var(--primary))" : "hsl(var(--border) / 0.6)"
              }`,
              borderRadius: pxToRem(13),
              fontFamily: "inherit",
              padding: 0,
            }}
            type="button"
          >
            <span
              aria-hidden="true"
              className="block"
              style={{
                background: getThemePreviewBackground(themeDefinition.preview),
                height: pxToRem(simpleThemes.previewHeight),
              }}
            />
            <span
              className="flex items-center"
              style={{
                background: "hsl(var(--surface-base))",
                gap: pxToRem(7),
                padding: `${pxToRem(9)} ${pxToRem(10)}`,
              }}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={{
                  color: "hsl(var(--foreground))",
                  fontSize: pxToRem(11.5),
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {t(themeDefinition.displayNameKey)}
              </span>
              {active ? (
                <Check
                  aria-hidden="true"
                  size={pxToEm(13)}
                  strokeWidth={2.8}
                  style={{ color: "hsl(var(--primary))", flex: "none" }}
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
