"use client";

import Link from "next/link";
import React from "react";
import { ListFilter, Settings } from "lucide-react";
import type { MentionCounts } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { MENTION_TABS, readMentionTabCount } from "@/lib/mentions/contracts";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import {
  buildMentionsHref,
  toggleMentionFilter,
  type MentionsRouteState,
} from "@/lib/mentions/routes";
import { cn } from "@/lib/utils";

/**
 * Akış başlığı — SPEC §4.
 *
 * Başlık **saf sunumdur**: sorgu açmaz, mutasyon çağırmaz, sayı toplamaz. Dört sekme pili, ray
 * pilleri ve gezinme paneli rozeti tek bir `MentionCounts` nesnesinden okunur; ikinci bir
 * toplama iki yüzeyi er geç ayrıştırırdı (PROMPT §3).
 *
 * Sekmeler `<button>` değil `<Link>`: filtre URL'de duruyor ve gerçek bir `href` paylaşılabilir
 * adresi, orta tıkla yeni sekmeyi ve geri tuşunu bedavaya getirir. Ray satırları da (Ş1) aynı
 * kararı taşıyor.
 */

const { feedHeader } = MENTIONS_METRICS;

export type MentionsFeedHeaderProps = {
  /**
   * SPEC §4 sonu — bağlam paneli açıkken iki ikon butonu **DOM'dan kalkar**. `display:none`
   * ile gizlemek onları odak sırasında bırakırdı: 456px'lik akışta göremediğin bir butona
   * Tab ile varmak, ekranın kaybolduğu izlenimi verir.
   */
  readonly contextPanelOpen: boolean;
  /** Başlık pilinin sayısı; sayaç ucu düştüğünde `null` ve pil çizilmez. */
  readonly count: number | null;
  /** Akışta hiç kart yok — pil `Hepsi okundu`, alt satır `Son 30 gün · …` olur. */
  readonly empty: boolean;
  /** İzleyicinin saat biçimi (`UserSettings.timeFormat`) uygulanmış biçimleyici. */
  readonly formatTime: (input: string) => string;
  /** Akıştaki en yeni bahsetmenin damgası. */
  readonly newestAt: string | null;
  readonly routeState: MentionsRouteState;
  /** Başlık metni: `Bahsedilmeler` ya da seçili kaynağın adı. */
  readonly title: string;
  readonly counts: MentionCounts | null;
};

