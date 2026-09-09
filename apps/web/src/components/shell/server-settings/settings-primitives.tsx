"use client";

import React, { useId } from "react";

import { ServerToggleSwitch } from "@/components/servers/shared/toggle-row";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { isCounterWarning } from "@/lib/servers/modal-form-model";

/**
 * Sunucu ayarları bölümlerinin ortak parçaları — SPEC-SUNUCU §8.1–§8.3.
 *
 * Dokuz bölüm aynı kart dilini konuşuyor (`16px` `r18` `surface-card` `border/.6`) ve iki
 * bölüm aynı anahtar satırını (`13px 15px` `r16`, `32` ikon, `40×22` anahtar). Bunlar
 * `components/servers/shared/` altına konmadı çünkü orası **iki yüzeyin** (pencere +
 * ayarlar) paylaştığı parçaların yeri; buradakiler yalnız ayarlar kabuğunun içinde yaşıyor.
 *
 * §8.2/§8.3'ün satırı `ToggleRow` **değildir**: `ToggleRow` §7.6'nın `12px 14px` `r14`
 * `surface-base` satırıdır ve ikon taşımaz. Referans (`Sunucu.dc.html` `visRows`/`contentRows`)
 * burada ikonlu, çipli, `surface-card` bir satır çiziyor. Anahtarın kendisi yine ortak
 * (`ServerToggleSwitch`) — iki anahtar uygulaması iki ayrı `aria` davranışı demek olurdu.
 */

const { settings, settingsSections } = SERVER_METRICS;

export function SettingsGlyph({
  path,
  size,
  strokeWidth = 1.9,
}: {
  path: string;
  size: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(size)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={pxToEm(size)}
    >
      <path d={path} />
    </svg>
  );
}

/** §8'in bölüm kartı: `16px` boşluk, `r18`, `surface-card`, `border/.6`. */
export function SettingsCard({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={className}
      data-testid={testId}
      style={{
        background: "hsl(var(--surface-card))",
        borderColor: `hsl(var(--border)/${settings.cardBorderAlpha})`,
        borderRadius: pxToRem(settings.cardSectionRadius),
        borderStyle: "solid",
        borderWidth: hairline(),
        padding: pxToRem(settings.cardPadding),
      }}
    >
      {children}
    </div>
  );
}

