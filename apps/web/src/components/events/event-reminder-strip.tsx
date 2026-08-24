"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import type {
  EventReminder,
  EventReminderMinutes,
  EventRsvp,
  SetEventReminderInput,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { eventsQueryKeys, setEventReminder } from "@/lib/events/client";
import type { EventDetailResponse } from "@/lib/events/detail-contract";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";

/**
 * Hatırlatma şeridi — SPEC §5.4, K5.
 *
 * Şerit üç özel durum taşıyor ve ikisi çizimden değil **yazma yanıtından** doğuyor. Durum
 * seçimi bu yüzden saf bir çözümleyicide (`resolveEventReminderState`) duruyor: kural bir kez
 * yazılıyor, bir tık beklemeden test edilebiliyor.
 *
 * `going` değilse şerit hiç çizilmez — hatırlatma bir RSVP sonucudur, bağımsız bir tercih
 * değil (Ş3 satırı da RSVP ile birlikte yazıyor).
 */

const { detailPanel } = EVENTS_METRICS;

/** K5 — serbest dakika yok; her değer `OutboxJob.availableAt` hesabına giriyor. */
export const EVENT_REMINDER_MENU_MINUTES = [
  5, 10, 15, 30, 60,
] as const satisfies readonly EventReminderMinutes[];

export type EventReminderStripState =
  | { readonly kind: "hidden" }
  | { readonly kind: "off" }
  | { readonly kind: "on"; readonly minutesBefore: number }
  | { readonly kind: "suppressed" }
  | { readonly kind: "tooSoon"; readonly minutesBefore: number };

export type EventReminderStripInput = {
  readonly reminder: EventReminder | null;
  readonly rsvp: EventRsvp | null;
  /**
   * Son yazma yanıtının `scheduled` alanı; henüz yazma olmadıysa `null`. `false` **tercihin
   * kaybolduğu** anlamına gelmez: iş kuyruğa yazılmadı, satır duruyor (tuzak #8).
   */
  readonly scheduled: boolean | null;
  /** K7 — hesap seviyesinde etkinlik bildirimleri kapalı (Ş2'nin `reminderSuppressed`ı). */
  readonly suppressed: boolean;
};

export function resolveEventReminderState(input: EventReminderStripInput): EventReminderStripState {
  if (input.rsvp !== "going") {
    return { kind: "hidden" };
  }

  // Bildirimler kapalıyken saklanan dakika doğru ama anlamsız: hiçbir bildirim gitmeyecek.
  if (input.suppressed) {
    return { kind: "suppressed" };
  }

  if (!input.reminder?.enabled) {
    return { kind: "off" };
  }

  return input.scheduled === false
    ? { kind: "tooSoon", minutesBefore: input.reminder.minutesBefore }
    : { kind: "on", minutesBefore: input.reminder.minutesBefore };
}

export type EventReminderStripProps = EventReminderStripInput & {
  readonly eventId: string;
};

type DetailPages = {
  readonly pageParams: readonly unknown[];
  readonly pages: readonly EventDetailResponse[];
};

