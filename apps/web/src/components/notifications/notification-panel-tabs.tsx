"use client";

// Varsayılan içe aktarım node test koşucusunun klasik JSX dönüşümünün çözdüğü referanstır;
// Next'in derleyicisi buna ihtiyaç duymaz.
import React, { useRef } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  NOTIF_PANEL_TABS,
  hasVisibleNotifCount,
  nextNotifPanelTab,
  selectNotifTabCount,
} from "@/lib/notifications/panel-state";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import type { NotifPanelTab, NotifUnreadCounts } from "@wizards/types";

/**
 * Bildirimler paneli — SPEC §1 sekme şeridi (Ş11 §A.3).
 *
 * Sayılar **yalnız okunmamışı** sayar ve sunucudan gelir; istemci hiçbir yerde artırmaz. İki
 * sekme açıkken artırma kaçınılmaz olarak ayrışır (00 tuzak, Ş2 §6).
 *
 * `role="tablist"` gerçek bir sekme şerididir: `←/→` gezinir, yalnız seçili sekme sekme
 * turundadır (roving tabindex). Dört düğmeyi de sekme turunda bırakmak, klavye kullanıcısını
 * listeye varmadan önce dört kez `Tab`'a bastırırdı.
 *
 * Sayacı olmayan sekmede pil **çizilmez** — kırmızı `0` pili kabul kriteriyle yasak ve karar
 * `hasVisibleNotifCount` içinde tek yerde duruyor.
 */

const { tabs } = SETTINGS_METRICS.panel;

const TAB_LABEL_KEY: Readonly<Record<NotifPanelTab, string>> = {
  all: "notif.panel.tabs.all",
  mentions: "notif.panel.tabs.mentions",
  replies: "notif.panel.tabs.replies",
  system: "notif.panel.tabs.system",
};

/** İçerik alanı hangi sekmenin paneli olduğunu `aria-labelledby` ile söyler; kimlik tek yerde. */
export function notificationPanelTabId(panelId: string, tab: NotifPanelTab): string {
  return `${panelId}-tab-${tab}`;
}

export type NotificationPanelTabsProps = {
  readonly counts: NotifUnreadCounts;
  readonly onSelect: (tab: NotifPanelTab) => void;
  readonly panelId: string;
  readonly tab: NotifPanelTab;
};

export function NotificationPanelTabs({
  counts,
  onSelect,
  panelId,
  tab,
}: NotificationPanelTabsProps) {
  const { t } = useI18n();
  const stripRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : null;

    if (direction === null) return;

    event.preventDefault();
    const next = nextNotifPanelTab(tab, direction);
    onSelect(next);
    // Odak seçimi izler: `aria-selected` değişip odak eski sekmede kalsaydı ekran okuyucu
    // kullanıcısı hangi sekmede olduğunu duyamazdı.
    stripRef.current?.querySelector<HTMLElement>(`[data-notif-tab="${next}"]`)?.focus();
  };

  return (
    <div
      aria-label={t("notif.panel.title")}
      className="flex shrink-0 border-b border-solid"
      data-testid="notification-panel-tabs"
      onKeyDown={handleKeyDown}
      ref={stripRef}
      role="tablist"
      style={{
        borderBottomColor: `hsl(var(--border) / ${tabs.borderBottomAlpha})`,
        borderBottomWidth: hairline(),
        gap: pxToRem(tabs.gap),
        padding: `${pxToRem(tabs.paddingY)} ${pxToRem(tabs.paddingX)}`,
      }}
    >
      {NOTIF_PANEL_TABS.map((entry) => {
        const active = entry === tab;
        const count = selectNotifTabCount(counts, entry);

        return (
          <button
            aria-controls={panelId}
            aria-selected={active}
            className="inline-flex items-center whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-notif-tab={entry}
            data-testid={`notification-panel-tab-${entry}`}
            id={notificationPanelTabId(panelId, entry)}
            key={entry}
            onClick={() => onSelect(entry)}
            role="tab"
            style={{
              background: active ? "hsl(var(--primary))" : "transparent",
              borderRadius: pxToRem(tabs.tabRadius),
              // Ters metin: tasarımda primary zeminin üstünde beyaz (kalite çıtasının tek
              // `#fff` istisnası).
              color: active ? "#fff" : "hsl(var(--text-secondary))",
              fontSize: pxToRem(tabs.tabFontSize),
              fontWeight: tabs.tabWeight,
              gap: pxToRem(tabs.tabGap),
              height: pxToRem(tabs.tabHeight),
              padding: `0 ${pxToRem(tabs.tabPaddingX)}`,
              transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
            }}
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {t(TAB_LABEL_KEY[entry])}
            {hasVisibleNotifCount(count) ? (
              <span
                className="font-display grid place-items-center"
                data-testid={`notification-panel-tab-count-${entry}`}
                style={{
                  background: active
                    ? `hsl(0 0% 100% / ${tabs.activePillAlpha})`
                    : "hsl(var(--surface-soft))",
                  borderRadius: pxToRem(tabs.pillRadius),
                  color: active ? "#fff" : "hsl(var(--text-muted))",
                  fontSize: pxToRem(tabs.pillFontSize),
                  fontWeight: tabs.tabWeight,
                  height: pxToRem(tabs.pillHeight),
                  minWidth: pxToRem(tabs.pillMinWidth),
                  padding: `0 ${pxToRem(tabs.pillPaddingX)}`,
                }}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
