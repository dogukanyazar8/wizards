"use client";

import React, { useRef } from "react";
import { FRIENDS_TABS, type FriendsTab } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Arkadaşlar sekmeleri — SPEC §4, karar #8.
 *
 * Dört sekme. `Çevrimiçi` **yok**: çevrimiçi/çevrimdışı artık `Tümü` içinde iki
 * bölüm, ve beşinci bir sekme aynı kişileri ikinci kez listelerdi.
 *
 * Gerçek `tablist`: ok tuşları sekmeler arasında gezer, `Home`/`End` uçlara
 * gider ve yalnız seçili sekme sekme turunda durur (roving tabindex). Dört ayrı
 * durak, klavye kullanıcısını sekme grubunda dört kez durdururdu.
 */

const { friends } = MESSAGES_METRICS;

const TAB_LABEL_KEY: Readonly<Record<FriendsTab, string>> = Object.freeze({
  add: "messages.friends.tabs.add",
  all: "messages.friends.tabs.all",
  blocked: "messages.friends.tabs.blocked",
  pending: "messages.friends.tabs.pending",
});

export type FriendsTabsProps = {
  active: FriendsTab;
  onChange: (tab: FriendsTab) => void;
  /** `Bekleyen` sekmesindeki sayaç; sıfırsa çizilmez. */
  pendingCount: number;
};

export function FriendsTabs({ active, onChange, pendingCount }: FriendsTabsProps) {
  const { t } = useI18n();
  const refs = useRef(new Map<FriendsTab, HTMLButtonElement>());

  const focusTab = (tab: FriendsTab) => {
    onChange(tab);
    // Odak da taşınır: `aria-selected` değişip focus eski sekmede kalırsa,
    // ekran okuyucu seçili olmayan bir sekmeyi okumaya devam eder.
    refs.current.get(tab)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = FRIENDS_TABS.length - 1;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = (index + step + FRIENDS_TABS.length) % FRIENDS_TABS.length;
      focusTab(FRIENDS_TABS[next]!);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusTab(FRIENDS_TABS[0]!);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusTab(FRIENDS_TABS[last]!);
    }
  };

  return (
    <div
      aria-label={t("messages.friends.title")}
      className="flex shrink-0 items-center bg-[hsl(var(--surface-secondary))]"
      data-testid="friends-tabs"
      role="tablist"
      style={{
        border: `${hairline()} solid hsl(var(--border)/0.55)`,
        borderRadius: pxToRem(friends.tabsRadius),
        gap: pxToRem(friends.tabsGap),
        padding: pxToRem(friends.tabsPadding),
      }}
    >
      {FRIENDS_TABS.map((tab, index) => {
        const selected = tab === active;

        return (
          <button
            aria-controls={`friends-panel-${tab}`}
            aria-selected={selected}
            className={cn(
              "flex items-center whitespace-nowrap transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              selected
                ? "bg-[hsl(var(--primary))] text-white"
                : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]",
            )}
            data-testid={`friends-tab-${tab}`}
            id={`friends-tab-${tab}`}
            key={tab}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              if (node) {
                refs.current.set(tab, node);
              } else {
                refs.current.delete(tab);
              }
            }}
            role="tab"
            style={{
              borderRadius: pxToRem(friends.tabRadius),
              fontSize: pxToRem(friends.tabFontSize),
              fontWeight: 600,
              gap: pxToRem(friends.tabGap),
              height: pxToRem(friends.tabHeight),
              padding: `0 ${pxToRem(friends.tabPaddingX)}`,
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {t(TAB_LABEL_KEY[tab])}
            {tab === "pending" && pendingCount > 0 ? (
              <span
                className={cn(
                  "grid place-items-center bg-[hsl(var(--danger))] text-white",
                  DISPLAY_FONT,
                )}
                data-testid="friends-tab-pending-count"
                style={{
                  borderRadius: pxToRem(friends.tabCountRadius),
                  fontSize: pxToRem(friends.tabCountFontSize),
                  fontWeight: 600,
                  height: pxToRem(friends.tabCountHeight),
                  minWidth: pxToRem(friends.tabCountMinWidth),
                  padding: `0 ${pxToRem(friends.tabCountPaddingX)}`,
                }}
              >
                {pendingCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
