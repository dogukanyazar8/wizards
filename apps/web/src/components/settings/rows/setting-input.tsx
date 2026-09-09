"use client";

import React from "react";

import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Metin alanı — SPEC-AYARLAR §4.4 (260 px, isteğe bağlı `@` öneki).
 *
 * **Önek değerin parçası değildir.** `@` görsel bir işaret; `aria-hidden` ve `<input>`'un
 * dışında durur. İçine yazılsaydı `pu` anahtarı `@dogukan` yazardı ve sunucu ya kullanıcı adını
 * `@` ile kaydeder ya da her yazmada baştaki karakteri soyup atmak zorunda kalırdı — iki taraf
 * da "kullanıcı adı" ile "görüntülenen kullanıcı adı"nı karıştırmaya başlar.
 *
 * Kenar kabın üzerinde, `<input>`'un değil: önek ile alan tek bir çerçeve gibi görünür ve odak
 * halkası ikisini birden sarar.
 */

const { input } = SETTINGS_METRICS.controls;

export type SettingInputProps = {
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly labelledById?: string | undefined;
  readonly onChange: (next: string) => void;
  readonly prefix?: string | undefined;
  readonly testId?: string;
  readonly value: string;
};

export function SettingInput({
  describedById,
  disabled = false,
  labelledById,
  onChange,
  prefix,
  testId,
  value,
}: SettingInputProps) {
  return (
    <div
      className="flex shrink-0 items-center overflow-hidden bg-[hsl(var(--surface-base))] focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]"
      style={{
        border: `${hairline()} solid hsl(var(--border) / ${input.borderAlpha})`,
        borderRadius: pxToRem(input.radius),
        opacity: disabled ? 0.55 : 1,
        width: pxToRem(input.width),
      }}
    >
      {prefix ? (
        <span
          aria-hidden="true"
          className="shrink-0 text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(input.fontSize),
            fontWeight: input.weight,
            lineHeight: input.lineHeight,
            paddingLeft: pxToRem(input.prefixPaddingLeft),
          }}
        >
          {prefix}
        </span>
      ) : null}

      <input
        aria-describedby={describedById}
        aria-labelledby={labelledById}
        className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden"
        data-testid={testId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{
          fontSize: pxToRem(input.fontSize),
          fontWeight: input.weight,
          lineHeight: input.lineHeight,
          padding: `${pxToRem(input.paddingY)} ${pxToRem(input.paddingX)}`,
        }}
        type="text"
        value={value}
      />
    </div>
  );
}
