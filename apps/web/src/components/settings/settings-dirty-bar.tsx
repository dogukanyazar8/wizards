"use client";

// The default import is what the node test runner's classic JSX transform resolves this
// component's elements against; Next's compiler does not need it.
import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

const { saveBar } = SETTINGS_METRICS;

export type SettingsDirtyBarProps = {
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  readonly pending?: boolean;
};

/**
 * Kirli şerit — SPEC §4.5, Ş5 §7.
 *
 * Yalnız yedi profil alanı (`pn`, `pu`, `pbio`, `pp`, `ps`, `pe`, `px`) bu şeridi
 * çıkarır; kararı `isSettingsDirtyKey` verir (sapma #5). Diğer tercihler dokununca kaydedilir
 * ve durumlarını başlıktaki göstergeden bildirir.
 *
 * Kirliyken bölüm/sekme değiştirmek **engellenmez**: kullanıcıyı bir sekmeye kilitlemek
 * kaydedilmemiş bir alanı kurtarmaz, yalnız pencereyi kullanılmaz yapar. Şerit görünmeye
 * devam eder; pencereyi kapatmak onay ister.
 */
export function SettingsDirtyBar({ onDiscard, onSave, pending = false }: SettingsDirtyBarProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      data-testid="settings-dirty-bar"
      style={{
        background: "hsl(var(--surface-card))",
        height: pxToRem(SETTINGS_METRICS.footerHeight),
        borderTop: `${hairline()} solid hsl(var(--border)/${saveBar.borderTopAlpha})`,
        gap: pxToRem(saveBar.gap),
        padding: `${pxToRem(saveBar.paddingY)} ${pxToRem(saveBar.paddingX)}`,
      }}
    >
      <p
        className="min-w-0 truncate text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(saveBar.textFontSize),
          fontWeight: saveBar.textWeight,
          lineHeight: saveBar.textLineHeight,
        }}
      >
        {t("settings.dirty")}
      </p>

      <div className="flex shrink-0 items-center" style={{ gap: pxToRem(saveBar.gap) }}>
        <button
          className="inline-flex items-center justify-center border text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft)/0.6)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
          data-testid="settings-dirty-discard"
          disabled={pending}
          onClick={onDiscard}
          style={{
            borderColor: `hsl(var(--border)/0.7)`,
            borderRadius: pxToRem(saveBar.saveRadius),
            fontSize: pxToRem(saveBar.saveFontSize),
            height: pxToRem(saveBar.resetHeight),
            padding: `0 ${pxToRem(saveBar.resetPaddingX)}`,
          }}
          type="button"
        >
          {t("settings.discard")}
        </button>

        <button
          className={cn(
            "inline-flex items-center justify-center transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60",
          )}
          data-testid="settings-dirty-save"
          disabled={pending}
          onClick={onSave}
          style={{
            background: "hsl(var(--primary))",
            borderRadius: pxToRem(saveBar.saveRadius),
            color: "#fff",
            fontSize: pxToRem(saveBar.saveFontSize),
            fontWeight: saveBar.textWeight,
            height: pxToRem(saveBar.saveHeight),
            padding: `0 ${pxToRem(saveBar.savePaddingX)}`,
          }}
          type="button"
        >
          {t("settings.saveChanges")}
        </button>
      </div>
    </div>
  );
}
