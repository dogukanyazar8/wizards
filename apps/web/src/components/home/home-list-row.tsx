"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToRem } from "@/lib/home/metrics";
import { formatRelativeTime, resolveHomeCopy } from "@/lib/home/presentation";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import { cn } from "@/lib/utils";

import { HomeAvatar, PresenceDot } from "./home-primitives";

/**
 * "YANIT BEKLİYOR" satırı — SPEC §3.3, `05-faz4` §4.3, `07-faz6` §2.1/§4.1.
 *
 * **Tek dosya, üç yüzey.** Ana Sayfa'nın kartı, Gelen kutusu ve Bahsedilmeler
 * aynı satırı çizer; ikinci bir satır bileşeni yok (07 §9). Yan ekranlar
 * `variant="full"` verir — bu satırı yeniden düzenlemez, yalnız alıntı satırının
 * iki satıra kadar sarmasına izin verir. Kutunun kendisi (dolgu, yarıçap, avatar,
 * boşluk) her üç yerde de `awaitingCard` ölçüleridir; yan ekranların kendi
 * ölçüsü yoktur, çünkü kendi tasarımı da yoktur.
 *
 * Erişilebilirlik kararı: **satır `a`, aksiyon butonu kardeş öğe.** İç içe buton
 * HTML'i geçersiz kılar ve klavye gezinmesini kırar; "stretched link" ise butonu
 * satırın altına gömer. Bu düzende ikisi de ayrı ayrı odaklanabilir.
 */

const { awaitingCard, sideScreens } = HOME_METRICS;

const REASON_LINE_HEIGHT = 1.2;

export type HomeListRowVariant = "card" | "full";

/**
 * İskelet satırı gerçek satırla aynı yüksekliktedir: iki satırlık metin kolonu
 * avatardan uzundur, yükseklik ondan gelir.
 */
const TEXT_COLUMN_HEIGHT =
  HOME_TYPE_SCALE.cardRowName.size * HOME_TYPE_SCALE.cardRowName.lineHeight +
  awaitingCard.reasonMarginTop +
  awaitingCard.reasonFontSize * REASON_LINE_HEIGHT;

export const HOME_LIST_ROW_HEIGHT =
  awaitingCard.rowPaddingY * 2 + Math.max(awaitingCard.avatarSize, TEXT_COLUMN_HEIGHT);

const ROW_PADDING = `${pxToRem(awaitingCard.rowPaddingY)} ${pxToRem(
  awaitingCard.rowPaddingRight,
)} ${pxToRem(awaitingCard.rowPaddingY)} ${pxToRem(awaitingCard.rowPaddingLeft)}`;

export type HomeListRowActor = {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly presence: HomePresenceStatus;
};

export type HomeListRowProps = {
  /** Sağdaki buton ya da bağlantı; satırın kardeşi, çocuğu değil. */
  action?: ReactNode;
  /** Adın yanındaki ikincil satır — "<sunucu> · #<kanal>". Boşsa çizilmez. */
  context: string;
  /** İkinci satır: istek gerekçesi ya da bahsedilmenin alıntısı. */
  excerpt: string;
  href: string;
  now: Date;
  occurredAt: string;
  onNavigate?: () => void;
  testId?: string;
  /** §2.1 — okunmamış satırın solunda 3px `--primary` şerit. */
  unread?: boolean;
  user: HomeListRowActor;
  variant?: HomeListRowVariant;
};

export function HomeListRow({
  action,
  context,
  excerpt,
  href,
  now,
  occurredAt,
  onNavigate,
  testId = "home-list-row",
  unread = false,
  user,
  variant = "card",
}: HomeListRowProps) {
  const { t } = useI18n();
  const full = variant === "full";

  return (
    <div
      className="flex min-w-0 items-center border-solid border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-secondary)/0.55)] transition-colors hover:border-[hsl(var(--primary)/0.45)] has-[a:focus-visible]:border-[hsl(var(--primary)/0.45)]"
      data-testid={testId}
      data-unread={unread ? "true" : undefined}
      style={{
        borderRadius: pxToRem(awaitingCard.rowRadius),
        borderWidth: hairline(awaitingCard.rowBorderWidth),
        // Şerit `inset` bir gölge: ayrı bir öğe eklemeden yarıçapı takip eder ve
        // okundu olunca satırın genişliğini oynatmaz.
        ...(unread
          ? {
              boxShadow: `inset ${pxToRem(sideScreens.unreadStripeWidth)} 0 0 0 hsl(var(--primary))`,
            }
          : {}),
        gap: pxToRem(awaitingCard.rowGap),
        padding: ROW_PADDING,
      }}
    >
      <Link
        className="flex min-w-0 flex-1 items-center rounded-[inherit] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        href={href}
        style={{ gap: pxToRem(awaitingCard.rowGap) }}
        {...(onNavigate ? { onClick: onNavigate } : {})}
      >
        <div className="relative shrink-0">
          <HomeAvatar
            avatarUrl={user.avatarUrl}
            displayName={user.displayName}
            fontSize={awaitingCard.avatarFontSize}
            size={awaitingCard.avatarSize}
          />
          <PresenceDot
            borderColor="hsl(var(--surface-card))"
            borderWidth={awaitingCard.presenceDotBorderWidth}
            presence={user.presence}
            size={awaitingCard.presenceDotSize}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center" style={{ gap: pxToRem(awaitingCard.titleGap) }}>
            <span
              className="whitespace-nowrap text-[hsl(var(--foreground))]"
              style={{
                fontSize: pxToRem(HOME_TYPE_SCALE.cardRowName.size),
                fontWeight: HOME_TYPE_SCALE.cardRowName.weight,
                lineHeight: HOME_TYPE_SCALE.cardRowName.lineHeight,
              }}
            >
              {user.displayName}
            </span>
            {context ? (
              <span
                className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
                style={{ fontSize: pxToRem(HOME_TYPE_SCALE.contextLabel.size) }}
              >
                {context}
              </span>
            ) : null}
            <span
              className="ml-auto shrink-0 text-[hsl(var(--text-muted))]"
              style={{
                fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
                fontWeight: HOME_TYPE_SCALE.timestamp.weight,
                lineHeight: HOME_TYPE_SCALE.timestamp.lineHeight,
              }}
            >
              {resolveHomeCopy(formatRelativeTime(occurredAt, now), t)}
            </span>
          </div>
          <div
            className={cn(
              "text-[hsl(var(--text-secondary))]",
              // §2.1 — alıntı iki satıra kadar. Kartta tek satır kalır: bento
              // ızgarasında satır yüksekliği sabittir ve kart kaymaz.
              full ? "line-clamp-2" : "truncate whitespace-nowrap",
            )}
            style={{
              fontSize: pxToRem(awaitingCard.reasonFontSize),
              lineHeight: REASON_LINE_HEIGHT,
              marginTop: pxToRem(awaitingCard.reasonMarginTop),
            }}
          >
            {excerpt}
          </div>
        </div>
      </Link>

      {action}
    </div>
  );
}
