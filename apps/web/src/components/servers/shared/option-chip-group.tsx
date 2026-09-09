"use client";

import React, { useId, useRef } from "react";

import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { cn } from "@/lib/utils";
import { DISPLAY_FONT } from "./typography";

/**
 * Tek seçimli çip grubu — SPEC-SUNUCU §6.2 (kanal sihirbazının 4. adımı), §7.7, §8.3 ve §8.7.
 *
 * Kart, başlıktaki **seçili değerin primary çipi**, çipler ve açıklama tek bileşendir: tasarımda
 * bu dört parça hep birlikte görünüyor ve başlıktaki çip her zaman seçili çiple aynı metni
 * yazıyor. Ayrı bileşenler olsaydı ikisinin ayrışması an meselesiydi.
 *
 * Üç varyant var ve üçü de referansta ölçülü:
 *
 * - `wizard` — §6.2'nin kartı: `12px 13px` `r14` `surface-base`, ikonlu başlık, çip `6px 10px`.
 * - `settings` — §8.3'ün kartı: `15px` `r16` `surface-card`, ikonsuz başlık, çip `7px 12px`.
 * - `advanced` — §7.7'nin bloğu (Ş10): **kartsız**, `Gelişmiş` panelinin içinde durur, başlık
 *   `12.5px`, çip `7px 12px` `r10`.
 *
 * Ölçüler `channelWizard.setting*`, `settingsSections.content*` ve `createServer.advanced*`
 * altından okunur; üç takım da Ş0'ın sözlüğünde zaten var ve buraya kopyalanmaz.
 *
 * **Açıklamanın yeri varyanta bağlı** ve bu bir tercih değil, referansın gerçeği:
 * `Sunucu.dc.html` §6.2'nin kartında ipucunu çiplerin **altına** (satır 853), §8.3'ün
 * (satır 1395) ve §7.7'nin (satır 1085) kartlarında ise **üstüne** koyuyor. Tek sıra
 * dayatmak üç bölümden ikisini yanlış çizerdi.
 *
 * A11y (00 §8): grup `role="radiogroup"`, çipler `role="radio"`. Ok tuşları grubu dolaşır ve
 * seçimi taşır; `Home`/`End` uçlara gider. Yalnız seçili çip sekme sırasındadır (roving
 * tabindex) — on iki yavaş mod seçeneği on iki `Tab` durağı olsaydı klavye kullanıcısı kartı
 * geçemezdi.
 */

export type OptionChipGroupVariant = "advanced" | "settings" | "wizard";

export type OptionChip<Value extends string> = {
  label: string;
  value: Value;
};

type VariantMetrics = {
  /** §7.7 bloğu kartsızdır; `null` = zemin ve çerçeve hiç çizilmez. */
  card: boolean;
  cardBorderAlpha: number;
  cardBackground: string;
  cardPaddingX: number;
  cardPaddingY: number;
  cardRadius: number;
  chipFontSize: number;
  chipGap: number;
  chipPaddingX: number;
  chipPaddingY: number;
  chipRadius: number;
  chipsMarginTop: number;
  descriptionAboveChips: boolean;
  descriptionFontSize: number;
  descriptionLineHeight: number;
  descriptionMarginTop: number;
  headGap: number;
  titleFontSize: number;
  titleLineHeight: number;
  valueChipBackgroundAlpha: number;
  valueChipFontSize: number;
  valueChipPaddingX: number;
  valueChipPaddingY: number;
  valueChipRadius: number;
};

