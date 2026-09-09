"use client";

import React, { useCallback, useRef } from "react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import type { SettingsTab } from "@/lib/settings/navigation";
import type { SettingsTabDef } from "@/lib/settings/tree";
import { cn } from "@/lib/utils";

const { tabs: metrics } = SETTINGS_METRICS;

export type SettingsTabStripProps = {
  readonly activeTab: SettingsTab;
  readonly onSelect: (tab: SettingsTab) => void;
  readonly tabs: readonly SettingsTabDef[];
};

/**
 * Alt sekme şeridi — SPEC §4.3, Ş5 §5.
 *
 * **Bölüm tek sekmeliyse şerit render edilmez** (Hakkında): tek seçenekli bir sekme şeridi
 * seçim sunmaz, yalnız 38 px yer kaplar ve `role="tablist"` ile boş bir vaat verir.
 *
 * `←/→` gezinir, `Home`/`End` uçlara gider. Ok tuşu odağı **taşır ve seçer**: sekme şeridi
 * otomatik etkinleşen bir tablist'tir; ok tuşuyla gezerken içerik de değişir, aksi hâlde
 * klavye kullanıcısı her sekme için ayrıca `Enter`'a basmak zorunda kalırdı.
 */
export function SettingsTabStrip({ activeTab, onSelect, tabs }: SettingsTabStripProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement | null>(null);

  const focusTab = useCallback((index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = tabs.findIndex((tab) => tab.key === activeTab);

      if (current === -1) return;

      const last = tabs.length - 1;
      const next =
        event.key === "ArrowRight"
          ? (current + 1) % tabs.length
          : event.key === "ArrowLeft"
            ? (current + last) % tabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : -1;

      if (next === -1) return;

      event.preventDefault();
      const target = tabs[next];

      if (target) {
        onSelect(target.key);
        focusTab(next);
      }
    },
    [activeTab, focusTab, onSelect, tabs],
  );

  if (tabs.length <= 1) {
    return null;
  }

  return (
    <div
      className="settings-window-tabs flex shrink-0 items-center"
      data-testid="settings-tab-strip"
      onKeyDown={handleKeyDown}
      ref={listRef}
      role="tablist"
      style={{
        background: "hsl(var(--surface-card))",
        borderBottom: `${hairline()} solid hsl(var(--border)/${metrics.borderBottomAlpha})`,
        gap: pxToRem(metrics.gap),
        padding: `0 ${pxToRem(metrics.paddingX)}`,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeTab;

        return (
          <button
            aria-selected={active}
            className={cn(
              "settings-window-tab relative inline-flex items-center whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
              DISPLAY_FONT,
            )}
            data-active={active ? "true" : undefined}
            id={`settings-tab-${tab.key}`}
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            role="tab"
            style={{
              color: active ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
              fontSize: pxToRem(metrics.tabFontSize),
              fontWeight: active ? metrics.tabActiveWeight : metrics.tabWeight,
              height: pxToRem(metrics.tabHeight),
              padding: `0 ${pxToRem(metrics.tabPaddingX)}`,
            }}
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {t(tab.labelKey)}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0"
                style={{
                  background: "hsl(var(--primary))",
                  borderRadius: `${pxToRem(metrics.barRadiusTop)} ${pxToRem(metrics.barRadiusTop)} 0 0`,
                  height: pxToRem(metrics.barHeight),
                  marginInline: pxToRem(metrics.barInset),
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
