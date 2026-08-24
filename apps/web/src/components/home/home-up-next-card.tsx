"use client";

import React, { memo } from "react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import type { HomeCardState } from "@/hooks/use-home-queries";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToRem } from "@/lib/home/metrics";
import { HOME_EVENTS_HREF } from "@/lib/home/href";
import {
  formatEventClock,
  getEventDayLabel,
  getMinutesUntil,
  resolveHomeCopy,
} from "@/lib/home/presentation";
import type { EventsUpcomingResponse, HomeEventSummary } from "@/lib/home/types";
import { cn } from "@/lib/utils";

import { HomeCard, HomeCardError, HomeCardMessage, HomeSkeletonRows } from "./home-card";
import { DISPLAY_FONT, HomeAvatar, HomeCardNotice, homeButtonStyle } from "./home-primitives";

/**
 * "SIRADAKİ" — SPEC §3.5, `05-faz4` §4.5.
 *
 * Kalan süre istemcide hesaplanır ve **dakikada bir** tazelenir; saat `useMinuteClock`'tan
 * gelir ve sekme gizliyken durur (§7). Gün etiketi saf fonksiyondan (`getEventDayLabel`).
 */

const { upNextCard } = HOME_METRICS;

const EVENT_TITLE_LINE_HEIGHT = 1.2;
const CONTEXT_LINE_HEIGHT = 1.2;

/** Öne çıkan etkinliğin blok yüksekliği — iskelet aynı yeri tutar, ızgara zıplamaz. */
const NEXT_BLOCK_HEIGHT =
  HOME_TYPE_SCALE.cardBigNumber.size * HOME_TYPE_SCALE.cardBigNumber.lineHeight +
  upNextCard.titleMarginTop +
  upNextCard.titleFontSize * upNextCard.titleLineHeight +
  upNextCard.contextMarginTop +
  upNextCard.contextFontSize * CONTEXT_LINE_HEIGHT +
  upNextCard.attendeesMarginTop +
  upNextCard.attendeeAvatarSize;

const EVENT_ROW_HEIGHT = upNextCard.eventPaddingTop + upNextCard.eventSeparatorHeight;

function EventRow({
  event,
  first,
  locale,
  now,
}: {
  event: HomeEventSummary;
  first: boolean;
  locale: string;
  now: Date;
}) {
  const { t } = useI18n();

  return (
    <div
      className="flex items-center border-0 border-t border-solid border-[hsl(var(--border)/0.5)]"
      data-testid="home-up-next-event"
      style={{
        borderTopWidth: hairline(upNextCard.eventBorderTopWidth),
        gap: pxToRem(upNextCard.eventGap),
        marginTop: pxToRem(first ? upNextCard.firstEventMarginTop : upNextCard.eventMarginTop),
        paddingTop: pxToRem(first ? upNextCard.firstEventPaddingTop : upNextCard.eventPaddingTop),
      }}
    >
      <div
        className="shrink-0 text-center"
        style={{ width: pxToRem(upNextCard.eventTimeColumnWidth) }}
      >
        <div
          className={cn(DISPLAY_FONT, "text-[hsl(var(--text-secondary))]")}
          style={{
            fontSize: pxToRem(upNextCard.eventTimeFontSize),
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {formatEventClock(event.startAt, locale)}
        </div>
        <div
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(upNextCard.eventDayFontSize),
            lineHeight: 1,
            marginTop: pxToRem(upNextCard.eventDayMarginTop),
          }}
        >
          {resolveHomeCopy(getEventDayLabel(event.startAt, now, locale), t)}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="shrink-0 bg-[hsl(var(--border))]"
        style={{
          height: pxToRem(upNextCard.eventSeparatorHeight),
          width: hairline(upNextCard.eventSeparatorWidth),
        }}
      />

      <div className="min-w-0 flex-1">
        <div
          className="truncate whitespace-nowrap text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(upNextCard.eventTitleFontSize),
            fontWeight: 600,
            lineHeight: EVENT_TITLE_LINE_HEIGHT,
          }}
        >
          {event.title}
        </div>
        <div
          className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(upNextCard.eventSubtitleFontSize),
            lineHeight: 1,
            marginTop: pxToRem(upNextCard.eventSubtitleMarginTop),
          }}
        >
          {event.context}
        </div>
      </div>
    </div>
  );
}

export type HomeUpNextCardProps = {
  isRemindPending: boolean;
  locale: string;
  notice: string | null;
  now: Date;
  onRemind: (input: { eventId: string; interested: boolean; serverId: string }) => void;
  rowCount: number;
  state: HomeCardState<EventsUpcomingResponse>;
};

