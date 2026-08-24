"use client";

import React, { useId, type CSSProperties, type ReactNode } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { COMMAND_CENTER_CARD_ATTRIBUTE, type CommandCenterCardId } from "@/lib/home/layout";
import { HOME_METRICS, hairline, pxToRem } from "@/lib/home/metrics";

import { HomeSectionLabel, homeButtonStyle } from "./home-primitives";

/**
 * Bento ızgaranın ortak kart kabuğu — SPEC §3, `05-faz4` §3.
 *
 * Kabuk altı kez yazılmaz: başlık satırı (bölüm etiketi + sağ aksesuar), gövde ve isteğe bağlı ayak
 * burada durur. Kartlar yalnız kendi gövdesini verir.
 *
 * §2.1 — kart bir `section`, adı da içindeki gerçek `h2`dir (`aria-labelledby`). Etiket görsel
 * olarak 10.5px'lik bir bölüm yazısıdır; başlık olduğunu söyleyen şey boyutu değil, etiketi.
 */

const { card } = HOME_METRICS;

export type HomeCardProps = {
  /** Başlık satırının sağı — bağlantı, sayaç ya da nabız. */
  accessory?: ReactNode;
  children: ReactNode;
  /**
   * §3 — kartın ızgaradaki kimliği. Yerleşim CSS'te, kırılım tablosundan (`layout.ts`)
   * üretilir; verilmediğinde kart yalnız kolon genişliğini söyler.
   */
  cardId?: CommandCenterCardId;
  columnSpan: number;
  /** "Arkadaşlar" başlığı taban çizgisine hizalı (SPEC §3.6); geri kalanı ortalı. */
  headerAlign?: "baseline" | "center";
  /** Başlığın altındaki boşluk; kartlar arasında değişiyor (10 / 12 / 8 / 0). */
  headerMarginBottom?: number;
  /** Başlık satırının yatay dışa taşması (SPEC §3.1/§3.2: `margin: 0 2px …`). */
  headerMarginX?: number;
  /** Başlık seviyesi; Ana Sayfa'nın `h1`i üst çubuktadır, kartlar onun altındaki `h2`lerdir. */
  headingLevel?: "h2" | "h3";
  label: string;
  /** Bölüm etiketinin **sağındaki** ek — "2 yeni" pill'i, "6 çevrimiçi" sayısı. */
  leading?: ReactNode;
  leadingGap?: number;
  padding: string;
  testId: string;
};

export function HomeCard({
  accessory,
  cardId,
  children,
  columnSpan,
  headerAlign = "center",
  headerMarginBottom = 0,
  headerMarginX = 0,
  headingLevel = "h2",
  label,
  leading,
  leadingGap = 0,
  padding,
  testId,
}: HomeCardProps) {
  const labelId = useId();

  return (
    <section
      aria-labelledby={labelId}
      className="flex min-w-0 flex-col bg-[hsl(var(--surface-card))]"
      {...(cardId === undefined ? {} : { [COMMAND_CENTER_CARD_ATTRIBUTE]: cardId })}
      data-testid={testId}
      style={{
        border: `${hairline(card.borderWidth)} solid hsl(var(--border) / 0.5)`,
        borderRadius: pxToRem(card.radius),
        boxShadow: `0 ${pxToRem(HOME_METRICS.shadow.card.offsetY)} ${pxToRem(
          HOME_METRICS.shadow.card.blur,
        )} hsl(var(--shadow-color) / ${HOME_METRICS.shadow.card.alpha})`,
        // Bento kartının yerleşimi **tamamen** CSS'ten gelir (`layout.ts`): satır içi
        // `grid-column` `grid-area`nın kolon parçasını ezer ve ızgarada örtük kolon açardı.
        // Izgara dışındaki kartlar (yan ekranlar) yerleşim tablosuna girmez, kolon genişliğini
        // kendileri söyler.
        ...(cardId === undefined ? { gridColumn: `span ${columnSpan}` } : {}),
        padding,
      }}
    >
      <div
        className={headerAlign === "baseline" ? "flex items-baseline" : "flex items-center"}
        style={{
          gap: pxToRem(leadingGap),
          margin: `0 ${pxToRem(headerMarginX)} ${pxToRem(headerMarginBottom)}`,
        }}
      >
        <HomeSectionLabel as={headingLevel} id={labelId}>
          {label}
        </HomeSectionLabel>
        {leading}
        {accessory ? <div className="ml-auto flex items-center">{accessory}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Boş ya da hatalı kartın tek satırı — §5.
 *
 * Hata **kartın içinde** kalır: tüm ekranı düşüren bir error boundary yoktur, diğer beş kart
 * çalışmaya devam eder.
 */
export function HomeCardMessage({
  message,
  onRetry,
  testId,
}: {
  message: string;
  onRetry?: () => void;
  testId?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center text-center text-[hsl(var(--text-muted))]"
      data-testid={testId}
      style={{
        fontSize: pxToRem(HOME_METRICS.awaitingCard.reasonFontSize),
        gap: pxToRem(HOME_METRICS.grid.gap),
        padding: `${pxToRem(HOME_METRICS.continueCard.rowPadding)} 0`,
      }}
    >
      <span>{message}</span>
      {onRetry ? (
        <button
          className="inline-flex items-center justify-center bg-[hsl(var(--surface-secondary))] text-[hsl(var(--text-secondary))] outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          onClick={onRetry}
          style={homeButtonStyle({
            background: "hsl(var(--surface-secondary))",
          })}
          type="button"
        >
          {t("home.card.retry")}
        </button>
      ) : null}
    </div>
  );
}

/** §1 — hata satırının tek anahtarı; testler de bunu okur, metnin kopyasını değil. */
export const HOME_CARD_ERROR_KEY = "home.card.error";

export function HomeCardError({ onRetry, testId }: { onRetry: () => void; testId: string }) {
  const { t } = useI18n();

  return <HomeCardMessage message={t(HOME_CARD_ERROR_KEY)} onRetry={onRetry} testId={testId} />;
}

/**
 * Yükleme iskeleti. Satır yükseklikleri **gerçek satırla aynıdır** (§5): yükleme bittiğinde ızgara
 * zıplamaz, CLS artmaz.
 */
export function HomeSkeletonRows({
  count,
  gap,
  radius,
  rowHeight,
  style,
  testId,
}: {
  count: number;
  gap: number;
  radius: number;
  rowHeight: number;
  style?: CSSProperties;
  testId: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col"
      data-testid={testId}
      style={{ gap: pxToRem(gap), ...style }}
    >
      {Array.from({ length: count }, (_unused, index) => (
        <Skeleton
          className="w-full"
          key={index}
          style={{ borderRadius: pxToRem(radius), height: pxToRem(rowHeight) }}
        />
      ))}
    </div>
  );
}
