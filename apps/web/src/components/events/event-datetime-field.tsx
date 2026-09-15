"use client";

import React, { useId, useState } from "react";
import { CalendarDays } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import { formatEventDayLabel } from "@/lib/events/presentation";

/**
 * `TARİH VE SAAT` alanı — SPEC §6.
 *
 * Yerel bir tarih-saat seçici: değer `YYYY-MM-DDTHH:mm` ve **duvar saatidir**. Gösterilen metin
 * (`27 Ağustos · 15:00`) değerin kendisinden kurulur, bir saat dilimi çevriminden değil —
 * kullanıcı 15:00 yazdıysa alanda 15:00 görmeli (tuzak #7).
 *
 * The trigger opens visible, editable native date/time fields. An invisible datetime input
 * only opened its picker when the browser's calendar indicator happened to be clicked.
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [date = "", time = ""] = value.split("T");

  return (
    <div className="min-w-0">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-label={`${t("events.create.whenLabel")}: ${formatEventDateTimeValue(value, locale)}`}
        className="flex w-full items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="events-datetime-field"
        onClick={() => setOpen((current) => !current)}
        type="button"
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
      </button>
      {open ? (
        <div
          className="mt-2 grid min-w-0 gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] p-3"
          id={panelId}
        >
          <label className="grid min-w-0 gap-1 text-xs text-[hsl(var(--text-secondary))]">
            {t("server.modal.event.field.date")}
            <Input
              data-testid="events-date-input"
              className="min-w-0 px-2"
              type="date"
              value={date}
              onChange={(event) => onChange(`${event.target.value}T${time}`)}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-[hsl(var(--text-secondary))]">
            {t("server.modal.event.field.startTime")}
            <Input
              data-testid="events-time-input"
              className="min-w-0 px-2"
              type="time"
              value={time}
              onChange={(event) => onChange(`${date}T${event.target.value}`)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
