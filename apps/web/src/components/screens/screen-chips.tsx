"use client";

import React, { type CSSProperties } from "react";

import { HOME_METRICS, HOME_TYPE_SCALE, pxToRem } from "@/lib/home/metrics";
import { cn } from "@/lib/utils";

/**
 * Yan ekranların çipleri — `07-faz6` §2.1, §3.1, §7.
 *
 * Kutu `Durumun` kartındaki presence çipinin **aynısıdır** (dolgu `8 10`, yarıçap
 * 11, 11.5px metin); tek fark noktanın olmaması. Yeni bir çip tipi tanımlanmadı.
 *
 * İki rol, iki anlam: filtre çipleri bağımsız açma/kapama gibi okunur ve
 * `aria-pressed` taşır; görünüm segmenti tek seçimli bir sekme kümesidir ve
 * `role="tablist"`/`role="tab"` + `aria-selected` taşır. Aynı görünüm, farklı
 * söz — ekran okuyucuya "bu bir filtre" ile "bu bir görünüm" farkını anlatan şey
 * bu.
 */

const { presenceCard, sideScreens } = HOME_METRICS;

const CHIP_LINE_HEIGHT = 1;

function chipStyle(active: boolean): CSSProperties {
  return {
    borderRadius: pxToRem(presenceCard.chipRadius),
    fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
    fontWeight: active ? 600 : 500,
    lineHeight: CHIP_LINE_HEIGHT,
    padding: `${pxToRem(presenceCard.chipPaddingY)} ${pxToRem(presenceCard.chipPaddingX)}`,
    // Zemin vurgu renginin tint'i; **metin temanın kendi `--foreground`'u**.
    // Faz 5'in `--primary-readable`'ı burada yetmiyor: ölçüldü, koyu temada
    // 11,5px yazı `--primary/0.14` üzerinde 3,70:1 çıkıyor (eşik 4,5).
    // `--foreground` aynı zeminde 8,27:1 ve 32 temanın hepsinde temanın kendi
    // metin rengi — yeni renk eklenmedi, dolgu hiç değişmedi.
    ...(active
      ? { background: "hsl(var(--primary) / 0.14)", color: "hsl(var(--foreground))" }
      : { color: "hsl(var(--text-muted))" }),
  };
}

const CHIP_CLASS =
  "inline-flex items-center whitespace-nowrap outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]";
const INACTIVE_CLASS = "bg-[hsl(var(--surface-secondary))] hover:bg-[var(--surface-hover)]";

export type ScreenChoice<TValue extends string> = {
  readonly label: string;
  readonly value: TValue;
};

export function ScreenFilterChips<TValue extends string>({
  choices,
  label,
  onSelect,
  testId,
  value,
}: {
  choices: readonly ScreenChoice<TValue>[];
  label: string;
  onSelect: (value: TValue) => void;
  testId: string;
  value: TValue;
}) {
  return (
    <div
      aria-label={label}
      className="flex flex-wrap items-center"
      data-testid={testId}
      role="group"
      style={{ gap: pxToRem(sideScreens.chipGap) }}
    >
      {choices.map((choice) => {
        const active = choice.value === value;

        return (
          <button
            aria-pressed={active}
            className={cn(CHIP_CLASS, active ? "" : INACTIVE_CLASS)}
            data-testid={`${testId}-${choice.value}`}
            key={choice.value}
            onClick={() => onSelect(choice.value)}
            style={chipStyle(active)}
            type="button"
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

export function ScreenSegmented<TValue extends string>({
  choices,
  label,
  onSelect,
  testId,
  value,
}: {
  choices: readonly ScreenChoice<TValue>[];
  label: string;
  onSelect: (value: TValue) => void;
  testId: string;
  value: TValue;
}) {
  return (
    <div
      aria-label={label}
      className="flex items-center"
      data-testid={testId}
      role="tablist"
      style={{ gap: pxToRem(sideScreens.chipGap) }}
    >
      {choices.map((choice) => {
        const active = choice.value === value;

        return (
          <button
            aria-selected={active}
            className={cn(CHIP_CLASS, active ? "" : INACTIVE_CLASS)}
            data-testid={`${testId}-${choice.value}`}
            key={choice.value}
            onClick={() => onSelect(choice.value)}
            role="tab"
            style={chipStyle(active)}
            // Tek seçimli sekme kümesinde yalnız seçili sekme sekme sırasındadır;
            // gezinme ok tuşlarıyla değil, buradaki iki seçenekle yapılır.
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
