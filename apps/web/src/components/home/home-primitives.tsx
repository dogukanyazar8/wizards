"use client";

import React, { type CSSProperties, type ReactNode } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToRem } from "@/lib/home/metrics";
import { HOME_PRESENCE_LABEL_KEY, type HomePresenceStatus } from "@/lib/home/presentation";
import { cn } from "@/lib/utils";

/**
 * Ana Sayfa 1a — birden fazla kartın paylaştığı küçük parçalar.
 *
 * Buraya yalnız **ikinci çağıranı olan** bir şey girer (00-ortak-baglam §2). Ölçüler
 * `HOME_METRICS`'ten okunur; JSX'te çıplak sayı yoktur.
 */

/** SPEC §1: display ailesi token üzerinden gelir, bileşen içine font adı yazılmaz. */
export const DISPLAY_FONT = "[font-family:var(--font-display),sans-serif]";

/** Rozetlerin ve baş harflerin metni; iki temada da okunur kalan tek token. */
export const ON_ACCENT_COLOR = "hsl(var(--primary-foreground))";

const { badge } = HOME_METRICS;

/**
 * Okunmamış sayacı — referans HTML'in `.w-badge` kutusu.
 *
 * `@/components/ui/badge` büyük harfli bir **etikettir** (uppercase, tracking, kenarlık); bu bir
 * sayı kutusudur. İkisi aynı şey değil, o yüzden ayrı duruyor. Navigasyon paneli ve "Kaldığın yer"
 * satırı bu tek bileşeni kullanır.
 */
export type CountBadgeMetrics = {
  readonly fontSize: number;
  readonly height: number;
  readonly minWidth: number;
  readonly paddingX: number;
  readonly radius: number;
};

export function HomeCountBadge({
  className,
  count,
  label,
  metrics = badge,
  tone,
}: {
  className?: string;
  count: number;
  label: string;
  /** Sunucu satırının rozeti daha küçüktür (SPEC §2.2); varsayılan `.w-badge` kutusudur. */
  metrics?: CountBadgeMetrics;
  tone: "danger" | "primary";
}) {
  return (
    <span
      aria-label={label}
      className={cn(DISPLAY_FONT, "grid place-items-center", className)}
      role="status"
      style={{
        background: `hsl(var(--${tone}))`,
        borderRadius: pxToRem(metrics.radius),
        color: ON_ACCENT_COLOR,
        fontSize: pxToRem(metrics.fontSize),
        fontWeight: 600,
        height: pxToRem(metrics.height),
        lineHeight: 1,
        minWidth: pxToRem(metrics.minWidth),
        padding: `0 ${pxToRem(metrics.paddingX)}`,
      }}
    >
      {count}
    </span>
  );
}

const PRESENCE_TOKEN: Record<HomePresenceStatus, string> = {
  DND: "danger",
  IDLE: "warning",
  OFFLINE: "text-muted",
  ONLINE: "success",
};

/**
 * Avatarın sağ alt köşesindeki presence noktası.
 *
 * Renk tek taşıyıcı değildir (§5.3): nokta `sr-only` bir metin karşılığı taşır. Kenar rengi
 * yüzeyden gelir — kart üstünde `--surface-card`, arkadaş kartında `--surface-secondary`.
 */
export function PresenceDot({
  borderColor,
  borderWidth,
  presence,
  size,
}: {
  borderColor: string;
  borderWidth: number;
  presence: HomePresenceStatus;
  size: number;
}) {
  const { t } = useI18n();

  return (
    <span
      className="absolute rounded-full"
      // §2.2 — renk tek taşıyıcı değil: kutunun kendisi gizli, metin karşılığı içindeki
      // `sr-only` satırda. `aria-hidden` noktaya değil, yalnız görsel katmanına konur.
      style={{
        background: `hsl(var(--${PRESENCE_TOKEN[presence]}))`,
        border: `${pxToRem(borderWidth)} solid ${borderColor}`,
        bottom: `-${pxToRem(1)}`,
        height: pxToRem(size),
        right: `-${pxToRem(1)}`,
        width: pxToRem(size),
      }}
    >
      <span className="sr-only">{t(HOME_PRESENCE_LABEL_KEY[presence])}</span>
    </span>
  );
}

/**
 * Sabit boyutlu avatar. Boyut inline verilir, sınıfla değil: yükleme bitmeden de yeri ayrıldığı
 * için düzen kaymaz (CLS yok, §7).
 */
export function HomeAvatar({
  avatarUrl,
  className,
  displayName,
  fontSize,
  size,
  style,
}: {
  avatarUrl: string | null;
  className?: string;
  displayName: string;
  fontSize: number;
  size: number;
  style?: CSSProperties;
}) {
  return (
    <Avatar
      alt={displayName}
      className={cn("border-0", className)}
      fallback={displayName}
      src={avatarUrl}
      style={{
        fontSize: pxToRem(fontSize),
        height: pxToRem(size),
        width: pxToRem(size),
        ...style,
      }}
    />
  );
}

/**
 * Üst üste binen avatar yığını — "Şu an canlı" katılımcıları ve "Sıradaki" katılımcıları.
 *
 * Dördüncüden sonrası `+n` çipine düşer; `total` gerçek sayıdır, listedeki dört kişi değil.
 */
