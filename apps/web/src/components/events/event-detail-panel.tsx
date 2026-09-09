"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import type { EventAttendee, EventRsvp, WhisprEvent } from "@wizards/types";

import { EventAttendeeRow } from "@/components/events/event-attendee-row";
import {
  EVENT_DISPLAY_FONT,
  EventKindPill,
  EventKindTile,
} from "@/components/events/event-kind-tile";
import { EventReminderStrip } from "@/components/events/event-reminder-strip";
import { EventSourceTile } from "@/components/events/event-source-tile";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { useToast } from "@/hooks/use-toast";
import {
  EVENTS_STALE_TIME_MS,
  eventsQueryKeys,
  fetchEventDetail,
  setEventRsvp,
} from "@/lib/events/client";
import type { EventDetailResponse } from "@/lib/events/detail-contract";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import {
  EVENT_DAY_BUCKET_KEY,
  describeEventDuration,
  formatEventClock,
} from "@/lib/events/presentation";
import { buildEventsHref } from "@/lib/events/routes";
import { resolveAccountTimeZone } from "@wizards/types";
import { cn } from "@/lib/utils";

/**
 * Etkinlik detay paneli (326) — SPEC §5.
 *
 * Zemin `--surface-panel` (referans HTML `:483`), `--surface-card` **değil**; SPEC bu noktada
 * sessiz ve iki değer arasındaki fark koyu temada gözle görülür.
 *
 * Sütunun genişliği ve sol ayırıcısı Ş5'in `events-right-column` sarmalayıcısında; panel onu
 * ikinci kez çizmez, doldurur (ray da aynı kuralı izliyor).
 *
 * Panel **kendi `Esc` dinleyicisini kurmaz**: modal → panel → RSVP şeridi merdiveni Ş5'in
 * `eventsUiReducer` çağrısında tek yerde duruyor. İkinci bir dinleyici, modal açıkken `Esc`
 * basıldığında ikisini birden kapatırdı.
 *
 * Katılımcılar `useInfiniteQuery` ile sayfalanıyor. Anahtar `eventsQueryKeys.details(id)`
 * olarak kalıyor — imleci anahtara halka olarak eklemek yerine sayfaları sorgunun kendisine
 * bırakmak, Ş4'ün `event:updated` geçersiz kılmasının **bütün** sayfaları birden tazelemesini
 * sağlıyor.
 */

const { detailPanel } = EVENTS_METRICS;

export type FocusTarget = { readonly focus: () => void };

/**
 * Açılışta odak kapatma butonuna gider, kapanışta tetikleyiciye döner.
 *
 * Efektin gövdesi ayrı bir fonksiyonda çünkü kural bir DOM'a değil bir **sıraya** dair ve
 * sırayı sahte iki nesneyle sınamak, bir tarayıcı taklidi kurmaktan daha doğru bir kanıt.
 */
export function applyDetailPanelFocus(
  closeButton: FocusTarget | null,
  trigger: FocusTarget | null,
): () => void {
  closeButton?.focus();

  return () => {
    trigger?.focus();
  };
}

/**
 * Sayfaları tek listeye indirger. Ayıklama **kimlik** üzerinden: Ş2 aynı kişiyi ikinci
 * sayfada döndürmüyor ama iyimser bir yazım ya da yeniden çekim iki sayfayı üst üste
 * bindirebilir ve o zaman aynı satır iki kez çizilirdi.
 */
export function mergeEventAttendees(
  pages: readonly (readonly EventAttendee[])[],
): readonly EventAttendee[] {
  const seen = new Set<string>();
  const merged: EventAttendee[] = [];

  for (const page of pages) {
    for (const attendee of page) {
      if (seen.has(attendee.id)) {
        continue;
      }

      seen.add(attendee.id);
      merged.push(attendee);
    }
  }

  return merged;
}

export type EventDetailPanelProps = {
  readonly eventId: string;
  readonly onClose: () => void;
};

