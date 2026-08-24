"use client";

import Link from "next/link";
import React from "react";
import { Bell, LayoutGrid, Plus } from "lucide-react";
import type { EventCounts, EventTab } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { EVENTS_DEFAULT_TAB, buildEventsHref, type EventsRouteState } from "@/lib/events/routes";
import { cn } from "@/lib/utils";

/**
 * Akış başlığı — SPEC §3.1.
 *
 * Başlık **saf sunumdur**: sorgu açmaz, mutasyon çağırmaz, sayı toplamaz. Dört sekme pili, alt
 * satır ve gezinme panelindeki saat ipucu **tek** `EventCounts` nesnesinden okunur (SPEC §8);
 * ikinci bir toplama iki yüzeyi er geç ayrıştırırdı.
 *
 * Sayaçlar **filtresizdir** (tuzak #3): `time/source/mine/q` onlara uygulanmaz. Uygulansaydı bir
 * filtre açıkken bütün sekmeler `0` görünür ve tıklanamaz sanılırdı.
 *
 * Sekmeler `<button>` değil `<Link replace>`: filtre adres çubuğunda duruyor, gerçek bir `href`
 * paylaşılabilir adresi ve orta tıkla yeni sekmeyi bedavaya getiriyor; `replace` ise her filtre
 * tıklamasının geçmiş yığınına bir giriş eklemesini engelliyor (PROMPT §4). Modalı açan
 * `Oluştur` bir `<button>` ve sayfanın `push` yardımcısına gidiyor — geri tuşu onu kapatmalı.
 */

const { feedHeader } = EVENTS_METRICS;

const DISPLAY_FONT = "var(--font-display), sans-serif";

/** SPEC §3.1 sekme sırası. `EventTab` sırası bu; pil sayısı `EventCounts`ın aynı adlı alanı. */
export const EVENT_HEADER_TABS = [
  { countKey: "all", id: "all" },
  { countKey: "upcoming", id: "upcoming" },
  { countKey: "live", id: "live" },
  { countKey: "going", id: "going" },
] as const satisfies readonly { countKey: keyof EventCounts; id: EventTab }[];

export type EventsTranslate = (key: string, values?: Record<string, number | string>) => string;

/**
 * Başlık metni — `SPEC_DEVIATIONS` #4.
 *
 * SPEC §3.1 yalnız sekme ve arama dallarını sayıyor; referans HTML `feedTitle` ayrıca kaynak
 * filtresi seçiliyken **kaynak adını**, `time === 'today'` iken **`Bugün`** yazıyor. Otorite
 * HTML, sıra da onun sırası.
 *
 * Kaynak adı henüz yüklenmemişse (ilk boya) dal atlanır: boş bir başlık, yanlış bir başlıktan
 * daha kötüdür — kutu yerinde durur ama ekranın adı kaybolur.
 */
export function resolveEventsFeedTitle(
  routeState: EventsRouteState,
  sourceTitle: string | null,
  t: EventsTranslate,
): string {
  if (routeState.query) {
    return t("events.title.search");
  }

  if (routeState.source && sourceTitle) {
    return sourceTitle;
  }

  if (routeState.tab === "live") {
    return t("events.title.live");
  }

  if (routeState.tab === "going") {
    return t("events.title.going");
  }

  if (routeState.time === "today") {
    return t("events.title.today");
  }

  return t("events.title");
}

export type EventsFeedSublineInput = {
  readonly counts: EventCounts | null;
  readonly empty: boolean;
  readonly error: boolean;
  /** Yüklenmiş kart sayısı; yanıt `total` taşımıyor, akış elindekini sayar. */
  readonly itemCount: number | null;
  /** Hata dalındaki `Son eşitleme {time}` saati; biçimleme çağıranın (hesap tercihi). */
  readonly lastSyncedLabel: string | null;
  readonly notificationsEnabled: boolean;
  readonly query: string | null;
};

/**
 * Alt satır: `{count} · {sub}` (referans HTML `feedCount · feedSub`).
 *
 * Dört hâl ve öncelikleri: **hata** > **boş** > arama > normal. Hata boş durumu yener, çünkü
 * "0 etkinlik" cümlesi sunucuya hiç ulaşılamadığında bir iddia olurdu — hiçbir şey bilmiyoruz.
 */
export function buildEventsFeedSubline(input: EventsFeedSublineInput, t: EventsTranslate): string {
  if (input.error) {
    return [
      t("events.sub.offline"),
      t("events.sub.errorLine", { time: input.lastSyncedLabel ?? "—" }),
    ].join(" · ");
  }

  const count = t("events.sub.count", { count: input.itemCount ?? 0 });

  if (input.empty) {
    return [count, t("events.sub.emptyLine")].join(" · ");
  }

  return [
    count,
    input.query
      ? t("events.sub.searchResults", { count: input.itemCount ?? 0, query: input.query })
      : t("events.sub.grouped"),
    t("events.sub.live", { count: input.counts?.live ?? 0 }),
    t("events.sub.going", { count: input.counts?.going ?? 0 }),
    t(input.notificationsEnabled ? "events.sub.calendarOn" : "events.sub.calendarOff"),
  ].join(" · ");
}