export function EventReminderStrip({
  eventId,
  reminder,
  rsvp,
  scheduled,
  suppressed,
}: EventReminderStripProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** Yazma yanıtı prop'u ezer: en taze `scheduled` bu şeridin kendi isteğinden gelir. */
  const [writtenScheduled, setWrittenScheduled] = useState<boolean | null>(null);

  const mutation = useMutation({
    mutationFn: (input: SetEventReminderInput) => setEventReminder(eventId, input),
    onSuccess: (payload) => {
      setWrittenScheduled(payload.scheduled);
      queryClient.setQueryData<DetailPages>([...eventsQueryKeys.details(eventId)], (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({ ...page, reminder: payload.event.reminder })),
            }
          : current,
      );
    },
  });

  const state = resolveEventReminderState({
    reminder,
    rsvp,
    scheduled: writtenScheduled ?? scheduled,
    suppressed,
  });

  if (state.kind === "hidden") {
    return null;
  }

  /**
   * İyimser yazım: kullanıcı dakikayı seçtiği anda satırı yaz. Yanıt beklenirse şerit bir
   * saniye eski dakikayı gösterir ve seçim tutmamış gibi görünür.
   */
  const apply = (minutes: EventReminderMinutes | null) => {
    setMenu(null);
    const input: SetEventReminderInput = {
      enabled: minutes !== null,
      minutesBefore: minutes ?? (reminder?.minutesBefore as EventReminderMinutes | undefined) ?? 10,
    };

    setWrittenScheduled(null);
    queryClient.setQueryData<DetailPages>([...eventsQueryKeys.details(eventId)], (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              reminder: { enabled: input.enabled, minutesBefore: input.minutesBefore },
            })),
          }
        : current,
    );

    mutation.mutate(input);
  };

  const title =
    state.kind === "suppressed"
      ? t("events.detail.reminderSuppressed")
      : state.kind === "tooSoon"
        ? t("events.detail.reminderTooSoon")
        : state.kind === "on"
          ? t("events.detail.reminderOn")
          : t("events.detail.reminderOff");

  const sub =
    state.kind === "suppressed"
      ? t("events.detail.reminderSuppressedSub")
      : state.kind === "on" || state.kind === "tooSoon"
        ? t("events.detail.reminderBefore", { minutes: state.minutesBefore })
        : null;

  return (
    <div
      className="flex items-center"
      data-testid="event-detail-reminder"
      style={{
        background: `hsl(var(--surface-secondary)/${detailPanel.reminderSurfaceAlpha})`,
        border: `${hairline()} solid hsl(var(--border)/${detailPanel.reminderBorderAlpha})`,
        borderRadius: pxToRem(detailPanel.reminderRadius),
        gap: pxToRem(detailPanel.reminderGap),
        padding: `${pxToRem(detailPanel.reminderPaddingY)} ${pxToRem(
          detailPanel.reminderPaddingX,
        )}`,
      }}
    >
      <Bell
        aria-hidden="true"
        size={pxToEm(detailPanel.reminderIconSize)}
        strokeWidth={1.9}
        style={{ color: "hsl(var(--warning))", flex: "none" }}
      />

      <div className="min-w-0 flex-1">
        <div
          className="text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(detailPanel.reminderTitleFontSize),
            fontWeight: detailPanel.reminderTitleWeight,
            lineHeight: detailPanel.infoTextLineHeight,
          }}
        >
          {title}
        </div>
        {sub ? (
          <div
            className="text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(detailPanel.reminderSubFontSize),
              marginTop: pxToRem(detailPanel.reminderSubMarginTop),
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>

      {state.kind === "suppressed" ? (
        <Link
          className="shrink-0 text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="event-detail-reminder-settings"
          href="/settings?section=notifications"
          style={{
            fontSize: pxToRem(detailPanel.reminderActionFontSize),
            fontWeight: detailPanel.reminderActionWeight,
            lineHeight: 1,
          }}
        >
          {t("events.detail.reminderSettings")}
        </Link>
      ) : (
        <button
          className="shrink-0 text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="event-detail-reminder-change"
          onClick={(clickEvent) => {
            const box = clickEvent.currentTarget.getBoundingClientRect();
            setMenu({ x: box.left, y: box.bottom });
          }}
          style={{
            fontSize: pxToRem(detailPanel.reminderActionFontSize),
            fontWeight: detailPanel.reminderActionWeight,
            lineHeight: 1,
          }}
          type="button"
        >
          {t("events.detail.reminderChange")}
        </button>
      )}

      <ContextMenu
        onClose={() => setMenu(null)}
        open={menu !== null}
        position={menu ?? { x: 0, y: 0 }}
      >
        {EVENT_REMINDER_MENU_MINUTES.map((minutes) => (
          <ContextMenuItem key={minutes} onClick={() => apply(minutes)}>
            {t("events.duration.minutes", { minutes })}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => apply(null)}>
          {t("events.detail.reminderOff")}
        </ContextMenuItem>
      </ContextMenu>
    </div>
  );
}