function HomeUpNextCardComponent({
  isRemindPending,
  locale,
  notice,
  now,
  onRemind,
  rowCount,
  state,
}: HomeUpNextCardProps) {
  const { t } = useI18n();
  const data = state.status === "ready" ? state.data : null;
  const next = data?.next ?? null;
  const minutesLeft = next ? getMinutesUntil(next.startAt, now) : 0;

  return (
    <HomeCard
      accessory={
        data && data.totalCount > 0 ? (
          <span
            className="text-[hsl(var(--text-muted))]"
            data-testid="home-up-next-count"
            style={{
              fontSize: pxToRem(upNextCard.countFontSize),
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            {t("home.upNext.eventCount", { count: data.totalCount })}
          </span>
        ) : null
      }
      columnSpan={upNextCard.columnSpan}
      cardId="upNext"
      label={t("home.upNext.title")}
      padding={pxToRem(upNextCard.padding)}
      testId="home-up-next-card"
    >
      {state.status === "loading" ? (
        <>
          <HomeSkeletonRows
            count={1}
            gap={0}
            radius={upNextCard.eventSeparatorHeight}
            rowHeight={NEXT_BLOCK_HEIGHT}
            style={{ marginTop: pxToRem(upNextCard.timeRowMarginTop) }}
            testId="home-up-next-skeleton"
          />
          <HomeSkeletonRows
            count={rowCount}
            gap={upNextCard.eventMarginTop}
            radius={upNextCard.eventSeparatorWidth}
            rowHeight={EVENT_ROW_HEIGHT}
            style={{ marginTop: pxToRem(upNextCard.firstEventMarginTop) }}
            testId="home-up-next-event-skeleton"
          />
        </>
      ) : state.status === "error" ? (
        <HomeCardError onRetry={state.retry} testId="home-up-next-error" />
      ) : !next ? (
        <HomeCardMessage message={t("home.upNext.empty")} testId="home-up-next-empty" />
      ) : (
        <>
          <div
            className="flex items-end"
            style={{
              gap: pxToRem(upNextCard.timeRowGap),
              marginTop: pxToRem(upNextCard.timeRowMarginTop),
            }}
          >
            <span
              className={cn(DISPLAY_FONT, "text-[hsl(var(--foreground))]")}
              style={{
                fontSize: pxToRem(HOME_TYPE_SCALE.cardBigNumber.size),
                fontWeight: HOME_TYPE_SCALE.cardBigNumber.weight,
                lineHeight: HOME_TYPE_SCALE.cardBigNumber.lineHeight,
              }}
            >
              {formatEventClock(next.startAt, locale)}
            </span>
            <span
              className="shrink-0 text-[var(--warning-readable)]"
              data-testid="home-up-next-remaining"
              style={{
                background: "hsl(var(--warning) / 0.15)",
                borderRadius: pxToRem(HOME_METRICS.radius.pill),
                fontSize: pxToRem(upNextCard.remainingPillFontSize),
                fontWeight: 600,
                lineHeight: 1,
                padding: `${pxToRem(upNextCard.remainingPillPaddingY)} ${pxToRem(
                  upNextCard.remainingPillPaddingX,
                )}`,
              }}
            >
              {t("home.upNext.minutesLeft", { minutes: minutesLeft })}
            </span>
          </div>

          <div
            className="truncate text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(upNextCard.titleFontSize),
              fontWeight: 600,
              lineHeight: upNextCard.titleLineHeight,
              marginTop: pxToRem(upNextCard.titleMarginTop),
            }}
          >
            {next.title}
          </div>
          <div
            className="truncate text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(upNextCard.contextFontSize),
              lineHeight: CONTEXT_LINE_HEIGHT,
              marginTop: pxToRem(upNextCard.contextMarginTop),
            }}
          >
            {next.context}
          </div>

          <div
            className="flex items-center"
            style={{
              gap: pxToRem(upNextCard.attendeesGap),
              marginTop: pxToRem(upNextCard.attendeesMarginTop),
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: pxToRem(upNextCard.attendeeAvatarGap) }}
            >
              {next.attendees.map((attendee) => (
                <span
                  className="inline-flex shrink-0 rounded-full"
                  key={attendee.id}
                  style={{
                    boxShadow: `0 0 0 ${pxToRem(
                      upNextCard.attendeeAvatarRingWidth,
                    )} hsl(var(--surface-card))`,
                  }}
                >
                  <HomeAvatar
                    avatarUrl={attendee.avatarUrl}
                    displayName={attendee.displayName}
                    fontSize={upNextCard.attendeeAvatarFontSize}
                    size={upNextCard.attendeeAvatarSize}
                  />
                </span>
              ))}
            </div>
            <span
              className="truncate text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(upNextCard.attendeeCaptionFontSize) }}
            >
              {t("home.upNext.attendees", { count: next.attendeeCount })}
            </span>
          </div>

          {(data?.upcoming ?? []).map((event, index) => (
            <EventRow event={event} first={index === 0} key={event.id} locale={locale} now={now} />
          ))}

          <div
            className="flex"
            style={{
              gap: pxToRem(upNextCard.footerGap),
              marginTop: "auto",
              paddingTop: pxToRem(upNextCard.footerPaddingTop),
            }}
          >
            {/*
              §2.3 — `ScheduledEventInterest` idempotent. Metin `interested` alanından okunur ve
              **öyle kalır**: geçici bir animasyon, sayfa yenilenince yalan söylerdi. İkinci basış
              ilgiyi kaldırır, sayacı ikinci kez artırmaz.
            */}
            <button
              aria-pressed={next.interested}
              className="inline-flex flex-1 items-center justify-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] outline-hidden transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60"
              data-testid="home-up-next-remind"
              disabled={isRemindPending}
              onClick={() =>
                onRemind({
                  eventId: next.id,
                  interested: !next.interested,
                  serverId: next.serverId,
                })
              }
              style={homeButtonStyle()}
              type="button"
            >
              {t(next.interested ? "home.upNext.reminded" : "home.upNext.remind")}
            </button>
            {/*
              Karar #10: takvim görünümü uygulama içinde. Etkinlikler Ş10 eski
              liste/takvim ikilisini sildi; `/events` artık tek ekran ve kendi
              hafta şeridini taşıyor, o yüzden buton `?view=` taşımıyor.
            */}
            <Link
              className="inline-flex flex-1 items-center justify-center bg-amber-400 text-slate-900 outline-hidden transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="home-up-next-calendar"
              href={HOME_EVENTS_HREF}
              style={homeButtonStyle()}
            >
              {t("home.upNext.calendar")}
            </Link>
          </div>

          <HomeCardNotice message={notice} />
        </>
      )}
    </HomeCard>
  );
}

export const HomeUpNextCard = memo(HomeUpNextCardComponent);