export type EventsFeedHeaderProps = {
  readonly counts: EventCounts | null;
  /**
   * SPEC §3.1 **zorunlu daralma kuralı**: detay paneli açıkken sekme grubu ve ikon grubu
   * kalkar. `display:none` yerine DOM'dan düşürülüyorlar — gizli bir buton odak sırasında
   * kalır ve 432 px'lik akışta göremediğin bir butona `Tab` ile varmak, ekranın kaybolduğu
   * izlenimi verir.
   */
  readonly detailPanelOpen: boolean;
  readonly empty: boolean;
  readonly error: boolean;
  readonly itemCount: number | null;
  readonly lastSyncedLabel: string | null;
  /** K7 — hesap seviyesindeki etkinlik bildirim tercihi; alt satırın son parçasını sürer. */
  readonly notificationsEnabled: boolean;
  readonly onOpenCreate: () => void;
  readonly onToggleCardSize: () => void;
  readonly onToggleNotifications: () => void;
  readonly routeState: EventsRouteState;
  /** Kaynak filtresi seçiliyken sunucunun adı; yüklenmemişse `null`. */
  readonly sourceTitle: string | null;
  /** K4 — `MANAGE_EVENTS`. Yoksa `Oluştur` girişi **hiç çizilmez**. */
  readonly viewerCanCreate: boolean;
};

