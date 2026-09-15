"use client";

import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, type LucideIcon } from "lucide-react";
import {
  BADGE_CATALOG,
  buildOwnBadgeEntries,
  groupBadgesByFamily,
  summarizeOwnBadges,
  type BadgeFamily,
  type OwnBadgeEntry,
  type OwnBadgesResponse,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { fetchOwnBadges, badgeQueryKeys, BADGE_QUERY_STALE_TIME_MS } from "@/lib/badges/client";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Rozet ızgarası (`r1`) — SPEC-AYARLAR §5.1, Ş7 §5.
 *
 * **Rozet açıklaması yok.** Kart yalnız adı çizer; `title` özniteliği de konmaz. Katalogda bir
 * açıklama alanı var ama bu yüzeyin metni "sonraki turda" gelecek (SPEC §5.1 notu) ve olmayan
 * bir metni doldurmak uydurmak olurdu.
 *
 * Sayaç **gerçek veriden** üretilir: `summarizeOwnBadges` on altı katalog kaydını sayar,
 * ekranda sabit bir `9 / 16` durmaz.
 *
 * Ağır blok: veri gelene kadar iskelet çizilir (PROMPT §8).
 */

const { badgeGrid } = SETTINGS_METRICS.blocks;

const FAMILY_LABEL_KEY: Readonly<Record<BadgeFamily, string>> = {
  activity: "settings.account.badges.family.activity",
  commerce: "settings.account.badges.family.commerce",
  contribution: "settings.account.badges.family.contribution",
  event: "settings.account.badges.family.event",
  identity: "settings.account.badges.family.identity",
};

export type OwnBadgesValue = {
  readonly data: OwnBadgesResponse | null;
  readonly failed: boolean;
};

const IDLE_BADGES: OwnBadgesValue = { data: null, failed: false };

const OwnBadgesContext = createContext<OwnBadgesValue>(IDLE_BADGES);

export function useOwnBadges(): OwnBadgesValue {
  return useContext(OwnBadgesContext);
}

export function useOwnBadgesState(): OwnBadgesValue {
  const query = useQuery({
    queryKey: badgeQueryKeys.own(),
    queryFn: fetchOwnBadges,
    staleTime: BADGE_QUERY_STALE_TIME_MS,
  });
  const data = query.data ?? null;
  const failed = query.isError && data === null;
  return useMemo(() => ({ data, failed }), [data, failed]);
}

export function OwnBadgesProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: OwnBadgesValue;
}) {
  return <OwnBadgesContext.Provider value={value}>{children}</OwnBadgesContext.Provider>;
}

/** Grup başlığındaki `9 / 16 rozet kazanıldı` — sayı katalogdan, metin sözlükten. */
export function badgeProgressText(
  data: OwnBadgesResponse | null,
  translate: (key: string, values?: Record<string, number | string>) => string,
): string {
  const summary = summarizeOwnBadges({ badges: data?.badges ?? [] });

  return translate("settings.data.badgeProgress", {
    earned: summary.earned,
    total: summary.total,
  });
}

/**
 * `settings` Ayarlar ekranının 34px karosu, `profile` SPEC-MESAJLAR §15.3.2'nin 26px
 * karosu (karar K10). Ayrılan yalnız karo geometrisi ve ikon; kabuk (radius 11,
 * padding `9 10`, 11.5/1.25 etiket, `--border/0.7` kenar) iki yüzeyde **aynı** —
 * zaten bu yüzden ikinci bir kart yazılmadı.
 */
export type BadgeCellVariant = "settings" | "profile";

const CELL_GEOMETRY: Readonly<
  Record<
    BadgeCellVariant,
    { glyphSize: number; surface: string; tileRadius: number; tileSize: number }
  >
> = Object.freeze({
  profile: {
    glyphSize: MESSAGES_METRICS.profilePanel.badgeIconSize,
    surface: "hsl(var(--surface-card))",
    tileRadius: MESSAGES_METRICS.profilePanel.badgeTileRadius,
    tileSize: MESSAGES_METRICS.profilePanel.badgeTileSize,
  },
  settings: {
    glyphSize: badgeGrid.starSize,
    surface: "hsl(var(--surface-base))",
    tileRadius: badgeGrid.iconRadius,
    tileSize: badgeGrid.iconSize,
  },
});

export type BadgeCellProps = {
  /**
   * Kazanım açıklaması. Ayarlar ekranı **vermez** (README notu, yukarıda); profil
   * paneli §15.3.2 gereği verir ve kart onu hem `title` hem `sr-only` olarak taşır —
   * `title` tek başına klavye ve ekran okuyucu kullanıcısına ulaşmaz (kural 6).
   *
   * Metin çağırandan gelir, katalogdan bu dosya **okumaz**: Ayarlar tarafının
   * "açıklama yok" sözü bir koruyucu testle kilitli ve kartın kendisi açıklamayı
   * bilirse o söz sessizce çözülür.
   */
  readonly description?: string | undefined;
  readonly entry: OwnBadgeEntry;
  /** Yalnız `profile`: rozetin kendi çizgi ikonu. Verilmezse yıldız çizilir. */
  readonly icon?: LucideIcon | undefined;
  readonly locale: "en" | "tr";
  readonly testId?: string | undefined;
  readonly variant?: BadgeCellVariant;
};

