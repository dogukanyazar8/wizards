"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

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
 * The inline calendar and time selects use the same theme on web and desktop.
 * Calendar arithmetic uses UTC only to represent days; submitted values remain local time.
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-w-0">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-label={`${t("events.create.whenLabel")}: ${formatEventDateTimeValue(value, locale)}`}
        className="flex w-full items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="events-datetime-field"
        ref={triggerRef}
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
        <EventDateTimePicker
          id={panelId}
          onChange={onChange}
          onDone={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          value={value}
        />
      ) : null}
    </div>
  );
}

function calendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) return date;
  const today = new Date();
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
}

function shiftMonth(date: Date, step: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + step, 1);
  const end = new Date(next);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(date.getUTCDate(), end.getUTCDate()));
  return next;
}

function EventDateTimePicker({
  id,
  onChange,
  onDone,
  value,
}: EventDateTimeFieldProps & {
  id: string;
  onDone: () => void;
}) {
  const { locale, t } = useI18n();
  const [date = "", time = "09:00"] = value.split("T");
  const [focusedDate, setFocusedDate] = useState(() => calendarDate(date));
  const focusedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    focusedRef.current?.focus();
  }, [focusedDate]);

  const first = new Date(focusedDate);
  first.setUTCDate(1);
  const monthEnd = new Date(first);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > monthEnd.getUTCDate()) return null;
    const current = new Date(first);
    current.setUTCDate(day);
    return current;
  });
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);
  const dayFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const dateValue = calendarDate(date).toISOString().slice(0, 10);
  const focusedValue = focusedDate.toISOString().slice(0, 10);
  const controlClass =
    "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  return (
    <div
      id={id}
      className="mt-2 min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] p-3 text-[hsl(var(--foreground))]"
      style={{ fontSize: pxToRem(createModal.fieldValueFontSize) }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={`${controlClass} grid size-8 place-items-center`}
          aria-label={t("events.create.previousMonth")}
          onClick={() => setFocusedDate(shiftMonth(focusedDate, -1))}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <span className="font-display font-semibold capitalize" aria-live="polite">
          {monthLabel}
        </span>
        <button
          type="button"
          className={`${controlClass} grid size-8 place-items-center`}
          aria-label={t("events.create.nextMonth")}
          onClick={() => setFocusedDate(shiftMonth(focusedDate, 1))}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      <table
        role="grid"
        aria-label={monthLabel}
        className="mt-2 w-full table-fixed border-separate border-spacing-1 text-center"
        onKeyDown={(event) => {
          const next = new Date(focusedDate);
          const day = (next.getUTCDay() + 6) % 7;
          const offsets: Record<string, number> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
            Home: -day,
            End: 6 - day,
          };
          if (event.key === "PageUp" || event.key === "PageDown") {
            event.preventDefault();
            setFocusedDate(shiftMonth(next, event.key === "PageUp" ? -1 : 1));
          } else if (offsets[event.key] !== undefined) {
            event.preventDefault();
            next.setUTCDate(next.getUTCDate() + offsets[event.key]!);
            setFocusedDate(next);
          }
        }}
      >
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, index) => (
              <th
                key={index}
                scope="col"
                className="pb-1 font-normal text-[hsl(var(--text-muted))]"
              >
                {weekdayFormatter.format(new Date(Date.UTC(2024, 0, index + 1)))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => (
            <tr key={week}>
              {cells.slice(week * 7, week * 7 + 7).map((day, index) => {
                const dayValue = day?.toISOString().slice(0, 10);
                return (
                  <td key={index} className="p-0">
                    {day && dayValue ? (
                      <button
                        type="button"
                        data-testid={`events-calendar-day-${dayValue}`}
                        aria-label={dayFormatter.format(day)}
                        aria-pressed={dayValue === date}
                        ref={dayValue === focusedValue ? focusedRef : undefined}
                        tabIndex={dayValue === focusedValue ? 0 : -1}
                        className={`h-8 w-full rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${dayValue === date ? "bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))]" : "hover:bg-[hsl(var(--surface-soft))]"}`}
                        onClick={() => {
                          setFocusedDate(day);
                          onChange(`${dayValue}T${time || "09:00"}`);
                        }}
                      >
                        {day.getUTCDate()}
                      </button>
                    ) : (
                      <span className="block h-8" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[hsl(var(--border))] pt-3">
        {(["hour", "minute"] as const).map((part) => (
          <label key={part} className="grid min-w-0 flex-1 gap-1 text-[hsl(var(--text-muted))]">
            {t(`events.create.${part}`)}
            <select
              aria-label={t(`events.create.${part}`)}
              className={`${controlClass} h-9 min-w-0 px-2`}
              value={part === "hour" ? time.slice(0, 2) : time.slice(3, 5)}
              onChange={(event) =>
                onChange(
                  `${dateValue}T${part === "hour" ? `${event.target.value}:${time.slice(3, 5) || "00"}` : `${time.slice(0, 2) || "09"}:${event.target.value}`}`,
                )
              }
            >
              {Array.from({ length: part === "hour" ? 24 : 60 }, (_, index) => {
                const text = String(index).padStart(2, "0");
                return (
                  <option key={text} value={text}>
                    {text}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
        <button type="button" className={`${controlClass} h-9 px-3 font-medium`} onClick={onDone}>
          {t("events.create.dateDone")}
        </button>
      </div>
    </div>
  );
}