export function EventsFeedHeader({
  counts,
  detailPanelOpen,
  empty,
  error,
  itemCount,
  lastSyncedLabel,
  notificationsEnabled,
  onOpenCreate,
  onToggleCardSize,
  onToggleNotifications,
  routeState,
  sourceTitle,
  viewerCanCreate,
}: EventsFeedHeaderProps) {
  const { t } = useI18n();

  const title = resolveEventsFeedTitle(routeState, sourceTitle, t);
  const subline = buildEventsFeedSubline(
    {
      counts,
      empty,
      error,
      itemCount,
      lastSyncedLabel,
      notificationsEnabled,
      query: routeState.query,
    },
    t,
  );

  const iconButtonStyle = {
    borderRadius: pxToRem(feedHeader.iconButtonRadius),
    height: pxToRem(feedHeader.iconButtonSize),
    width: pxToRem(feedHeader.iconButtonSize),
  } as const;

  /** Sekme adresi: aynı sekmeye ikinci tık varsayılana döner, panel ve modal düşer. */
  const tabHref = (tab: EventTab) =>
    buildEventsHref(routeState, {
      createOpen: false,
      panel: null,
      tab: routeState.tab === tab ? EVENTS_DEFAULT_TAB : tab,
    });

  return (
    <header
      className="flex flex-nowrap items-center bg-[hsl(var(--surface-base))]"
      data-testid="events-feed-header"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/${feedHeader.borderBottomAlpha})`,
        gap: pxToRem(feedHeader.gap),
        padding: `${pxToRem(feedHeader.paddingY)} ${pxToRem(feedHeader.paddingX)}`,
      }}
    >
      <div style={{ flex: `1 1 ${pxToRem(feedHeader.titleBlockBasis)}`, minWidth: 0 }}>
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(feedHeader.titleRowGap) }}>
          <h1
            className="m-0 min-w-0 text-[hsl(var(--foreground))]"
            data-testid="events-feed-title"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(feedHeader.titleFontSize),
              fontWeight: feedHeader.titleWeight,
              letterSpacing: `${feedHeader.titleLetterSpacing}em`,
              lineHeight: feedHeader.titleLineHeight,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </h1>
        </div>
        <p
          className="m-0 text-[hsl(var(--text-muted))]"
          data-testid="events-feed-subline"
          style={{
            fontSize: pxToRem(feedHeader.subFontSize),
            fontWeight: feedHeader.subWeight,
            lineHeight: feedHeader.subLineHeight,
            marginTop: pxToRem(feedHeader.subMarginTop),
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subline}
        </p>
      </div>

      {detailPanelOpen ? null : (
        <nav
          aria-label={t("events.a11y.tabList")}
          className="ml-auto flex bg-[hsl(var(--surface-secondary))]"
          data-testid="events-feed-tabs"
          style={{
            border: `${hairline()} solid hsl(var(--border)/${feedHeader.tabGroupBorderAlpha})`,
            borderRadius: pxToRem(feedHeader.tabGroupRadius),
            flex: "none",
            gap: pxToRem(feedHeader.tabGroupGap),
            padding: pxToRem(feedHeader.tabGroupPadding),
          }}
        >
          {EVENT_HEADER_TABS.map((tab) => {
            const selected = routeState.tab === tab.id;
            const pill = counts ? counts[tab.countKey] : 0;

            return (
              <Link
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex items-center whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  // Seçili sekmenin zemini satır içi geliyor; pasif sekmenin hover'ı sınıfla
                  // gelmeli, yoksa satır içi bir `background` `hover:` kuralını her zaman yener.
                  selected
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))]",
                )}
                data-nav="replace"
                data-testid={`events-feed-tab-${tab.id}`}
                href={tabHref(tab.id)}
                key={tab.id}
                replace
                scroll={false}
                style={{
                  borderRadius: pxToRem(feedHeader.tabRadius),
                  fontSize: pxToRem(feedHeader.tabFontSize),
                  fontWeight: feedHeader.tabWeight,
                  gap: pxToRem(feedHeader.tabGap),
                  height: pxToRem(feedHeader.tabHeight),
                  lineHeight: 1,
                  padding: `0 ${pxToRem(feedHeader.tabPaddingX)}`,
                }}
              >
                {t(`events.tabs.${tab.id}`)}
                {typeof pill === "number" && pill > 0 ? (
                  <span
                    className="grid place-items-center"
                    data-testid={`events-feed-tab-pill-${tab.id}`}
                    style={{
                      background: selected
                        ? `hsl(0 0% 100%/${feedHeader.tabPillActiveAlpha})`
                        : "hsl(var(--surface-soft))",
                      borderRadius: pxToRem(feedHeader.tabPillRadius),
                      color: selected ? "inherit" : "hsl(var(--text-muted))",
                      fontFamily: DISPLAY_FONT,
                      fontSize: pxToRem(feedHeader.tabPillFontSize),
                      fontWeight: feedHeader.tabPillWeight,
                      height: pxToRem(feedHeader.tabPillHeight),
                      lineHeight: 1,
                      minWidth: pxToRem(feedHeader.tabPillMinWidth),
                      padding: `0 ${pxToRem(feedHeader.tabPillPaddingX)}`,
                    }}
                  >
                    <span aria-hidden="true">{pill}</span>
                    {/* Çıplak rakam "Canlı 1" diye duyurulurdu; 1'in ne olduğu hiçbir yerde
                        yazmazdı. Nav paneli rozeti de aynı kalıbı kullanıyor. */}
                    <span className="sr-only">{t("events.sub.count", { count: pill })}</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      )}

      {detailPanelOpen ? null : (
        <div
          className="flex items-center text-[hsl(var(--text-muted))]"
          data-testid="events-feed-actions"
          style={{ flex: "none", gap: pxToRem(feedHeader.iconGroupGap) }}
        >
          {viewerCanCreate ? (
            <button
              aria-label={t("events.header.create")}
              className="grid place-items-center text-white transition-[filter] hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="events-feed-create"
              onClick={onOpenCreate}
              style={{
                ...iconButtonStyle,
                background: "hsl(var(--primary))",
                border: 0,
                boxShadow: `${pxToRem(feedHeader.createShadow.x)} ${pxToRem(
                  feedHeader.createShadow.y,
                )} ${pxToRem(feedHeader.createShadow.blur)} ${pxToRem(
                  feedHeader.createShadow.spread,
                )} hsl(var(--primary))`,
              }}
              title={t("events.header.create")}
              type="button"
            >
              <Plus
                aria-hidden="true"
                style={{
                  height: pxToRem(feedHeader.createIconSize),
                  width: pxToRem(feedHeader.createIconSize),
                }}
              />
            </button>
          ) : null}

          <button
            aria-label={t("events.card.sizeToggle")}
            aria-pressed={routeState.size === "large"}
            className="grid place-items-center bg-transparent text-inherit transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="events-feed-card-size"
            onClick={onToggleCardSize}
            style={{ ...iconButtonStyle, border: 0 }}
            title={t("events.card.sizeToggle")}
            type="button"
          >
            <LayoutGrid
              aria-hidden="true"
              style={{
                height: pxToRem(feedHeader.densityIconSize),
                width: pxToRem(feedHeader.densityIconSize),
              }}
            />
          </button>

          <button
            aria-label={t("events.notifications.toggle")}
            aria-pressed={notificationsEnabled}
            className={cn(
              "grid place-items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              notificationsEnabled
                ? undefined
                : "bg-transparent text-inherit hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
            )}
            data-testid="events-feed-bell"
            onClick={onToggleNotifications}
            style={{
              ...iconButtonStyle,
              border: 0,
              ...(notificationsEnabled
                ? {
                    background: `hsl(var(--primary)/${feedHeader.bellActiveAlpha})`,
                    color: "hsl(var(--primary))",
                  }
                : {}),
            }}
            title={t("events.notifications.toggle")}
            type="button"
          >
            <Bell
              aria-hidden="true"
              style={{
                height: pxToRem(feedHeader.bellIconSize),
                width: pxToRem(feedHeader.bellIconSize),
              }}
            />
          </button>
        </div>
      )}
    </header>
  );
}
