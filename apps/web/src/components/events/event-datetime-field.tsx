"use client";

import React from "react";
import { CalendarDays } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import { formatEventDayLabel } from "@/lib/events/presentation";

/**
 * `TARİH VE SAAT` alanı — SPEC §6.
 *
 * Yerel bir tarih-saat seçici: değer `YYYY-MM-DDTHH:mm` ve **duvar saatidir**. Gösterilen metin
 * (`27 Ağustos · 15:00`) değerin kendisinden kurulur, bir saat dilimi çevriminden değil —
 * kullanıcı 15:00 yazdıysa alanda 15:00 görmeli (tuzak #7).
 *
 * Görünür kutu tasarımın kutusudur; `<input type="datetime-local">` onun üstünde saydam durur.
 * Böylece tıklama tarayıcının kendi seçicisini açar, klavye ve ekran okuyucu ise **gerçek** bir
 * alan bulur — kutuyu bir `button` yapıp seçiciyi elle yazmak ikisini de kaybettirirdi.
 */

const { createModal } = EVENTS_METRICS;

export type EventDateTimeFieldProps = {
  readonly invalid?: boolean | undefined;
  readonly onChange: (value: string) => void;
  readonly value: string;
};

/** `2026-08-27T15:00` → `27 Ağustos · 15:00`. */
export function formatEventDateTimeValue(value: string, locale: string): string {
  const [date, time] = value.split("T");

  if (!date || !time) {
    return "";
  }

  // Gün etiketi takvim günü dizesinden üretiliyor; `formatEventDayLabel` bu biçimi UTC'de
  // biçimlendirir ve ikinci bir bölge çevrimi günü kaydırmaz.
  return `${formatEventDayLabel(date, "UTC", locale)} · ${time}`;
}

export function EventDateTimeField({ invalid = false, onChange, value }: EventDateTimeFieldProps) {
  const { locale, t } = useI18n();

  return (
    <div
      className="relative flex items-center"
      data-testid="events-datetime-field"
      style={{
        background: "hsl(var(--surface-base))",
        border: `${hairline()} solid hsl(var(--${invalid ? "danger" : "border"})/${createModal.inputBorderAlpha})`,
        borderRadius: pxToRem(createModal.inputRadius),
        gap: pxToRem(createModal.fieldGap),
        height: pxToRem(createModal.inputHeight),
        padding: `0 ${pxToRem(createModal.inputPaddingX)}`,
      }}
    >
      <CalendarDays
        aria-hidden="true"
        style={{
          color: "hsl(var(--text-muted))",
          height: pxToEm(createModal.fieldIconSize),
          width: pxToEm(createModal.fieldIconSize),
        }}
      />
      <span
        aria-hidden="true"
        className="min-w-0 flex-1 truncate"
        style={{
          color: "hsl(var(--foreground))",
          fontSize: pxToRem(createModal.fieldValueFontSize),
          fontWeight: createModal.fieldValueWeight,
          lineHeight: 1,
        }}
      >
        {formatEventDateTimeValue(value, locale)}
      </span>
      <input
        aria-label={t("events.create.whenLabel")}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="events-datetime-input"
        onChange={(event) => onChange(event.target.value)}
        type="datetime-local"
        value={value}
      />
    </div>
  );
}