export function MentionsFeedHeader({
  contextPanelOpen,
  count,
  counts,
  empty,
  formatTime,
  newestAt,
  routeState,
  title,
}: MentionsFeedHeaderProps) {
  const { t } = useI18n();

  /**
   * Alt satırın **üç** hâli var ve üçü de ayrı bir gerçeği anlatıyor.
   *
   * `empty` "akışta kart yok" demek değil, "istek bitti ve sonuç boş" demek: ilk yüklemede ve
   * hata hâlinde `false` kalır. O iki durumda `newestAt` de `null`dur.
   *
   *   1. `empty` → pencereye göre "bekleyen bahsetme yok". `?window=all` iken sabit "Son 30 gün"
   *      yazmak, kullanıcının tam da o pencereyi kaldırmak için bastığı butondan sonra ekranı
   *      yanlış etiketlemek olurdu.
   *   2. damga var → SPEC §4'ün cümlesi.
   *   3. damga yok ama `empty` de değil (yükleniyor / hata) → **hiçbir şey yazılmaz.** Şablon
   *      `… · en yenisi ` diye sarkardı; "bekleyen bahsetme yok" demek ise daha kötüsü, çünkü
   *      sayaç ayrı bir istekten geliyor ve yanındaki pil aynı anda "7 bahsetme" diyebilir.
   *      Kutu yerinde kalır, iddia edilmeyen bir şey yazılmaz.
   */
  const subtitle = empty
    ? t(
        routeState.window === "all"
          ? "mentions.header.subtitleEmptyAll"
          : "mentions.header.subtitleEmpty",
      )
    : newestAt
      ? t(
          routeState.grouping === "source"
            ? "mentions.header.subtitleSource"
            : "mentions.header.subtitleTime",
          { time: formatTime(newestAt), unread: counts?.unread ?? 0 },
        )
      : "";

  /**
   * Sekme adresi. `panel` ve `modal` bilerek düşer — Ş1'in ray satırlarıyla aynı karar:
   * yeni süzgeç panelin dayandığı bahsetmeyi listeden çıkarabilir ve dayanağı olmayan bir
   * kolon açık kalırdı.
   */
  const tabHref = (filter: MentionsRouteState["filter"]) =>
    buildMentionsHref({
      filter: toggleMentionFilter(routeState.filter, filter),
      grouping: routeState.grouping,
      query: routeState.query,
      source: routeState.source,
      window: routeState.window,
    });

  return (
    <header
      className="flex flex-wrap items-center bg-[hsl(var(--surface-base))]"
      data-testid="mentions-feed-header"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
        gap: `${pxToRem(feedHeader.gapY)} ${pxToRem(feedHeader.gapX)}`,
        padding: `${pxToRem(feedHeader.paddingY)} ${pxToRem(feedHeader.paddingX)}`,
      }}
    >
      <div className="min-w-0" style={{ flex: "1 1 12.5rem" }}>
        <div className="flex items-center" style={{ gap: pxToRem(feedHeader.titleBlockGap) }}>
          <h1
            className={cn("min-w-0 truncate text-[hsl(var(--foreground))]", DISPLAY_FONT)}
            data-testid="mentions-feed-title"
            style={{
              fontSize: pxToRem(feedHeader.titleFontSize),
              fontWeight: feedHeader.titleWeight,
              letterSpacing: "-0.02em",
              lineHeight: feedHeader.titleLineHeight,
            }}
          >
            {title}
          </h1>
          {empty || count !== null ? (
            <span
              className="shrink-0 bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]"
              data-testid="mentions-feed-count"
              style={{
                borderRadius: pxToRem(feedHeader.countPillRadius),
                fontSize: pxToRem(feedHeader.countPillFontSize),
                fontWeight: feedHeader.countPillWeight,
                lineHeight: 1,
                padding: `${pxToRem(feedHeader.countPillPaddingY)} ${pxToRem(
                  feedHeader.countPillPaddingX,
                )}`,
              }}
            >
              {empty
                ? t("mentions.header.allRead")
                : t("mentions.header.countPill", { count: count ?? 0 })}
            </span>
          ) : null}
        </div>
        <p
          className="m-0 text-[hsl(var(--text-muted))]"
          data-testid="mentions-feed-subtitle"
          style={{
            fontSize: pxToRem(feedHeader.subtitleFontSize),
            fontWeight: feedHeader.subtitleWeight,
            lineHeight: 1,
            marginTop: pxToRem(feedHeader.subtitleMarginTop),
          }}
        >
          {subtitle}
        </p>
      </div>

      <nav
        // Rayın kendi yer imi de `Bahsedilmeler` adını taşıyor; aynı adı ikinci bir yer imine
        // vermek ekran okuyucuda iki özdeş girdi demek.
        aria-label={t("mentions.a11y.tabsLabel")}
        className="ml-auto flex shrink-0 bg-[hsl(var(--surface-secondary))]"
        data-testid="mentions-feed-tabs"
        style={{
          border: `${hairline()} solid hsl(var(--border)/0.55)`,
          borderRadius: pxToRem(feedHeader.segmentRadius),
          gap: pxToRem(feedHeader.segmentGap),
          padding: pxToRem(feedHeader.segmentPadding),
        }}
      >
        {MENTION_TABS.map((tab) => {
          const selected = routeState.filter === tab.filter;
          const tabCount = counts ? readMentionTabCount(counts, tab.id) : null;

          return (
            <Link
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex items-center whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                // Seçili sekmenin zemini satır içi gelir; pasif sekmenin hover'ı sınıfla
                // gelmeli, yoksa satır içi bir `background` `hover:` kuralını her zaman yener.
                selected
                  ? "bg-[hsl(var(--primary))] text-white"
                  : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))]",
              )}
              data-testid={`mentions-feed-tab-${tab.id}`}
              href={tabHref(tab.filter)}
              key={tab.id}
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
              {t(`mentions.tabs.${tab.id}`)}
              {tabCount !== null && tabCount > 0 ? (
                <span
                  className={cn("grid place-items-center", DISPLAY_FONT)}
                  data-testid={`mentions-feed-tab-pill-${tab.id}`}
                  style={{
                    background: selected
                      ? `hsl(0 0% 100%/${feedHeader.tabPillActiveAlpha})`
                      : "hsl(var(--surface-soft))",
                    borderRadius: pxToRem(feedHeader.tabPillRadius),
                    color: selected ? "inherit" : "hsl(var(--text-muted))",
                    fontSize: pxToRem(feedHeader.tabPillFontSize),
                    fontWeight: feedHeader.tabPillWeight,
                    height: pxToRem(feedHeader.tabPillHeight),
                    lineHeight: 1,
                    minWidth: pxToRem(feedHeader.tabPillMinWidth),
                    padding: `0 ${pxToRem(feedHeader.tabPillPaddingX)}`,
                  }}
                >
                  <span aria-hidden="true">{tabCount}</span>
                  {/* Cıplak rakam "Rol · @herkes 3, baglanti" diye duyurulurdu; 3'un ne oldugu
                      hicbir yerde yazmazdi. Ray rozeti de ayni kalibi kullaniyor. */}
                  <span className="sr-only">
                    {t("mentions.header.countPill", { count: tabCount })}
                  </span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {contextPanelOpen ? null : (
        <div
          className="flex shrink-0 items-center text-[hsl(var(--text-muted))]"
          data-testid="mentions-feed-header-actions"
          style={{ gap: pxToRem(feedHeader.iconGroupGap) }}
        >
          <Link
            aria-label={t("mentions.header.grouping")}
            className="grid place-items-center transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="mentions-feed-grouping"
            href={buildMentionsHref({
              ...routeState,
              grouping: routeState.grouping === "time" ? "source" : "time",
            })}
            scroll={false}
            style={{
              borderRadius: pxToRem(feedHeader.iconButtonRadius),
              height: pxToRem(feedHeader.iconButtonSize),
              width: pxToRem(feedHeader.iconButtonSize),
            }}
            title={t("mentions.header.grouping")}
          >
            <ListFilter
              aria-hidden="true"
              style={{
                height: pxToRem(feedHeader.iconSize),
                width: pxToRem(feedHeader.iconSize),
              }}
            />
          </Link>
          <Link
            aria-expanded={routeState.settingsOpen}
            aria-label={t("mentions.header.notifications")}
            className={cn(
              "grid place-items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              routeState.settingsOpen
                ? undefined
                : "hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
            )}
            data-testid="mentions-feed-settings"
            href={buildMentionsHref({ ...routeState, settingsOpen: !routeState.settingsOpen })}
            scroll={false}
            style={{
              ...(routeState.settingsOpen
                ? { background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))" }
                : {}),
              borderRadius: pxToRem(feedHeader.iconButtonRadius),
              height: pxToRem(feedHeader.iconButtonSize),
              width: pxToRem(feedHeader.iconButtonSize),
            }}
            title={t("mentions.header.notifications")}
          >
            <Settings
              aria-hidden="true"
              style={{
                height: pxToRem(feedHeader.iconSize),
                width: pxToRem(feedHeader.iconSize),
              }}
            />
          </Link>
        </div>
      )}
    </header>
  );
}