export function HomeAvatarStack({
  actors,
  avatarFontSize,
  avatarSize,
  overflowFontSize,
  overlap,
  ringColor,
  ringWidth,
  total,
}: {
  actors: readonly { avatarUrl: string | null; displayName: string; id: string }[];
  avatarFontSize: number;
  avatarSize: number;
  overflowFontSize?: number;
  overlap: number;
  ringColor: string;
  ringWidth: number;
  total: number;
}) {
  const overflow = Math.max(0, total - actors.length);
  const ring = `0 0 0 ${pxToRem(ringWidth)} ${ringColor}`;

  return (
    <div className="flex">
      {actors.map((actor, index) => (
        <span
          className="inline-flex rounded-full"
          key={actor.id}
          style={{
            boxShadow: ring,
            ...(index === 0 ? {} : { marginLeft: pxToRem(overlap) }),
          }}
        >
          <HomeAvatar
            avatarUrl={actor.avatarUrl}
            displayName={actor.displayName}
            fontSize={avatarFontSize}
            size={avatarSize}
          />
        </span>
      ))}
      {overflow > 0 && overflowFontSize !== undefined ? (
        <span
          className={cn(DISPLAY_FONT, "grid place-items-center rounded-full")}
          style={{
            background: "hsl(var(--surface-tertiary))",
            boxShadow: ring,
            color: "hsl(var(--text-secondary))",
            fontSize: pxToRem(overflowFontSize),
            fontWeight: 600,
            height: pxToRem(avatarSize),
            lineHeight: 1,
            marginLeft: pxToRem(overlap),
            width: pxToRem(avatarSize),
          }}
        >
          {`+${overflow}`}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Bölüm etiketi — SPEC §3: 600/10.5/1 display, 0.15em, uppercase, nowrap, muted.
 *
 * §2.1 — görsel olarak küçük ama anlamsal olarak **başlık**. `as` verildiğinde gerçek bir
 * `h2`/`h3` çizilir (`div` + `role="heading"` değil); boyutu yine CSS verir.
 */
export function HomeSectionLabel({
  as: Tag = "span",
  children,
  id,
}: {
  as?: "h2" | "h3" | "span";
  children: ReactNode;
  id?: string;
}) {
  return (
    <Tag
      className={cn(DISPLAY_FONT, "m-0 whitespace-nowrap uppercase text-[hsl(var(--text-muted))]")}
      {...(id ? { id } : {})}
      style={{
        fontSize: pxToRem(HOME_TYPE_SCALE.sectionLabel.size),
        fontWeight: HOME_TYPE_SCALE.sectionLabel.weight,
        letterSpacing: HOME_TYPE_SCALE.sectionLabel.tracking,
        lineHeight: HOME_TYPE_SCALE.sectionLabel.lineHeight,
      }}
    >
      {children}
    </Tag>
  );
}

/** Başlık satırının sağındaki bağlantı — `Tümünü gör`, `Gelen kutusu`, `Tümü`. */
export function HomeHeaderLink({
  children,
  fontSize,
  href,
  gap,
}: {
  children: ReactNode;
  fontSize: number;
  gap?: number;
  href: string;
}) {
  return (
    <a
      className="inline-flex items-center rounded-full text-[var(--primary-readable)] outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid="home-header-link"
      href={href}
      style={{
        fontSize: pxToRem(fontSize),
        fontWeight: 600,
        lineHeight: 1,
        ...(gap === undefined ? {} : { gap: pxToRem(gap) }),
      }}
    >
      {children}
    </a>
  );
}

/**
 * Tasarımın `.w-btn` düğmesi — 36 yükseklik, 14 yatay padding, 12 yarıçap, 600/13.
 *
 * `@wizards/ui`'nin `Button size="sm"` varyantı taban davranışı (odak halkası, `disabled`) taşır;
 * ölçüler `HOME_METRICS`'ten inline gelir, çünkü Tailwind varyantı 12px padding ve 14px metinle
 * çiziyor. İki değer arasında tasarım kazanır (00 §1: HTML nihai otorite).
 */
export function homeButtonStyle(overrides: CSSProperties = {}): CSSProperties {
  return {
    borderRadius: pxToRem(HOME_METRICS.liveCard.buttonRadius),
    fontSize: pxToRem(HOME_TYPE_SCALE.button.size),
    fontWeight: HOME_TYPE_SCALE.button.weight,
    height: pxToRem(HOME_METRICS.liveCard.buttonHeight),
    lineHeight: HOME_TYPE_SCALE.button.lineHeight,
    padding: `0 ${pxToRem(HOME_METRICS.liveCard.buttonPaddingX)}`,
    ...overrides,
  };
}

/** Kart içi ince ayırıcı; 4K'da kalınlaşmasın diye `hairline()` (SPEC §8.2.3). */
export function HomeDivider({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="bg-[hsl(var(--border)/0.5)]"
      style={{ height: hairline(), ...style }}
    />
  );
}

/**
 * İyimser bir yazım düştüğünde kartın içinde beliren tek satır — `06-faz5` §2.
 *
 * Web'de genel bir toast katmanı yok; mevcut desen `friends-view.tsx`'in
 * `role="status" aria-live="polite"` şeridi. Kullanıcı kararı: mesaj **ilgili kartın içinde**
 * durur, kendi altyapısını kurmaz. Sessizce geri almak yalan olurdu: kullanıcı çipe bastı,
 * çip geri kaydı, sebebini bilmiyor.
 */
export function HomeCardNotice({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className="m-0 truncate text-[var(--danger-readable)]"
      data-testid="home-card-notice"
      role="status"
      style={{
        fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
        lineHeight: 1.2,
        marginTop: pxToRem(HOME_METRICS.card.borderWidth * 6),
      }}
    >
      {message}
    </p>
  );
}
