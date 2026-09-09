"use client";

import React, { useState } from "react";
import { Check, Clock } from "lucide-react";
import { resolveAccountTimeZone, type EventRsvp, type WhisprEvent } from "@wizards/types";

import { EventAttendeeStack } from "@/components/events/event-attendee-stack";
import {
  EVENT_DISPLAY_FONT,
  EventKindPill,
  EventKindTile,
  EventLivePill,
} from "@/components/events/event-kind-tile";
import { EventSourceTile } from "@/components/events/event-source-tile";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { useToast } from "@/hooks/use-toast";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import {
  EVENT_DAY_BUCKET_KEY,
  EVENT_DURATION_ELAPSED_KEY,
  describeEventDuration,
  describeEventRecurrence,
  describeEventStartsIn,
  formatEventClock,
  zonedWeekdayIndex,
} from "@/lib/events/presentation";
import { cn } from "@/lib/utils";

/**
 * Etkinlik kartı — SPEC §3.6, `.dc.html` `:335`–`:381`.
 *
 * **Kartta üç nokta menüsü yoktur.** Eylem satırında yalnız `Katıl` ve `Belki` durur; karta
 * tıklamak detay panelini açar. Menü tasarımın 4A yönüne aitti ve 4B onu çizmiyor.
 *
 * Klavye hedefi **tek**: başlık bir `<button>`. Kartın gövdesindeki `onClick` fare
 * kullanıcısının kolaylığıdır, ikinci bir sekme durağı değil — bir kartta üç durak
 * (gövde + başlık + iki eylem) ızgarayı klavyeyle geçilmez yapardı.
 *
 * **İyimser güncelleme kartın kendi işidir**: basılan düğme mutasyonun cevabını beklemeden
 * durumunu değiştirir, hata gelince geri alınır. Sayaçlar, sağ ray ve RSVP onay şeridi Ş5'in
 * sorumluluğu — kart yalnız kendi durumunu bildirir. Kartın içinde bir `useMutation` olsaydı
 * bir ekran dolusu bağımsız mutasyon örneği doğardı ve hangisinin hangi kartı yazdığı test
 * edilemezdi.
 */

const { card } = EVENTS_METRICS;

// ---------------------------------------------------------------------------
// İyimser yama — saf kurallar
// ---------------------------------------------------------------------------

/**
 * Uçuşan iyimser yanıt. `base`, tık anında sunucunun söylediği yanıttır; yamanın ne zaman
 * düşeceğini o belirler.
 */
export type EventRsvpPatch = {
  readonly base: EventRsvp | null;
  readonly target: EventRsvp | null;
};

/**
 * Basılan düğmenin hedef durumu. Aynı yanıta ikinci tık yanıtı **kaldırır**; karşı yanıta tık
 * onu **çevirir**.
 *
 * Uç hedef durum alıyor, toggle değil (`SetEventRsvpSchema`): iki sekmede açık aynı ekran aynı
 * düğmeye bastığında "tersine çevir" semantiği sonucu isteklerin sırasına bağlar. Toggle kararı
 * bu yüzden burada, tek yerde veriliyor.
 */
export function resolveEventRsvpTarget(
  current: EventRsvp | null,
  pressed: EventRsvp,
): EventRsvp | null {
  return current === pressed ? null : pressed;
}

/**
 * Kartın **gösterdiği** yanıt.
 *
 * Üç dal ve üçü de gerekli:
 *   1. Sunucu hedefe yetiştiyse yama şeffaftır — iki değer aynı.
 *   2. Sunucunun yanıtı tık anındakinden **başka** bir şeye döndüyse (ör. detay panelinden
 *      yazıldı) yama düşer; kullanıcının en son yaptığı kazanır.
 *   3. Aksi hâlde yanıt hâlâ uçuşuyor ve kart hedefi gösterir.
 *
 * Yama bir efektle temizlenmiyor: render sırasında türetiliyor. `useEffect` içinde `setState`
 * bu ekranda ayrıca yasak (`react-hooks/set-state-in-effect`) ve bir kare gecikmeli düzeltme
 * kullanıcıya yanıp sönen bir düğme olarak görünürdü.
 */
export function resolveDisplayedRsvp(
  serverRsvp: EventRsvp | null,
  patch: EventRsvpPatch | null,
): EventRsvp | null {
  if (!patch) {
    return serverRsvp;
  }

  if (serverRsvp === patch.target || serverRsvp !== patch.base) {
    return serverRsvp;
  }

  return patch.target;
}