export function EventDetailPanel({ eventId, onClose }: EventDetailPanelProps) {
  const { locale, t } = useI18n();
  const { preferences } = useAccountPreferenceRuntime();
  const queryClient = useQueryClient();
  const toast = useToast();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  /**
   * `Katıl` yanıtı da `scheduled` taşıyor (Ş3 üç yazma ucunda aynı gövdeyi dönüyor). Etkinlik
   * seçilen dakikadan yakınsa hatırlatma işi kuyruğa **yazılmadı** ve şerit bunu ilk tıkta
   * söylemeli; hatırlatmanın kendi yazımını beklemek, gelmeyecek bir bildirimin sözünü
   * vermek olurdu (tuzak #8).
   */
  const [rsvpScheduled, setRsvpScheduled] = useState<boolean | null>(null);
  const timeZone = resolveAccountTimeZone(preferences.timeZone);

  const detailQuery = useInfiniteQuery({
    getNextPageParam: (last: EventDetailResponse) => last.attendeeNextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchEventDetail({ attendeeCursor: pageParam, eventId }),
    queryKey: [...eventsQueryKeys.details(eventId)],
    staleTime: EVENTS_STALE_TIME_MS.detail,
  });

  const rsvpMutation = useMutation({
    mutationFn: (next: EventRsvp | null) => setEventRsvp(eventId, next),
    onSuccess: (payload) => {
      setRsvpScheduled(payload.scheduled);
      queryClient.setQueryData<{
        pageParams: readonly unknown[];
        pages: readonly EventDetailResponse[];
      }>([...eventsQueryKeys.details(eventId)], (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                goingCount: payload.event.goingCount,
                maybeCount: payload.event.maybeCount,
                reminder: payload.event.reminder,
                rsvp: payload.event.rsvp,
              })),
            }
          : current,
      );
      queryClient.setQueryData([...eventsQueryKeys.counts], payload.counts);
      void queryClient.invalidateQueries({ queryKey: [...eventsQueryKeys.lists] });
    },
  });

  useEffect(() => {
    // Tetikleyici efekt anında hâlâ odaktadır: tıklama onu odaklamış, panel henüz odağı
    // almamıştır. Kapanışta bu düğüme dönmek, klavye kullanıcısını akışta bıraktığı yerde
    // bulur.
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return applyDetailPanelFocus(closeRef.current, trigger);
  }, []);

  const pages = detailQuery.data?.pages ?? [];
  const detail = pages[0] ?? null;
  const lastPage = pages[pages.length - 1] ?? null;
  const attendees = mergeEventAttendees(pages.map((page) => page.attendees));
  const attendeeMoreCount = lastPage?.attendeeMoreCount ?? 0;

  return (
    <aside
      aria-label={t("events.a11y.detailPanel")}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-testid="event-detail-panel"
      role="complementary"
      style={{ background: "hsl(var(--surface-panel))" }}
    >
      <header
        className="flex items-start"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/${detailPanel.headerBorderAlpha})`,
          gap: pxToRem(detailPanel.headerGap),
          padding: `${pxToRem(detailPanel.headerPaddingTop)} ${pxToRem(
            detailPanel.headerPaddingX,
          )} ${pxToRem(detailPanel.headerPaddingBottom)}`,
        }}
      >
        {/* Tür karesi Ş6'nın paylaşılan bileşeni; panel ölçüsü 38, kart 42, modal 26. */}
        {detail ? (
          <EventKindTile
            fontSize={detailPanel.kindGlyphFontSize}
            kind={detail.kind}
            radius={detailPanel.kindTileRadius}
            size={detailPanel.kindTileSize}
          />
        ) : (
          <Skeleton
            style={{
              borderRadius: pxToRem(detailPanel.kindTileRadius),
              height: pxToRem(detailPanel.kindTileSize),
              width: pxToRem(detailPanel.kindTileSize),
            }}
          />
        )}

        <div className="min-w-0 flex-1">
          {detail ? (
            <>
              <div className="flex items-center" style={{ gap: pxToRem(detailPanel.pillRowGap) }}>
                <EventKindPill
                  fontSize={detailPanel.kindPillFontSize}
                  kind={detail.kind}
                  label={t(`events.kind.${detail.kind}`)}
                />
                {durationText(detail, t) ? (
                  <span
                    className="text-[hsl(var(--text-muted))]"
                    style={{
                      fontSize: pxToRem(detailPanel.durationFontSize),
                      fontWeight: detailPanel.durationWeight,
                      lineHeight: 1,
                    }}
                  >
                    {durationText(detail, t)}
                  </span>
                ) : null}
              </div>
              <h2
                className={cn("text-[hsl(var(--foreground))]", EVENT_DISPLAY_FONT)}
                style={{
                  fontSize: pxToRem(detailPanel.titleFontSize),
                  fontWeight: detailPanel.titleWeight,
                  letterSpacing: `${detailPanel.titleLetterSpacing}em`,
                  lineHeight: detailPanel.titleLineHeight,
                  marginTop: pxToRem(detailPanel.titleMarginTop),
                }}
              >
                {detail.title}
              </h2>
            </>
          ) : (
            <Skeleton style={{ height: pxToRem(detailPanel.kindTileSize) }} />
          )}
        </div>

        <WindowCloseButton
          aria-label={t("events.detail.close")}
          onClick={onClose}
          ref={closeRef}
          testId="event-detail-close"
        />
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="event-detail-body"
        style={{
          gap: pxToRem(detailPanel.bodyGap),
          padding: `${pxToRem(detailPanel.bodyPaddingY)} ${pxToRem(detailPanel.bodyPaddingX)}`,
        }}
      >
        {detail === null ? (
          detailQuery.isError ? (
            <p
              className="text-[hsl(var(--text-muted))]"
              data-testid="event-detail-error"
              style={{ fontSize: pxToRem(detailPanel.infoTextFontSize) }}
            >
              {t("events.error.title")}
            </p>
          ) : (
            /* Yükleniyor: iskelet blokların yerini tutar, metin yazmaz — "Katılımcılar" gibi
               bir başlığı veri gelmeden yazmak, boş bir listeyi doluymuş gibi gösterirdi. */
            <div
              className="flex flex-col"
              data-testid="event-detail-skeleton"
              style={{ gap: pxToRem(detailPanel.bodyGap) }}
            >
              {[0, 1, 2].map((index) => (
                <Skeleton
                  key={index}
                  style={{
                    borderRadius: pxToRem(detailPanel.infoCardRadius),
                    height: pxToRem(detailPanel.reminderPaddingY * 4),
                  }}
                />
              ))}
            </div>
          )
        ) : (
          <>
            <div
              className="flex flex-col"
              data-testid="event-detail-info"
              style={{
                background: "hsl(var(--surface-card))",
                border: `${hairline()} solid hsl(var(--border)/${detailPanel.infoCardBorderAlpha})`,
                borderRadius: pxToRem(detailPanel.infoCardRadius),
                gap: pxToRem(detailPanel.infoCardGap),
                padding: `${pxToRem(detailPanel.infoCardPaddingY)} ${pxToRem(
                  detailPanel.infoCardPaddingX,
                )}`,
              }}
            >
              <div className="flex items-center" style={{ gap: pxToRem(detailPanel.infoRowGap) }}>
                <CalendarDays
                  aria-hidden="true"
                  size={pxToEm(detailPanel.infoIconSize, detailPanel.infoTextFontSize)}
                  strokeWidth={1.9}
                  style={{ color: "hsl(var(--primary))", flex: "none" }}
                />
                <span
                  className="min-w-0 flex-1 text-[hsl(var(--foreground))]"
                  style={{
                    fontSize: pxToRem(detailPanel.infoTextFontSize),
                    fontWeight: detailPanel.infoTextWeight,
                    lineHeight: detailPanel.infoTextLineHeight,
                  }}
                >
                  {whenText(detail, timeZone, locale, t)}
                </span>
              </div>

              <div className="flex items-center" style={{ gap: pxToRem(detailPanel.infoRowGap) }}>
                {/* Kaynak karesi Ş6'nın; K3 dilini (üye değilsen `TK`) o bileşen taşıyor. */}
                <EventSourceTile
                  event={detail}
                  fontSize={detailPanel.sourceTileFontSize}
                  radius={detailPanel.sourceTileRadius}
                  size={detailPanel.sourceTileSize}
                />
                <span
                  className="min-w-0 flex-1 text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(detailPanel.whereFontSize),
                    fontWeight: detailPanel.whereWeight,
                    lineHeight: detailPanel.whereLineHeight,
                  }}
                >
                  {t("events.card.place", {
                    channel: detail.channelLabel,
                    server: detail.serverName,
                  })}
                </span>
              </div>

              <div className="flex items-center" style={{ gap: pxToRem(detailPanel.infoRowGap) }}>
                <EventHostAvatar detail={detail} />
                <span
                  className="min-w-0 flex-1 text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(detailPanel.whereFontSize),
                    fontWeight: detailPanel.whereWeight,
                    lineHeight: detailPanel.whereLineHeight,
                  }}
                >
                  {t("events.detail.hostedBy", { host: detail.host.name })}
                </span>
              </div>
            </div>

            {detail.description.trim().length > 0 ? (
              <div data-testid="event-detail-description">
                <SectionLabel>{t("events.detail.description")}</SectionLabel>
                <p
                  className="text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(detailPanel.descriptionFontSize),
                    lineHeight: detailPanel.descriptionLineHeight,
                    margin: `${pxToRem(detailPanel.descriptionMarginTop)} 0 0`,
                  }}
                >
                  {detail.description}
                </p>
              </div>
            ) : null}

            <div data-testid="event-detail-attendees">
              <div
                className="flex items-center"
                style={{
                  gap: pxToRem(detailPanel.attendeeHeaderGap),
                  paddingBottom: pxToRem(detailPanel.attendeeHeaderPaddingBottom),
                }}
              >
                <SectionLabel>{t("events.detail.attendees")}</SectionLabel>
                <span
                  className={cn("text-[hsl(var(--text-muted)/0.75)]", EVENT_DISPLAY_FONT)}
                  style={{
                    fontSize: pxToRem(detailPanel.sectionLabelFontSize),
                    fontWeight: detailPanel.sectionLabelWeight,
                    lineHeight: 1,
                  }}
                >
                  {attendees.length + attendeeMoreCount}
                </span>
              </div>

              <div className="flex flex-col" style={{ gap: pxToRem(detailPanel.attendeeListGap) }}>
                {attendees.map((attendee) => (
                  <EventAttendeeRow attendee={attendee} key={attendee.id} />
                ))}

                {lastPage?.attendeeNextCursor ? (
                  <button
                    className="self-start text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    data-testid="event-detail-more"
                    disabled={detailQuery.isFetchingNextPage}
                    onClick={() => void detailQuery.fetchNextPage()}
                    style={{
                      fontSize: pxToRem(detailPanel.moreFontSize),
                      fontWeight: detailPanel.moreWeight,
                      lineHeight: 1,
                      marginTop: pxToRem(detailPanel.moreMarginTop),
                      padding: `${pxToRem(detailPanel.morePaddingY)} ${pxToRem(
                        detailPanel.morePaddingX,
                      )}`,
                    }}
                    type="button"
                  >
                    {t("events.detail.more", { count: attendeeMoreCount })}
                  </button>
                ) : null}
              </div>
            </div>

            <EventReminderStrip
              eventId={eventId}
              reminder={detail.reminder}
              rsvp={detail.rsvp}
              scheduled={rsvpScheduled}
              suppressed={detail.reminderSuppressed}
            />
          </>
        )}
      </div>

      {detail ? (
        <footer
          className="flex items-center"
          style={{
            borderTop: `${hairline()} solid hsl(var(--border)/${detailPanel.footerBorderAlpha})`,
            gap: pxToRem(detailPanel.footerGap),
            padding: `${pxToRem(detailPanel.footerPaddingY)} ${pxToRem(
              detailPanel.footerPaddingX,
            )}`,
          }}
        >
          <DetailCta
            detail={detail}
            onRsvp={(next) => rsvpMutation.mutate(next)}
            pending={rsvpMutation.isPending}
            t={t}
          />

          <button
            className="shrink-0 bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="event-detail-share"
            onClick={() => {
              const href = `${window.location.origin}${buildEventsHref({}, { panel: eventId })}`;
              void navigator.clipboard?.writeText(href);
              toast.show({ message: t("common.linkCopied") });
            }}
            style={{
              border: `${hairline()} solid hsl(var(--border))`,
              borderRadius: pxToRem(detailPanel.footerButtonRadius),
              fontSize: pxToRem(detailPanel.footerButtonFontSize),
              fontWeight: detailPanel.footerButtonWeight,
              height: pxToRem(detailPanel.footerButtonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(detailPanel.footerSharePaddingX)}`,
            }}
            type="button"
          >
            {t("events.detail.share")}
          </button>
        </footer>
      ) : null}
    </aside>
  );
}

