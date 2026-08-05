"use client";

// The default import is what `node --test --import tsx` compiles JSX against in
// this package, the same as `locale-provider.tsx` and the admin sections.
import React, { useMemo } from "react";
import {
  BADGE_CATALOG,
  splitBadgesForCard,
  type BadgeId,
  type BadgeTint,
  type EarnedBadge,
} from "@wizards/types";
import {
  Bug,
  Calendar,
  Check,
  Code,
  Flame,
  FlaskConical,
  Lightbulb,
  MessageCircle,
  Mic,
  Server,
  Shield,
  Sparkles,
  Star,
  UserPlus,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import type { AppLocale } from "@/lib/locale/core";

/**
 * Chip geometry from the handoff (1a:330-332, 1c:491-493). The numbers are the
 * ones `apps/mobile/src/social/profile-badges/profile-badge-chips.styles.ts`
 * carries: the same account has to show the same row on a phone and in a
 * browser, so the two surfaces cannot drift on size, radius or spacing.
 */
export const PROFILE_BADGE_CHIP_SIZE = 28;
export const PROFILE_BADGE_CHIP_RADIUS = 10;
export const PROFILE_BADGE_GLYPH_SIZE = 14;
export const PROFILE_BADGE_CHIP_GAP = 6;
/** Tier 3 marker; a dot rather than a numeral, per 04 §3. */
export const PROFILE_BADGE_TIER_DOT_SIZE = 6;

/**
 * The catalog keeps mobile's glyph names as the canonical ones because they are
 * platform-neutral strings; this table is the single place they become lucide
 * components. It is keyed by `BadgeId` rather than by glyph name on purpose — a
 * badge added to the catalog fails this file's compile until it has an icon,
 * instead of silently rendering nothing in production.
 */
export const BADGE_LUCIDE_ICON: Record<BadgeId, LucideIcon> = {
  betaTester: FlaskConical,
  broadcaster: Video,
  bugHunter: Bug,
  contributor: Code,
  earlyMember: Star,
  event: Sparkles,
  founder: Server,
  ideaShipped: Lightbulb,
  inviter: UserPlus,
  regular: MessageCircle,
  staff: Shield,
  streak: Flame,
  supporter: Zap,
  veteran: Calendar,
  verified: Check,
  voice: Mic,
};

type BadgeTintVariables = { surface: string; border: string; icon: string };

/**
 * Tints resolve through theme variables declared in `globals.css`, so the chip
 * follows every one of the app's themes without this component knowing any of
 * them. The light and dark values there are byte-identical to the mobile
 * `profileBadge` palette group (04 §2).
 */
export const BADGE_TINT_VARIABLES: Record<BadgeTint, BadgeTintVariables> = {
  amber: {
    border: "var(--badge-amber-border)",
    icon: "var(--badge-amber-icon)",
    surface: "var(--badge-amber-surface)",
  },
  blue: {
    border: "var(--badge-blue-border)",
    icon: "var(--badge-blue-icon)",
    surface: "var(--badge-blue-surface)",
  },
  green: {
    border: "var(--badge-green-border)",
    icon: "var(--badge-green-icon)",
    surface: "var(--badge-green-surface)",
  },
  lavender: {
    border: "var(--badge-lavender-border)",
    icon: "var(--badge-lavender-icon)",
    surface: "var(--badge-lavender-surface)",
  },
  neutral: {
    border: "var(--badge-neutral-border)",
    icon: "var(--badge-neutral-icon)",
    surface: "var(--badge-neutral-surface)",
  },
  purple: {
    border: "var(--badge-purple-border)",
    icon: "var(--badge-purple-icon)",
    surface: "var(--badge-purple-surface)",
  },
  red: {
    border: "var(--badge-red-border)",
    icon: "var(--badge-red-icon)",
    surface: "var(--badge-red-surface)",
  },
};

/**
 * Tier is announced, never drawn as a numeral (04 §3). A catalog tier name wins
 * over the generic "Kademe N" frame string when the badge has one.
 */
export function readBadgeLabel(
  badge: EarnedBadge,
  locale: AppLocale,
  formatTier: (tier: number) => string,
): string {
  const { name, tiers } = BADGE_CATALOG[badge.id].copy[locale];

  if (badge.tier <= 1) {
    return name;
  }

  return `${name} · ${tiers?.[badge.tier - 1] ?? formatTier(badge.tier)}`;
}

function chipBoxStyle(tint: BadgeTintVariables, tiered: boolean) {
  return {
    backgroundColor: tint.surface,
    borderColor: tiered ? tint.icon : tint.border,
    borderRadius: PROFILE_BADGE_CHIP_RADIUS,
    borderStyle: "solid" as const,
    // Tier 2 and 3 thicken the border and take the tint's icon tone for it.
    borderWidth: tiered ? 1.5 : 1,
    height: PROFILE_BADGE_CHIP_SIZE,
    width: PROFILE_BADGE_CHIP_SIZE,
  };
}

const CHIP_CLASS_NAME = "relative box-border inline-flex shrink-0 items-center justify-center";

function BadgeChip({
  badge,
  label,
  onSelect,
  testId,
}: {
  badge: EarnedBadge;
  label: string;
  onSelect: (() => void) | undefined;
  testId: string;
}) {
  const tint = BADGE_TINT_VARIABLES[BADGE_CATALOG[badge.id].tint];
  const tiered = badge.tier > 1;
  const Icon = BADGE_LUCIDE_ICON[badge.id];
  const content = (
    <>
      <Icon
        aria-hidden
        color={tint.icon}
        height={PROFILE_BADGE_GLYPH_SIZE}
        width={PROFILE_BADGE_GLYPH_SIZE}
      />
      {badge.tier > 2 ? (
        <span
          aria-hidden
          className="absolute -right-px -top-px rounded-full"
          data-testid={`${testId}-tier-dot`}
          style={{
            backgroundColor: tint.icon,
            height: PROFILE_BADGE_TIER_DOT_SIZE,
            width: PROFILE_BADGE_TIER_DOT_SIZE,
          }}
        />
      ) : null}
    </>
  );

  if (!onSelect) {
    return (
      <span
        aria-label={label}
        className={CHIP_CLASS_NAME}
        data-testid={testId}
        role="img"
        style={chipBoxStyle(tint, tiered)}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      aria-label={label}
      className={`${CHIP_CLASS_NAME} focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]`}
      data-testid={testId}
      onClick={onSelect}
      style={chipBoxStyle(tint, tiered)}
      type="button"
    >
      {content}
    </button>
  );
}

export type ProfileBadgeChipsProps = {
  badges: readonly EarnedBadge[];
  /** Popover ve kart üçer chip gösterir; ileride değişirse tek yerden. */
  visibleCount?: number;
  /** Rozet yükleniyor: satır yer tutar, chip çizilmez. */
  loading?: boolean;
  onSelectBadge?: (badge: EarnedBadge) => void;
  onSelectOverflow?: () => void;
  className?: string;
  testId?: string;
};

/**
 * The web/desktop badge row. Order comes from `splitBadgesForCard` in
 * `@wizards/types` — the same function the mobile card calls — so an account
 * that shows three chips on a phone shows those same three, in that same order,
 * in the popover. Web deliberately does not sort badges itself.
 */
export function ProfileBadgeChips({
  badges,
  className,
  loading = false,
  onSelectBadge,
  onSelectOverflow,
  testId = "profile-badge-chips",
  visibleCount = 3,
}: ProfileBadgeChipsProps) {
  const { locale, t } = useI18n();
  const { overflow, visible } = useMemo(
    () => splitBadgesForCard(badges, visibleCount),
    [badges, visibleCount],
  );

  /**
   * The row keeps its height with or without chips: the badge read is a second
   * request that lands after the profile read, and a row that collapses while
   * it is in flight moves the popover's whole body when the badges arrive.
   */
  const rowStyle = { gap: PROFILE_BADGE_CHIP_GAP, height: PROFILE_BADGE_CHIP_SIZE };

  if (loading) {
    return (
      <div
        className={`flex shrink-0 items-center ${className ?? ""}`.trimEnd()}
        data-testid={testId}
        style={rowStyle}
      />
    );
  }

  if (visible.length === 0) {
    return null;
  }

  const neutral = BADGE_TINT_VARIABLES.neutral;
  const overflowLabel = t("profile.badges.overflow", { count: overflow });

  return (
    <div
      aria-label={t("profile.badges.title")}
      className={`flex shrink-0 items-center ${className ?? ""}`.trimEnd()}
      data-testid={testId}
      role="group"
      style={rowStyle}
    >
      {visible.map((badge) => (
        <BadgeChip
          badge={badge}
          key={badge.id}
          label={readBadgeLabel(badge, locale, (tier) => t("profile.badges.tier", { tier }))}
          onSelect={onSelectBadge ? () => onSelectBadge(badge) : undefined}
          testId={`${testId}-${badge.id}`}
        />
      ))}
      {overflow > 0 ? (
        onSelectOverflow ? (
          <button
            aria-label={overflowLabel}
            className={`${CHIP_CLASS_NAME} text-[11px] font-extrabold leading-[14px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]`}
            data-testid={`${testId}-overflow`}
            onClick={onSelectOverflow}
            style={{ ...chipBoxStyle(neutral, false), color: neutral.icon }}
            type="button"
          >
            {overflowLabel}
          </button>
        ) : (
          <span
            className={`${CHIP_CLASS_NAME} text-[11px] font-extrabold leading-[14px]`}
            data-testid={`${testId}-overflow`}
            style={{ ...chipBoxStyle(neutral, false), color: neutral.icon }}
          >
            {overflowLabel}
          </span>
        )
      ) : null}
    </div>
  );
}