// ---------------------------------------------------------------------------
// Yükseklik
// ---------------------------------------------------------------------------

const badgeRowHeight = card.kindPillPaddingY * 2 + card.kindPillFontSize;
const titleLineHeight = card.titleFontSize * card.titleLineHeight;

/**
 * Kartın asgari yüksekliği — **ölçülerden türer**, elle yazılmaz. `EventCardSkeleton` aynı
 * sayıyı okur; iskelet gerçek karttan kısa olsaydı içerik gelince ızgara sıçrardı.
 */
export const EVENT_CARD_MIN_HEIGHT =
  card.topPaddingTop +
  Math.max(card.kindTileSize, badgeRowHeight + card.titleMarginTop + titleLineHeight) +
  (card.timePaddingTop +
    card.timeFontSize * card.timeLineHeight +
    card.timeBlockGap +
    Math.max(card.sourceTileSize, card.placeFontSize * card.timeLineHeight)) +
  (card.attendeesPaddingTop + card.avatarSize) +
  (card.actionsMarginTop + card.actionsPaddingTop + card.actionHeight + card.actionsPaddingBottom);

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60_000;

export type EventCardProps = {
  readonly event: WhisprEvent;
  /** Geçen süre hesabı için; sayfa tek bir dakika saati tutar, kart başına zamanlayıcı kurulmaz. */
  readonly now?: Date;
  readonly onOpen?: () => void;
  /** Hedef durum. Reddedilirse kart iyimser yamayı geri alır. */
  readonly onRsvp?: (rsvp: EventRsvp | null) => void | Promise<void>;
  readonly selected?: boolean;
};

