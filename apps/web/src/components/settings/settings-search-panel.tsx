"use client";

import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";
import { buildSettingsSearchPath, searchSettings } from "@/lib/settings/search";
import { buildSettingsSearchIndex, type SettingsSearchEntry } from "@/lib/settings/search-index";
import { cn } from "@/lib/utils";

const { body } = SETTINGS_METRICS;

export type SettingsSearchPanelProps = {
  readonly onSelect: (target: {
    rowKey: string;
    section: SettingsSection;
    tab: SettingsTab;
  }) => void;
  /** Debounce edilmiş sorgu; kutunun ham taslağı değil (Ş5 §9). */
  readonly query: string;
};

/**
 * Arama görünümü — SPEC §4.6, Ş5 §9.
 *
 * Arama doluyken içeriğin **yerine** geçer, yanına değil: 169 satırın altına asılı bir sonuç
 * listesi kullanıcıyı iki listeyi birden okumaya zorlardı.
 *
 * İndeks `SETTINGS_TREE`'den üretilir, sabit bir isabet dizisinden değil (sapma #7) — referansın
 * `SET_HITS` dizisi var olmayan bir sekmeye işaret ediyordu. Eşleme `lib/settings/search.ts`'te;
 * burada yalnız çizim var.
 *
 * İndeks çeviriye bağlıdır (`t`), o yüzden dil değişince yeniden kurulur; sorgu değişince
 * **kurulmaz**.
 */
export function SettingsSearchPanel({ onSelect, query }: SettingsSearchPanelProps) {
  const { t } = useI18n();
  const index = useMemo(() => buildSettingsSearchIndex(t), [t]);
  const hits = useMemo(() => searchSettings(index, query), [index, query]);

  return (
    <div data-testid="settings-search-panel">
      <p
        className={cn("uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
        style={{
          fontSize: pxToRem(body.searchHeaderFontSize),
          fontWeight: body.groupTitleWeight,
          letterSpacing: `${body.searchHeaderTracking}em`,
          paddingBottom: pxToRem(body.searchHeaderPaddingBottom),
        }}
      >
        {`${t("settings.searchResults")} · ${hits.length}`}
      </p>

      <div
        style={{
          background: "hsl(var(--surface-card))",
          border: `${hairline()} solid hsl(var(--border)/${body.groupBorderAlpha})`,
          borderRadius: pxToRem(body.groupRadius),
        }}
      >
        {hits.map((hit, index2) => (
          <SettingsSearchHit
            entry={hit}
            key={hit.rowKey}
            onSelect={onSelect}
            separated={index2 > 0}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsSearchHit({
  entry,
  onSelect,
  separated,
}: {
  entry: SettingsSearchEntry;
  onSelect: SettingsSearchPanelProps["onSelect"];
  separated: boolean;
}) {
  const { t } = useI18n();

  return (
    <button
      className="flex w-full items-center text-left transition-colors hover:bg-[hsl(var(--surface-soft)/0.45)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-row-key={entry.rowKey}
      data-testid="settings-search-hit"
      onClick={() => onSelect({ rowKey: entry.rowKey, section: entry.section, tab: entry.tab })}
      style={{
        borderTop: separated
          ? `${hairline()} solid hsl(var(--border)/${SETTINGS_METRICS.row.dividerAlpha})`
          : undefined,
        gap: pxToRem(body.searchHitGap),
        padding: `${pxToRem(body.searchHitPaddingY)} ${pxToRem(body.searchHitPaddingX)}`,
      }}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(body.searchHitTitleFontSize),
            fontWeight: SETTINGS_METRICS.row.titleWeight,
            lineHeight: body.searchHitTitleLineHeight,
          }}
        >
          {t(entry.titleKey)}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(body.searchHitPathFontSize),
            lineHeight: body.searchHitPathLineHeight,
            marginTop: pxToRem(body.searchHitPathMarginTop),
          }}
        >
          {buildSettingsSearchPath(entry, t)}
        </span>
      </span>

      <ChevronRight
        aria-hidden="true"
        className="shrink-0 text-[hsl(var(--text-muted))]"
        style={{
          height: pxToEm(body.searchHitChevronSize, body.searchHitTitleFontSize),
          width: pxToEm(body.searchHitChevronSize, body.searchHitTitleFontSize),
        }}
      />
    </button>
  );
}