type Translate = (key: string, values?: Record<string, number | string>) => string;

function durationText(event: WhisprEvent, t: Translate): string | null {
  const descriptor = describeEventDuration(event.durationMinutes);
  return descriptor ? t(descriptor.key, descriptor.params) : null;
}

/**
 * `{gün} · {saat} · {süre}`. Süresi olmayan etkinlikte üçüncü parça **düşer**; boş bir
 * parçayla kurulan cümle sonunda asılı bir ayraç bırakırdı.
 */
function whenText(event: WhisprEvent, timeZone: string, locale: string, t: Translate): string {
  const day = t(EVENT_DAY_BUCKET_KEY[event.dayBucket]);
  const time = formatEventClock(event.startsAt, timeZone, locale);
  const duration = durationText(event, t);

  return duration
    ? t("events.detail.when", { day, duration, time })
    : t("events.agenda.goingWhen", { day, time });
}

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <span
      className={cn("uppercase text-[hsl(var(--text-muted))]", EVENT_DISPLAY_FONT)}
      style={{
        fontSize: pxToRem(detailPanel.sectionLabelFontSize),
        fontWeight: detailPanel.sectionLabelWeight,
        letterSpacing: `${detailPanel.sectionLabelLetterSpacing}em`,
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function EventHostAvatar({ detail }: { readonly detail: EventDetailResponse }) {
  return (
    <Avatar
      alt={detail.host.name}
      fallback={detail.host.initials}
      src={detail.host.avatarUrl}
      style={{
        fontSize: pxToRem(detailPanel.sourceTileFontSize),
        height: pxToRem(detailPanel.hostAvatarSize),
        width: pxToRem(detailPanel.hostAvatarSize),
      }}
    />
  );
}

/**
 * CTA metni **Ş2'nin üç alanından** kurulur; sunucu hiçbir metin göndermez.
 *
 * Sıra bağlayıcı: `going` önce gelir. Katılımını geri almak isteyen biri, etkinlik canlıya
 * geçtiği için o butonu kaybetmemeli — canlı yayına giriş kartın ve ray satırının kendi
 * yolundan da açılıyor.
 */
function DetailCta({
  detail,
  onRsvp,
  pending,
  t,
}: {
  readonly detail: EventDetailResponse;
  readonly onRsvp: (next: EventRsvp | null) => void;
  readonly pending: boolean;
  readonly t: Translate;
}) {
  const shared = {
    borderRadius: pxToRem(detailPanel.footerButtonRadius),
    fontSize: pxToRem(detailPanel.footerButtonFontSize),
    fontWeight: detailPanel.footerButtonWeight,
    height: pxToRem(detailPanel.footerButtonHeight),
    lineHeight: 1,
  } as const;

  const primaryShadow = `${pxToRem(detailPanel.footerCtaShadow.x)} ${pxToRem(
    detailPanel.footerCtaShadow.y,
  )} ${pxToRem(detailPanel.footerCtaShadow.blur)} ${pxToRem(
    detailPanel.footerCtaShadow.spread,
  )} hsl(var(--primary))`;

  if (detail.rsvp === "going") {
    return (
      <button
        className="flex-1 transition hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="event-detail-cta"
        disabled={pending}
        onClick={() => onRsvp(null)}
        style={{
          ...shared,
          background: "hsl(var(--surface-tertiary))",
          color: "hsl(var(--text-secondary))",
        }}
        type="button"
      >
        {t("events.detail.leave")}
      </button>
    );
  }

  if (detail.canJoinLive && detail.joinHref) {
    // Gerçek `href`: orta tık ve "yeni sekmede aç" çalışsın diye bağlantı olarak çizilir.
    return (
      <Link
        className="grid flex-1 place-items-center text-white transition hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="event-detail-cta"
        href={detail.joinHref}
        style={{ ...shared, background: "hsl(var(--primary))", boxShadow: primaryShadow }}
      >
        {t("events.detail.joinLive")}
      </Link>
    );
  }

  return (
    <button
      className="flex-1 text-white transition hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      data-testid="event-detail-cta"
      disabled={pending}
      onClick={() => onRsvp("going")}
      style={{ ...shared, background: "hsl(var(--primary))", boxShadow: primaryShadow }}
      type="button"
    >
      {t("events.card.join")}
    </button>
  );
}