export function EventCard({ event, now, onOpen, onRsvp, selected = false }: EventCardProps) {
  const { locale, t } = useI18n();
  const { preferences } = useAccountPreferenceRuntime();
  const toast = useToast();
  const [patch, setPatch] = useState<EventRsvpPatch | null>(null);

  const timeZone = resolveAccountTimeZone(preferences.timeZone);
  const instant = now ?? new Date();
  const rsvp = resolveDisplayedRsvp(event.rsvp, patch);
  const going = rsvp === "going";
  const maybe = rsvp === "maybe";

  const clock = formatEventClock(event.startsAt, timeZone, locale);
  const dayLabel = t(EVENT_DAY_BUCKET_KEY[event.dayBucket]);

  // Tekrar etiketi yaklaşma etiketini **ezer** (HTML `e.repeat || e.soon`): her hafta tekrar
  // eden bir etkinlikte "12 dk" bir kereye mahsus, "Her çarşamba" kalıcı bilgidir.
  const recurrence = describeEventRecurrence(
    event.recurrenceRule,
    zonedWeekdayIndex(event.startsAt, timeZone),
  );
  const startsIn = describeEventStartsIn(event.startsInMinutes);
  const metaLabel = recurrence
    ? t(
        recurrence.key,
        recurrence.kind === "weekly" ? { weekday: t(recurrence.weekdayKey) } : undefined,
      )
    : startsIn
      ? t(startsIn.key, startsIn.params)
      : null;

  const elapsedMinutes = Math.floor(
    (instant.getTime() - new Date(event.startsAt).getTime()) / MS_PER_MINUTE,
  );
  const elapsed = event.isLive ? describeEventDuration(elapsedMinutes) : null;
  const duration = describeEventDuration(event.durationMinutes);
  const durationLabel = elapsed
    ? t(EVENT_DURATION_ELAPSED_KEY, { duration: t(elapsed.key, elapsed.params) })
    : duration
      ? t(duration.key, duration.params)
      : null;

  const press = (pressed: EventRsvp) => {
    const target = resolveEventRsvpTarget(rsvp, pressed);
    setPatch({ base: event.rsvp, target });

    void Promise.resolve(onRsvp?.(target)).catch(() => {
      setPatch(null);
      toast.show({ message: t("errors.genericTitle"), tone: "danger" });
    });
  };

  const actionBase: React.CSSProperties = {
    borderRadius: pxToRem(card.actionRadius),
    fontSize: pxToRem(card.actionFontSize),
    fontWeight: card.actionWeight,
    height: pxToRem(card.actionHeight),
    lineHeight: 1,
    transitionDuration: `${card.transitionSeconds}s`,
    transitionProperty: "background-color, color, border-color",
  };

  return (
    <article
      aria-label={t("events.a11y.card", { day: dayLabel, time: clock, title: event.title })}
      className={cn(
        "relative flex cursor-pointer flex-col overflow-hidden",
        `hover:border-[hsl(var(--primary)/${card.hoverBorderAlpha})]`,
        "hover:[transform:translateY(-0.125rem)]",
      )}
      data-kind={event.kind}
      data-rsvp={rsvp ?? undefined}
      data-selected={selected || undefined}
      data-testid="event-card"
      onClick={onOpen}
      style={{
        background: going
          ? "hsl(var(--surface-card))"
          : `hsl(var(--surface-card)/${card.idleSurfaceAlpha})`,
        border: `${hairline()} solid ${
          selected
            ? `hsl(var(--primary)/${card.selectedBorderAlpha})`
            : going
              ? `hsl(var(--success)/${card.goingBorderAlpha})`
              : `hsl(var(--border)/${card.borderAlpha})`
        }`,
        borderRadius: pxToRem(card.radius),
        minHeight: pxToRem(EVENT_CARD_MIN_HEIGHT),
        transitionDuration: `${card.transitionSeconds}s`,
        transitionProperty: "background-color, border-color, transform",
      }}
    >
      {/* 1. Üst blok — tür karesi + pil satırı + başlık */}
      <div
        className="flex items-start"
        style={{
          gap: pxToRem(card.topGap),
          padding: `${pxToRem(card.topPaddingTop)} ${pxToRem(card.paddingX)} 0`,
        }}
      >
        <EventKindTile
          fontSize={card.kindGlyphFontSize}
          kind={event.kind}
          radius={card.kindTileRadius}
          size={card.kindTileSize}
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center" style={{ gap: pxToRem(card.badgeRowGap) }}>
            <EventKindPill kind={event.kind} label={t(`events.kind.${event.kind}`)} />
            {event.isLive ? <EventLivePill label={t("events.card.live")} /> : null}
            {metaLabel ? (
              <span
                className="truncate text-[hsl(var(--text-muted))]"
                data-testid="event-card-meta"
                style={{
                  fontSize: pxToRem(card.metaFontSize),
                  fontWeight: card.metaWeight,
                  lineHeight: 1,
                }}
              >
                {metaLabel}
              </span>
            ) : null}
          </div>

          <button
            aria-label={t("events.card.open", { title: event.title })}
            className={cn(
              "block w-full text-left text-[hsl(var(--foreground))]",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              EVENT_DISPLAY_FONT,
            )}
            data-testid="event-card-title"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onOpen?.();
            }}
            style={{
              background: "transparent",
              border: 0,
              fontSize: pxToRem(card.titleFontSize),
              fontWeight: card.titleWeight,
              letterSpacing: `${card.titleLetterSpacing}em`,
              lineHeight: card.titleLineHeight,
              marginTop: pxToRem(card.titleMarginTop),
              padding: 0,
              textWrap: "pretty",
            }}
            type="button"
          >
            {event.title}
          </button>
        </div>
      </div>

      {/* 2. Saat ve yer */}
      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(card.timeBlockGap),
          padding: `${pxToRem(card.timePaddingTop)} ${pxToRem(card.paddingX)} 0`,
        }}
      >
        <div
          className="flex min-w-0 items-center text-[hsl(var(--foreground))]"
          data-testid="event-card-time"
          style={{
            fontSize: pxToRem(card.timeFontSize),
            fontWeight: card.timeWeight,
            gap: pxToRem(card.timeRowGap),
            lineHeight: card.timeLineHeight,
          }}
        >
          <Clock
            aria-hidden="true"
            className="flex-none text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(card.timeIconSize, card.timeFontSize),
              width: pxToEm(card.timeIconSize, card.timeFontSize),
            }}
          />
          {event.isLive ? t("events.card.now") : clock}
          {durationLabel ? (
            <span className="text-[hsl(var(--text-muted))]" style={{ fontWeight: card.metaWeight }}>
              {durationLabel}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(card.timeRowGap) }}>
          <EventSourceTile
            event={event}
            fontSize={card.sourceTileFontSize}
            radius={card.sourceTileRadius}
            size={card.sourceTileSize}
          />
          <span
            className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
            data-testid="event-card-place"
            style={{
              fontSize: pxToRem(card.placeFontSize),
              fontWeight: card.placeWeight,
              lineHeight: card.timeLineHeight,
            }}
          >
            {t("events.card.place", { channel: event.channelLabel, server: event.serverName })}
          </span>
        </div>
      </div>

      {/* 3. Katılımcılar */}
      <div
        className="flex min-w-0 items-center"
        style={{
          gap: pxToRem(card.attendeesGap),
          padding: `${pxToRem(card.attendeesPaddingTop)} ${pxToRem(card.paddingX)} 0`,
        }}
      >
        <EventAttendeeStack attendees={event.attendeePreview} />
        <span
          className="min-w-0 flex-1 truncate text-[hsl(var(--text-muted))]"
          data-testid="event-card-attendees"
          style={{
            fontSize: pxToRem(card.attendeeTextFontSize),
            fontWeight: card.attendeeTextWeight,
            lineHeight: card.timeLineHeight,
          }}
        >
          {t("events.card.attendees", { count: event.goingCount, host: event.host.name })}
        </span>
      </div>

      {/* 4. Eylem satırı — iki buton, başka hiçbir şey */}
      <div
        className="flex items-center"
        data-testid="event-card-actions"
        style={{
          background: `hsl(var(--surface-soft)/${card.actionsSurfaceAlpha})`,
          borderTop: `${hairline()} solid hsl(var(--border)/${card.actionsBorderTopAlpha})`,
          gap: pxToRem(card.actionsGap),
          marginTop: pxToRem(card.actionsMarginTop),
          padding: `${pxToRem(card.actionsPaddingTop)} ${pxToRem(card.paddingX)} ${pxToRem(
            card.actionsPaddingBottom,
          )}`,
        }}
      >
        <button
          aria-pressed={going}
          className={cn(
            "flex flex-1 items-center justify-center",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            going
              ? undefined
              : `hover:bg-[hsl(var(--primary)/${card.actionActiveSurfaceAlpha})] hover:text-[hsl(var(--primary))]`,
          )}
          data-testid="event-card-going"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            press("going");
          }}
          style={{
            ...actionBase,
            background: going
              ? `hsl(var(--success)/${card.actionActiveSurfaceAlpha})`
              : "transparent",
            border: `${hairline()} solid ${
              going
                ? `hsl(var(--success)/${card.actionActiveBorderAlpha})`
                : `hsl(var(--border)/${card.actionIdleBorderAlpha})`
            }`,
            color: going ? "hsl(var(--success))" : "hsl(var(--text-secondary))",
            gap: pxToRem(card.joinGap),
          }}
          type="button"
        >
          <Check
            aria-hidden="true"
            className="flex-none"
            style={{
              height: pxToEm(card.joinIconSize, card.actionFontSize),
              width: pxToEm(card.joinIconSize, card.actionFontSize),
            }}
          />
          {going ? t("events.card.joined") : t("events.card.join")}
        </button>

        <button
          aria-pressed={maybe}
          className={cn(
            "flex-none",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            maybe
              ? undefined
              : "hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))]",
          )}
          data-testid="event-card-maybe"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            press("maybe");
          }}
          style={{
            ...actionBase,
            background: maybe
              ? `hsl(var(--warning)/${card.actionActiveSurfaceAlpha})`
              : "transparent",
            border: `${hairline()} solid ${
              maybe
                ? `hsl(var(--warning)/${card.actionActiveBorderAlpha})`
                : `hsl(var(--border)/${card.actionIdleBorderAlpha})`
            }`,
            color: maybe ? "hsl(var(--warning))" : "hsl(var(--text-secondary))",
            padding: `0 ${pxToRem(card.maybePaddingX)}`,
          }}
          type="button"
        >
          {t("events.card.maybe")}
        </button>
      </div>

      {selected ? (
        <span
          aria-hidden="true"
          data-testid="event-card-stripe"
          style={{
            background: "hsl(var(--primary))",
            borderRadius: `0 ${pxToRem(card.selectedStripeRadius)} ${pxToRem(
              card.selectedStripeRadius,
            )} 0`,
            bottom: pxToRem(card.selectedStripeInset),
            left: 0,
            position: "absolute",
            top: pxToRem(card.selectedStripeInset),
            width: pxToRem(card.selectedStripeWidth),
          }}
        />
      ) : null}
    </article>
  );
}