/** Kart içindeki versal etiket (`600 10px/1`, `.15em`). */
export function SettingsCardLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  const Tag = htmlFor ? "label" : "span";

  return (
    <Tag
      className="block font-semibold uppercase text-[hsl(var(--text-muted))]"
      htmlFor={htmlFor}
      style={{
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(settings.sectionLabelFontSize),
        letterSpacing: `${settings.sectionLabelLetterSpacing}em`,
        lineHeight: 1,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * §8.1'in alan başlığı: versal etiket + sağda `N/M` sayacı. Sayaç sınırın `%85`ini geçince
 * `warning`'e döner — eşik `modal-form-model.isCounterWarning`'den gelir, burada ikinci kez
 * hesaplanmaz (00 §6).
 */
export function SettingsFieldHeader({
  htmlFor,
  label,
  length,
  max,
}: {
  htmlFor: string;
  label: string;
  length?: number;
  max?: number;
}) {
  const showCounter = typeof length === "number" && typeof max === "number";
  const warning = showCounter ? isCounterWarning(length, max) : false;

  return (
    <div className="flex items-center" style={{ gap: pxToRem(settingsSections.generalLabelGap) }}>
      <SettingsCardLabel htmlFor={htmlFor}>{label}</SettingsCardLabel>
      {showCounter ? (
        <span
          className="ml-auto flex-none font-semibold"
          data-testid={`${htmlFor}-counter`}
          data-warning={warning ? "true" : "false"}
          style={{
            color: warning ? "hsl(var(--warning))" : "hsl(var(--text-muted))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(SERVER_METRICS.modal.counterFontSize),
            lineHeight: 1,
          }}
        >
          {length}/{max}
        </span>
      ) : null}
    </div>
  );
}

export type SettingsToggleRowProps = {
  /** `Salt okunur` gibi bir durum çipi; anahtarsız satırlarda kullanılır. */
  chip?: string | undefined;
  description: string;
  /** `aria-disabled` + `not-allowed`; `disabled` **değil** (00 §8, `ToggleRow` ile aynı gerekçe). */
  disabled?: boolean | undefined;
  iconPath: string;
  /** İkon kutusunun tonu — token adı, renk değil. */
  tone: "danger" | "info" | "primary" | "success" | "warning";
  onChange?: ((checked: boolean) => void) | undefined;
  checked?: boolean | undefined;
  testId?: string | undefined;
  title: string;
};

/**
 * §8.2 · §8.3'ün satırı. Anahtarı olmayan satır da aynı kutuyu kullanır (`Sunucu türü`);
 * `onChange` verilmezse anahtar hiç çizilmez — referansın `hasToggle` bayrağı.
 */
export function SettingsToggleRow({
  checked,
  chip,
  description,
  disabled = false,
  iconPath,
  onChange,
  testId,
  title,
  tone,
}: SettingsToggleRowProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className="flex items-center border"
      data-testid={testId}
      style={{
        background: "hsl(var(--surface-card))",
        borderColor: `hsl(var(--border)/${settings.cardBorderAlpha})`,
        borderRadius: pxToRem(settingsSections.visibilityRowRadius),
        borderWidth: hairline(),
        gap: pxToRem(settingsSections.visibilityRowGap),
        opacity: disabled ? settingsSections.visibilityRowDisabledOpacity : undefined,
        padding: `${pxToRem(settingsSections.visibilityRowPaddingY)} ${pxToRem(
          settingsSections.visibilityRowPaddingX,
        )}`,
      }}
    >
      <span
        aria-hidden="true"
        className="grid flex-none place-items-center"
        style={{
          background: `hsl(var(--${tone})/${settingsSections.visibilityIconBackgroundAlpha})`,
          borderRadius: pxToRem(settingsSections.visibilityIconRadius),
          color: `hsl(var(--${tone}))`,
          height: pxToRem(settingsSections.visibilityIconSize),
          width: pxToRem(settingsSections.visibilityIconSize),
        }}
      >
        <SettingsGlyph path={iconPath} size={settingsSections.visibilityIconGlyphSize} />
      </span>

      <div className="min-w-0 flex-1">
        <div
          className="flex items-center"
          style={{ gap: pxToRem(settingsSections.visibilityTitleGap) }}
        >
          <span
            className="font-semibold text-[hsl(var(--foreground))]"
            id={titleId}
            style={{
              fontSize: pxToRem(settingsSections.visibilityTitleFontSize),
              lineHeight: settingsSections.visibilityTitleLineHeight,
            }}
          >
            {title}
          </span>
          {chip ? (
            <span
              className="flex-none font-semibold whitespace-nowrap text-[hsl(var(--text-muted))]"
              style={{
                background: "hsl(var(--surface-tertiary))",
                borderRadius: pxToRem(settings.visibilityChipRadius),
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(settings.visibilityChipFontSize),
                lineHeight: 1,
                padding: `${pxToRem(settings.visibilityChipPaddingY)} ${pxToRem(
                  settings.visibilityChipPaddingX,
                )}`,
              }}
            >
              {chip}
            </span>
          ) : null}
        </div>
        <div
          className="text-pretty text-[hsl(var(--text-muted))]"
          id={descriptionId}
          style={{
            fontSize: pxToRem(settingsSections.visibilityDescriptionFontSize),
            lineHeight: settingsSections.visibilityDescriptionLineHeight,
            marginTop: pxToRem(settingsSections.visibilityDescriptionMarginTop),
          }}
        >
          {description}
        </div>
      </div>

      {onChange ? (
        <ServerToggleSwitch
          ariaLabelledBy={titleId}
          checked={checked ?? false}
          describedBy={descriptionId}
          disabled={disabled}
          onChange={onChange}
          testId={testId ? `${testId}-switch` : undefined}
        />
      ) : null}
    </div>
  );
}