function variantMetrics(variant: OptionChipGroupVariant): VariantMetrics {
  const { channelWizard, createServer, settingsSections } = SERVER_METRICS;

  if (variant === "advanced") {
    return {
      card: false,
      cardBackground: "transparent",
      cardBorderAlpha: 0,
      cardPaddingX: 0,
      cardPaddingY: 0,
      cardRadius: 0,
      chipFontSize: createServer.advancedChipFontSize,
      chipGap: createServer.advancedChipsGap,
      chipPaddingX: createServer.advancedChipPaddingX,
      chipPaddingY: createServer.advancedChipPaddingY,
      chipRadius: createServer.advancedChipRadius,
      chipsMarginTop: createServer.advancedChipsMarginTop,
      descriptionAboveChips: true,
      descriptionFontSize: createServer.advancedDescriptionFontSize,
      descriptionLineHeight: channelWizard.settingDescriptionLineHeight,
      descriptionMarginTop: createServer.advancedDescriptionMarginTop,
      headGap: createServer.advancedOptionGap,
      titleFontSize: createServer.advancedOptionTitleFontSize,
      titleLineHeight: 1,
      valueChipBackgroundAlpha: settingsSections.contentValueChipBackgroundAlpha,
      valueChipFontSize: createServer.advancedValueChipFontSize,
      valueChipPaddingX: createServer.advancedValueChipPaddingX,
      valueChipPaddingY: createServer.advancedValueChipPaddingY,
      valueChipRadius: createServer.advancedValueChipRadius,
    };
  }

  if (variant === "settings") {
    return {
      card: true,
      descriptionAboveChips: true,
      cardBackground: "hsl(var(--surface-card))",
      cardBorderAlpha: settingsSections.contentCardBorderAlpha,
      cardPaddingX: settingsSections.contentCardPadding,
      cardPaddingY: settingsSections.contentCardPadding,
      cardRadius: settingsSections.contentCardRadius,
      chipFontSize: settingsSections.contentChipFontSize,
      chipGap: settingsSections.contentChipsGap,
      chipPaddingX: settingsSections.contentChipPaddingX,
      chipPaddingY: settingsSections.contentChipPaddingY,
      chipRadius: settingsSections.contentChipRadius,
      chipsMarginTop: settingsSections.contentChipsMarginTop,
      descriptionFontSize: settingsSections.contentDescriptionFontSize,
      descriptionLineHeight: settingsSections.contentDescriptionLineHeight,
      descriptionMarginTop: settingsSections.contentDescriptionMarginTop,
      headGap: settingsSections.contentHeadGap,
      titleFontSize: settingsSections.contentTitleFontSize,
      titleLineHeight: settingsSections.contentTitleLineHeight,
      valueChipBackgroundAlpha: settingsSections.contentValueChipBackgroundAlpha,
      valueChipFontSize: settingsSections.contentValueChipFontSize,
      valueChipPaddingX: settingsSections.contentValueChipPaddingX,
      valueChipPaddingY: settingsSections.contentValueChipPaddingY,
      valueChipRadius: settingsSections.contentValueChipRadius,
    };
  }

  return {
    card: true,
    descriptionAboveChips: false,
    cardBackground: "hsl(var(--surface-base))",
    cardBorderAlpha: channelWizard.settingCardBorderAlpha,
    cardPaddingX: channelWizard.settingCardPaddingX,
    cardPaddingY: channelWizard.settingCardPaddingY,
    cardRadius: channelWizard.settingCardRadius,
    chipFontSize: channelWizard.settingChipFontSize,
    chipGap: channelWizard.settingChipsGap,
    chipPaddingX: channelWizard.settingChipPaddingX,
    chipPaddingY: channelWizard.settingChipPaddingY,
    chipRadius: channelWizard.settingChipRadius,
    chipsMarginTop: channelWizard.settingChipsMarginTop,
    descriptionFontSize: channelWizard.settingDescriptionFontSize,
    descriptionLineHeight: channelWizard.settingDescriptionLineHeight,
    descriptionMarginTop: channelWizard.settingDescriptionMarginTop,
    headGap: channelWizard.settingHeadGap,
    titleFontSize: channelWizard.settingTitleFontSize,
    titleLineHeight: 1,
    valueChipBackgroundAlpha: channelWizard.settingValueChipBackgroundAlpha,
    valueChipFontSize: channelWizard.settingValueChipFontSize,
    valueChipPaddingX: channelWizard.settingValueChipPaddingX,
    valueChipPaddingY: channelWizard.settingValueChipPaddingY,
    valueChipRadius: channelWizard.settingValueChipRadius,
  };
}

export type OptionChipGroupProps<Value extends string> = {
  description?: string | undefined;
  /** Yalnız `wizard` varyantında çizilir; §8.3'ün kartında ikon yok. */
  icon?: React.ReactNode | undefined;
  onChange: (value: Value) => void;
  options: readonly OptionChip<Value>[];
  testId?: string | undefined;
  title: string;
  value: Value;
  /**
   * Başlıktaki primary çipin metni. Verilmezse seçili çipin etiketi kullanılır — genelde
   * doğrusu bu. `Kullanıcı limiti` istisnadır: çipler düz sayı yazar (`0`…`10`), başlık ise
   * `10 kişi (varsayılan)` (SPEC §6.2). Referansın kendi ayrımı.
   */
  valueLabel?: string | undefined;
  variant?: OptionChipGroupVariant | undefined;
};