export function BadgeCell({
  description,
  entry,
  icon,
  locale,
  testId,
  variant = "settings",
}: BadgeCellProps) {
  const name = BADGE_CATALOG[entry.id].copy[locale].name;
  const geometry = CELL_GEOMETRY[variant];
  const Glyph = icon ?? Star;

  return (
    <div
      className="flex items-center"
      data-badge-earned={entry.earned || undefined}
      data-testid={testId ?? `settings-badge-${entry.id}`}
      style={{
        background: entry.earned ? geometry.surface : "transparent",
        border: `${hairline()} solid hsl(var(--border) / ${entry.earned ? 0.7 : 0.35})`,
        borderRadius: pxToRem(11),
        gap: pxToRem(9),
        padding: `${pxToRem(9)} ${pxToRem(10)}`,
      }}
      title={description}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center"
        style={{
          background: entry.earned ? "hsl(var(--primary) / 0.14)" : "hsl(var(--surface-soft))",
          borderRadius: pxToRem(geometry.tileRadius),
          color: entry.earned ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
          height: pxToRem(geometry.tileSize),
          width: pxToRem(geometry.tileSize),
        }}
      >
        <Glyph
          {...(icon ? {} : { fill: entry.earned ? "currentColor" : "none" })}
          style={{ height: pxToRem(geometry.glyphSize), width: pxToRem(geometry.glyphSize) }}
        />
      </span>
      {/* Ayarlar ekranında açıklama yok, `title` yok — README notu. */}
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          color: entry.earned ? "hsl(var(--foreground))" : "hsl(var(--text-muted))",
          fontSize: pxToRem(11.5),
          fontWeight: entry.earned ? 600 : 500,
          lineHeight: 1.25,
        }}
      >
        {name}
      </span>
      {description === undefined ? null : <span className="sr-only">{description}</span>}
    </div>
  );
}

export function BadgeGridBlock({ row: rowDef }: SettingsBlockProps) {
  const { locale, t } = useI18n();
  const { data, failed } = useOwnBadges();
  const entries = useMemo(() => (data === null ? [] : buildOwnBadgeEntries(data)), [data]);
  const groups = useMemo(() => groupBadgesByFamily(entries), [entries]);

  if (failed) {
    return (
      <p
        data-block="badges"
        data-testid={`settings-block-${rowDef.key}-error`}
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(11.5),
          lineHeight: 1.45,
          padding: `${pxToRem(14)} ${pxToRem(15)}`,
        }}
      >
        {t("settings.block.badges.error")}
      </p>
    );
  }

  if (data === null) {
    return (
      <div
        aria-busy="true"
        aria-label={t("settings.control.block.loading")}
        className="motion-safe:animate-pulse"
        data-block="badges"
        data-testid={`settings-block-${rowDef.key}-skeleton`}
        role="status"
        style={{
          background: `hsl(var(--surface-soft) / ${SETTINGS_METRICS.body.skeletonSurfaceAlpha})`,
          height: pxToRem(SETTINGS_METRICS.body.skeletonHeights[1] ?? 150),
        }}
      />
    );
  }

  return (
    <div
      data-block="badges"
      data-testid={`settings-block-${rowDef.key}`}
      style={{ padding: `${pxToRem(14)} ${pxToRem(15)}` }}
    >
      {groups.map((group) => (
        <section
          data-testid={`settings-badge-family-${group.family}`}
          key={group.family}
          style={{ marginBottom: pxToRem(13) }}
        >
          <h4 className="flex items-center" style={{ gap: pxToRem(8), paddingBottom: pxToRem(8) }}>
            <span
              style={{
                color: "hsl(var(--text-muted))",
                fontFamily: "var(--font-display)",
                fontSize: pxToRem(10),
                fontWeight: 600,
                letterSpacing: "0.13em",
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {t(FAMILY_LABEL_KEY[group.family])}
            </span>
            <span
              style={{
                color: "hsl(var(--text-muted) / 0.7)",
                fontFamily: "var(--font-display)",
                fontSize: pxToRem(10),
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {`${group.badges.filter((entry) => entry.earned).length}/${group.badges.length}`}
            </span>
            <span
              aria-hidden="true"
              className="flex-1"
              style={{ background: "hsl(var(--border) / 0.4)", height: hairline() }}
            />
          </h4>
          <div
            className="grid"
            style={{
              gap: pxToRem(6),
              gridTemplateColumns: `repeat(${badgeGrid.columns}, minmax(0, 1fr))`,
            }}
          >
            {group.badges.map((entry) => (
              <BadgeCell entry={entry} key={entry.id} locale={locale} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
