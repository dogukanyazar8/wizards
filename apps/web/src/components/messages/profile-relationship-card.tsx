"use client";

import React from "react";
import { CalendarDays } from "lucide-react";

import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";

/**
 * Tarih kartı — SPEC-MESAJLAR §15.3.3. Rozet ızgarasının **altında** durur; sırayı
 * `ProfileTabGeneral` kurar ve testi orada kilitlidir.
 *
 * İki kol, tek kart:
 *
 * - DM: `{tarih} tarihinden beri arkadaşsınız` + `{sunucu} üzerinden tanıştınız · {süre}`.
 *   Arkadaş değilse kart **hiç çizilmez** (karar K7) — yerine boş bir satır konmaz.
 *   Ortak sunucu yoksa ikinci cümle düşer, ilki kalır (karar K6).
 * - Grup: `{tarih} tarihinde kuruldu` + `Kurucu: {ad} · {süre}`.
 *
 * **Tarih burada biçimlenmez, biçimlendirilir.** `useAccountPreferenceRuntime().formatDate`
 * kullanıcının kendi `dateFormat` / `timeZone` / dil tercihini uygular; `14 Şubat 2025`
 * gibi sabit bir dize gömmek, tarih biçimini ayarlarından değiştirmiş birine yalan
 * söylemek olurdu.
 *
 * `now` bir **prop**: bileşenin içinde okunan saat testte dondurulamaz ve gece yarısını
 * geçen bir oturumda grup yaşı kendiliğinden bir ay atlardı (emsal:
 * `lib/messages/rail-presentation.ts`).
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfileRelationshipFacts =
  | {
      readonly kind: "friendship";
      /** Sunucu sayıyor — istemci ay sayısından cümleyi kurar (Ş1 sözleşmesi). */
      readonly durationMonths: number;
      readonly metViaServerName: string | null;
      readonly since: string;
    }
  | {
      readonly kind: "group";
      readonly createdAt: string;
      readonly ownerName: string | null;
    };

export type ProfileRelationshipCardProps = {
  /** `null` → kart çizilmez. DM'de "arkadaş değil" (K7) tam olarak budur. */
  readonly facts: ProfileRelationshipFacts | null;
  readonly failed?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly now?: Date | undefined;
};

/**
 * Tam ay farkı. Gün henüz gelmediyse ay sayılmaz: 1 Mart'ta kurulmuş bir grup
 * 30 Mart'ta "0 ay" değil, ay dolmadığı için hâlâ aynı aydadır.
 */
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const dayShort = to.getDate() < from.getDate();

  return Math.max(0, months - (dayShort ? 1 : 0));
}

/**
 * `1 yıl 6 ay` / `6 ay`.
 *
 * Türkçede sayıdan sonra çoğul eki **yoktur** (`1 yıl`, `2 yıl`), İngilizce karşılık da
 * kısaltmalı (`1y 6m`); yani iki anahtar iki *şekil* için vardır, çoğulluk için değil.
 * Tek dal `years === 0`: o zaman yalnız ay anahtarı kullanılır.
 */
export function formatRelationshipDuration(
  months: number,
  t: (key: string, values?: Record<string, number | string>) => string,
): string {
  const years = Math.floor(months / 12);

  return years > 0
    ? t("messages.profile.friendship.durationYears", { months: months % 12, years })
    : t("messages.profile.friendship.durationMonths", { months });
}

export function ProfileRelationshipCard({
  facts,
  failed = false,
  loading = false,
  now,
}: ProfileRelationshipCardProps) {
  const { t } = useI18n();
  const { formatDate } = useAccountPreferenceRuntime();

  if (failed) {
    return (
      <p
        className="text-[hsl(var(--text-muted))]"
        data-testid="profile-relationship-error"
        style={{ fontSize: pxToRem(profilePanel.dateCardSubtitleFontSize) }}
      >
        {t("messages.profile.error.load")}
      </p>
    );
  }

  if (loading) {
    return (
      <div data-testid="profile-relationship-skeleton">
        <Skeleton
          style={{
            borderRadius: pxToRem(profilePanel.dateCardRadius),
            // 32px karo + 12px dikey padding × 2.
            height: pxToRem(profilePanel.dateCardTileSize + profilePanel.dateCardPadding * 2),
          }}
        />
      </div>
    );
  }

  if (facts === null) {
    return null;
  }

  const title =
    facts.kind === "friendship"
      ? t("messages.profile.friendship.since", { date: formatDate(facts.since) })
      : t("messages.profile.group.created", { date: formatDate(facts.createdAt) });

  const subtitle =
    facts.kind === "friendship"
      ? facts.metViaServerName === null
        ? null
        : t("messages.profile.friendship.metVia", {
            duration: formatRelationshipDuration(facts.durationMonths, t),
            server: facts.metViaServerName,
          })
      : facts.ownerName === null
        ? null
        : t("messages.profile.group.owner", {
            duration: formatRelationshipDuration(
              monthsBetween(new Date(facts.createdAt), now ?? new Date()),
              t,
            ),
            name: facts.ownerName,
          });

  return (
    <div
      className="flex items-center bg-[hsl(var(--surface-card))]"
      data-testid="profile-relationship-card"
      style={{
        border: `${hairline()} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(profilePanel.dateCardRadius),
        gap: pxToRem(profilePanel.dateCardGap),
        padding: pxToRem(profilePanel.dateCardPadding),
      }}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
        style={{
          borderRadius: pxToRem(profilePanel.dateCardTileRadius),
          height: pxToRem(profilePanel.dateCardTileSize),
          width: pxToRem(profilePanel.dateCardTileSize),
        }}
      >
        <CalendarDays
          style={{
            height: pxToRem(profilePanel.dateCardIconSize),
            width: pxToRem(profilePanel.dateCardIconSize),
          }}
        />
      </span>

      <div className="min-w-0">
        <p
          className="text-[hsl(var(--foreground))]"
          data-testid="profile-relationship-title"
          style={{
            fontSize: pxToRem(profilePanel.dateCardTitleFontSize),
            fontWeight: 600,
            lineHeight: profilePanel.dateCardTitleLineHeight,
          }}
        >
          {title}
        </p>
        {subtitle === null ? null : (
          <p
            className="text-[hsl(var(--text-muted))]"
            data-testid="profile-relationship-subtitle"
            style={{
              fontSize: pxToRem(profilePanel.dateCardSubtitleFontSize),
              marginTop: pxToRem(profilePanel.dateCardSubtitleMarginTop),
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
