"use client";

import React from "react";

import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

/**
 * Ayar grubu — SPEC-AYARLAR §4.4, PROMPT §2.
 *
 * Ayarlar tek tek yüzen kart değil: başlıklı bir kabın içinde satırlar 1 px ayırıcıyla dizilir.
 *
 * **Kapta `overflow:hidden` yok** (tuzak #6). Kırpma burada yapılırsa 22 açılır menünün her biri
 * kabın kenarında kesilir ve son seçenek erişilemez olur; kırpmayı yalnız `SettingCustomBlock`
 * `fullWidth` bayrağıyla kendi içinde yapar. `position:relative` menünün çıpası, kırpıcısı değil.
 *
 * Başlık **isteğe bağlıdır** (sapma #8): profil hero grubu ve Hakkında'nın ilk grubu referansta
 * `['', '', [...]]` olarak duruyor, yani etiketsiz bir kap gerçek bir durumdur.
 */

const { body } = SETTINGS_METRICS;

export type SettingsGroupProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly note?: string | undefined;
  readonly testId?: string;
  readonly title?: string | undefined;
};

export function SettingsGroup({ children, className, note, testId, title }: SettingsGroupProps) {
  return (
    <section
      className={className}
      data-testid={testId}
      style={{ marginBottom: pxToRem(body.groupMarginBottom) }}
    >
      {title ? (
        <div
          className="flex items-baseline"
          style={{
            gap: pxToRem(body.groupHeaderGap),
            paddingBottom: pxToRem(body.groupHeaderPaddingBottom),
          }}
        >
          <span
            className="font-display text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(body.groupTitleFontSize),
              fontWeight: body.groupTitleWeight,
              lineHeight: body.groupTitleLineHeight,
            }}
          >
            {title}
          </span>
          {note ? (
            <span
              className="min-w-0 flex-1 text-pretty text-[hsl(var(--text-muted))]"
              style={{
                fontSize: pxToRem(body.groupNoteFontSize),
                fontWeight: body.groupNoteWeight,
                lineHeight: body.groupNoteLineHeight,
              }}
            >
              {note}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "relative bg-[hsl(var(--surface-card))]",
          // Kasten `overflow-visible`: sınıfın varlığı, birinin sonradan `overflow-hidden`
          // eklemesini bir kod taraması testiyle yakalanabilir kılıyor.
          "overflow-visible",
        )}
        style={{
          border: `${hairline()} solid hsl(var(--border) / ${body.groupBorderAlpha})`,
          borderRadius: pxToRem(body.groupRadius),
        }}
      >
        {children}
      </div>
    </section>
  );
}
