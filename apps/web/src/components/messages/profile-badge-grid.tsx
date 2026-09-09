"use client";

import React, { useMemo } from "react";
import {
  BADGE_CATALOG,
  buildOwnBadgeEntries,
  summarizeOwnBadges,
  type EarnedBadge,
} from "@wizards/types";

import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { BadgeCell } from "@/components/settings/blocks/badge-grid-block";
import { BADGE_LUCIDE_ICON } from "@/components/shared/profile-badge-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * `ROZETLER {kazanılan} / {toplam}` — SPEC-MESAJLAR §15.3.2, yalnız DM kolunda.
 *
 * **Kart burada yazılmıyor** (karar K10). Ayarlar ekranının rozet kartı zaten
 * bu kartın ta kendisi — radius 11, padding `9 10`, `--border/0.7` kenar,
 * 600 11.5/1.25 etiket — ve aralarındaki tek fark 34px karonun 26px olması ile
 * rozetin kendi çizgi ikonunu taşıması. İkisi de o bileşene birer varyant
 * olarak eklendi; burada kalan yalnız **ızgara**: kaç kolon, hangi boşluk, hangi
 * sayaç.
 *
 * Payda `BADGE_IDS.length` üzerinden okunur (`summarizeOwnBadges`), `16` sabiti
 * yazılmaz: katalog büyüdüğünde metin kendiliğinden doğru kalır (tuzak 11).
 *
 * Profilde **yalnız kazanılanlar** listelenir. Ayarlar ekranı on altı satırın
 * hepsini çizer çünkü orada kilitli rozet bir hedeftir; başkasının profilinde
 * kilitli rozet, o kişinin yapmadığı şeylerin listesidir.
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfileBadgeGridProps = {
  readonly badges: readonly EarnedBadge[];
  /** Sorgu düştü: bölüm tek satır muted metne iner, panelin kalanı çizilmeye devam eder. */
  readonly failed?: boolean | undefined;
  readonly loading?: boolean | undefined;
};

/** İskelet kart sayısı — bir tam satır artı biri, ızgaranın iki kolonlu olduğu görünsün diye. */
const SKELETON_CELLS = 4;

function BadgeGridFrame({
  children,
  count,
  label,
}: {
  readonly children: React.ReactNode;
  readonly count?: string | undefined;
  readonly label: string;
}) {
  return (
    <section data-testid="profile-badges">
      <ProfileSectionLabel count={count}>{label}</ProfileSectionLabel>
      <div
        className="grid"
        style={{
          gap: pxToRem(profilePanel.badgeGap),
          gridTemplateColumns: `repeat(${profilePanel.badgeColumns}, minmax(0, 1fr))`,
          marginTop: pxToRem(profilePanel.sectionContentMarginTop),
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function ProfileBadgeGrid({
  badges,
  failed = false,
  loading = false,
}: ProfileBadgeGridProps) {
  const { locale, t } = useI18n();

  /**
   * `buildOwnBadgeEntries` katalog sırasında on altı satır döndürür; kazanılanı
   * süzmek hem `BadgeCell`'in beklediği satır tipini verir hem de sırayı
   * SPEC §15.3.2'nin altı örneğiyle aynı yapar (katalog sırası = SPEC sırası).
   */
  const entries = useMemo(
    () => buildOwnBadgeEntries({ badges: [...badges], progress: [] }).filter((row) => row.earned),
    [badges],
  );

  if (failed) {
    return (
      <p
        className="text-[hsl(var(--text-muted))]"
        data-testid="profile-badges-error"
        style={{ fontSize: pxToRem(profilePanel.dateCardSubtitleFontSize) }}
      >
        {t("messages.profile.error.load")}
      </p>
    );
  }

  if (loading) {
    return (
      <BadgeGridFrame label={t("messages.profile.section.badges")}>
        {Array.from({ length: SKELETON_CELLS }, (_, index) => (
          <Skeleton
            className="rounded-xl"
            key={index}
            style={{
              // Kart yüksekliği: 26px karo + 9px dikey padding × 2.
              height: pxToRem(profilePanel.badgeTileSize + profilePanel.badgeCardPaddingY * 2),
            }}
          />
        ))}
      </BadgeGridFrame>
    );
  }

  // Boş bölüm hiç çizilmez — `ROZETLER 0 / 16` başlığı altında boşluk bırakmaz.
  if (entries.length === 0) {
    return null;
  }

  const summary = summarizeOwnBadges({ badges: [...badges] });

  return (
    <BadgeGridFrame
      count={t("messages.profile.badgeCount", { earned: summary.earned, total: summary.total })}
      label={t("messages.profile.section.badges")}
    >
      {entries.map((entry) => (
        <BadgeCell
          description={BADGE_CATALOG[entry.id].copy[locale].description}
          entry={entry}
          icon={BADGE_LUCIDE_ICON[entry.id]}
          key={entry.id}
          locale={locale}
          testId={`profile-badge-${entry.id}`}
          variant="profile"
        />
      ))}
    </BadgeGridFrame>
  );
}