export function OptionChipGroup<Value extends string>({
  description,
  icon,
  onChange,
  options,
  testId,
  title,
  value,
  valueLabel,
  variant = "wizard",
}: OptionChipGroupProps<Value>) {
  const metrics = variantMetrics(variant);
  const titleId = useId();
  const descriptionId = useId();
  const chipRefs = useRef(new Map<Value, HTMLButtonElement>());
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectedLabel = valueLabel ?? options[selectedIndex]?.label ?? "";

  const move = (delta: number) => {
    if (options.length === 0) {
      return;
    }

    const next = options[(selectedIndex + delta + options.length) % options.length];
    if (!next) {
      return;
    }

    onChange(next.value);
    chipRefs.current.get(next.value)?.focus();
  };

  const jumpTo = (index: number) => {
    const next = options[index];
    if (!next) {
      return;
    }

    onChange(next.value);
    chipRefs.current.get(next.value)?.focus();
  };

  const descriptionNode = description ? (
    <div
      className="text-pretty text-[hsl(var(--text-muted))]"
      id={descriptionId}
      style={{
        fontSize: pxToRem(metrics.descriptionFontSize),
        lineHeight: metrics.descriptionLineHeight,
        marginTop: pxToRem(metrics.descriptionMarginTop),
      }}
    >
      {description}
    </div>
  ) : null;

  return (
    <div
      className={metrics.card ? "border border-[hsl(var(--border)/0.7)]" : undefined}
      data-testid={testId}
      style={
        metrics.card
          ? {
              background: metrics.cardBackground,
              borderColor: `hsl(var(--border)/${metrics.cardBorderAlpha})`,
              borderRadius: pxToRem(metrics.cardRadius),
              padding: `${pxToRem(metrics.cardPaddingY)} ${pxToRem(metrics.cardPaddingX)}`,
            }
          : undefined
      }
    >
      <div className="flex items-center" style={{ gap: pxToRem(metrics.headGap) }}>
        {icon && variant === "wizard" ? (
          <span
            aria-hidden="true"
            className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(SERVER_METRICS.channelWizard.settingIconSize, metrics.titleFontSize),
              width: pxToEm(SERVER_METRICS.channelWizard.settingIconSize, metrics.titleFontSize),
            }}
          >
            {icon}
          </span>
        ) : null}
        <span
          className="font-semibold text-[hsl(var(--foreground))]"
          id={titleId}
          style={{
            fontSize: pxToRem(metrics.titleFontSize),
            lineHeight: metrics.titleLineHeight,
          }}
        >
          {title}
        </span>
        <span
          className="ml-auto shrink-0 font-semibold text-[hsl(var(--primary))]"
          style={{
            background: `hsl(var(--primary)/${metrics.valueChipBackgroundAlpha})`,
            fontFamily: DISPLAY_FONT,
            borderRadius: pxToRem(metrics.valueChipRadius),
            fontSize: pxToRem(metrics.valueChipFontSize),
            lineHeight: 1,
            padding: `${pxToRem(metrics.valueChipPaddingY)} ${pxToRem(metrics.valueChipPaddingX)}`,
          }}
        >
          {selectedLabel}
        </span>
      </div>

      {description && metrics.descriptionAboveChips ? descriptionNode : null}

      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        className="flex flex-wrap"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            jumpTo(0);
          } else if (event.key === "End") {
            event.preventDefault();
            jumpTo(options.length - 1);
          }
        }}
        role="radiogroup"
        style={{ gap: pxToRem(metrics.chipGap), marginTop: pxToRem(metrics.chipsMarginTop) }}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              aria-checked={selected}
              className={cn(
                "cursor-pointer whitespace-nowrap border font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                selected
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))]",
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              ref={(node) => {
                if (node) {
                  chipRefs.current.set(option.value, node);
                } else {
                  chipRefs.current.delete(option.value);
                }
              }}
              role="radio"
              style={{
                borderRadius: pxToRem(metrics.chipRadius),
                fontSize: pxToRem(metrics.chipFontSize),
                lineHeight: 1,
                padding: `${pxToRem(metrics.chipPaddingY)} ${pxToRem(metrics.chipPaddingX)}`,
              }}
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {description && !metrics.descriptionAboveChips ? descriptionNode : null}
    </div>
  );
}
