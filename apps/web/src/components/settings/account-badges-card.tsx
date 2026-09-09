"use client";

// The default import is what `node --test --import tsx` compiles JSX against in
// this package, the same as `profile-badge-chips.tsx`.
import React, { useMemo } from "react";
import {
  BADGE_CATALOG,
  buildOwnBadgeEntries,
  formatBadgeEarnedMonth,
  formatBadgeProgressText,
  groupBadgesByFamily,
  summarizeOwnBadges,
  type BadgeFamily,
  type BadgeUnit,
  type OwnBadgeEntry,
  type OwnBadgesResponse,
} from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import {
  BADGE_LUCIDE_ICON,
  BADGE_TINT_VARIABLES,
  PROFILE_BADGE_CHIP_RADIUS,
  PROFILE_BADGE_CHIP_SIZE,
  PROFILE_BADGE_GLYPH_SIZE,
} from "@/components/shared/profile-badge-chips";
import type { AppLocale } from "@/lib/locale/core";

/** Locked rows keep the neutral tint at 40% (07 §1). */
export const LOCKED_BADGE_OPACITY = 0.4;

export const ACCOUNT_BADGES_TEST_ID = "settings-account-badges";

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

const FAMILY_LABEL_KEY: Record<BadgeFamily, string> = {
  activity: "settings.account.badges.family.activity",
  commerce: "settings.account.badges.family.commerce",
  contribution: "settings.account.badges.family.contribution",
  event: "settings.account.badges.family.event",
  identity: "settings.account.badges.family.identity",
};

/** unit → frame string, the same mapping the detail panel uses. */
function readUnitLabels(t: TranslateFn): Readonly<Partial<Record<BadgeUnit, string>>> {
  return {
    day: t("profile.badges.unit.day"),
    invite: t("profile.badges.unit.invite"),
    member: t("profile.badges.unit.member"),
    // Seconds are stored, hours are shown (06 §1).
    second: t("profile.badges.unit.hour"),
  };
}

function BadgeRow({
  entry,
  locale,
  t,
}: {
  entry: OwnBadgeEntry;
  locale: AppLocale;
  t: TranslateFn;
}) {
  const definition = BADGE_CATALOG[entry.id];
  // A locked row is drawn neutral whatever colour the badge will be once it is
  // earned, so the list reads as "not yours yet" at a glance (07 §1).
  const tint = BADGE_TINT_VARIABLES[entry.earned ? definition.tint : "neutral"];
  const Icon = BADGE_LUCIDE_ICON[entry.id];
  const copy = definition.copy[locale];
  const tiered = definition.thresholds.length > 1;
  const tierLabel =
    entry.earned && tiered
      ? (copy.tiers?.[entry.tier - 1] ?? t("profile.badges.tier", { tier: entry.tier }))
      : null;
  const earnedMonth = entry.earnedAt ? formatBadgeEarnedMonth(entry.earnedAt, locale) : "";

  return (
    <li
      className="flex items-center gap-2.5 px-3 py-2"
      data-testid={`${ACCOUNT_BADGES_TEST_ID}-row-${entry.id}`}
    >
      <span
        className="box-border inline-flex shrink-0 items-center justify-center border border-solid"
        style={{
          backgroundColor: tint.surface,
          borderColor: tint.border,
          borderRadius: PROFILE_BADGE_CHIP_RADIUS,
          height: PROFILE_BADGE_CHIP_SIZE,
          opacity: entry.earned ? 1 : LOCKED_BADGE_OPACITY,
          width: PROFILE_BADGE_CHIP_SIZE,
        }}
      >
        <Icon
          aria-hidden
          color={tint.icon}
          height={PROFILE_BADGE_GLYPH_SIZE}
          width={PROFILE_BADGE_GLYPH_SIZE}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs font-bold text-app-foreground">{copy.name}</span>
          {tierLabel === null ? null : (
            <span
              className="text-[0.6875rem] font-bold text-[var(--primary-readable)]"
              data-testid={`${ACCOUNT_BADGES_TEST_ID}-tier-${entry.id}`}
            >
              {tierLabel}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[0.71875rem] leading-4 text-app-muted">
          {copy.description}
        </span>
      </span>
      {entry.earned ? (
        earnedMonth === "" ? null : (
          <span
            className="shrink-0 text-[0.6875rem] font-semibold text-app-muted"
            data-testid={`${ACCOUNT_BADGES_TEST_ID}-date-${entry.id}`}
          >
            {earnedMonth}
          </span>
        )
      ) : entry.progress === null ? null : (
        // A locked row shows how far along it is and nothing else — no tier
        // label, because a threshold that has not been crossed is not a tier.
        <span
          className="shrink-0 text-[0.6875rem] font-semibold text-app-muted"
          data-testid={`${ACCOUNT_BADGES_TEST_ID}-progress-${entry.id}`}
        >
          {formatBadgeProgressText({
            display: entry.progress,
            maxTierLabel: t("profile.badges.maxTier"),
            template: t("profile.badges.progress"),
            unitLabels: readUnitLabels(t),
          })}
        </span>
      )}
    </li>
  );
}

function BadgeGroups({
  entries,
  locale,
  section,
  t,
}: {
  entries: readonly OwnBadgeEntry[];
  locale: AppLocale;
  section: "earned" | "locked";
  t: TranslateFn;
}) {
  const groups = useMemo(() => groupBadgesByFamily(entries), [entries]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="mt-3" data-testid={`${ACCOUNT_BADGES_TEST_ID}-${section}`}>
      <h4 className="text-[0.71875rem] font-bold uppercase tracking-[0.1em] text-app-soft">
        {t(`settings.account.badges.${section}`)}
      </h4>
      {groups.map((group) => (
        <section className="mt-2" key={group.family}>
          <h5
            className="px-3 text-[0.6875rem] font-bold text-app-soft"
            data-testid={`${ACCOUNT_BADGES_TEST_ID}-${section}-${group.family}`}
          >
            {t(FAMILY_LABEL_KEY[group.family])}
          </h5>
          <ul className="mt-1 divide-y divide-[hsl(var(--border)/0.42)] rounded-[1rem] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)]">
            {group.badges.map((entry) => (
              <BadgeRow entry={entry} key={entry.id} locale={locale} t={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export type AccountBadgesCardProps = {
  /** Null while the read is in flight; the card shows its summary skeleton. */
  data: OwnBadgesResponse | null;
};

/**
 * 07 §3 "Rozetlerim" on web. Every catalog badge is a row, earned or not, split
 * into two sections and grouped by family — the same split, the same order and
 * the same counter the mobile screen draws, because all three come out of
 * `@wizards/types` rather than being re-derived per platform.
 *
 * The card never explains how to earn anything: it prints the catalog's own
 * description and, for a locked badge the evaluator counts, the raw progress
 * pair. Anything else would be an invented rule (07 §1).
 */
export function AccountBadgesCard({ data }: AccountBadgesCardProps) {
  const { locale, t } = useI18n();
  const entries = useMemo(() => (data === null ? [] : buildOwnBadgeEntries(data)), [data]);
  const summary = useMemo(() => summarizeOwnBadges({ badges: data?.badges ?? [] }), [data]);
  const earned = entries.filter((entry) => entry.earned);
  const locked = entries.filter((entry) => !entry.earned);

  return (
    <div data-testid={ACCOUNT_BADGES_TEST_ID}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-app-muted">
          {t("settings.account.badges.description")}
        </p>
        <span
          className="shrink-0 text-sm font-extrabold text-app-foreground"
          data-testid={`${ACCOUNT_BADGES_TEST_ID}-summary`}
        >
          {t("settings.account.badges.summary", {
            earned: summary.earned,
            total: summary.total,
          })}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-soft)/0.5)]"
        data-testid={`${ACCOUNT_BADGES_TEST_ID}-bar`}
      >
        <div
          className="h-full rounded-full bg-[hsl(var(--primary))]"
          style={{ width: `${Math.round(summary.ratio * 100)}%` }}
        />
      </div>
      {earned.length === 0 ? (
        <p className="mt-3 text-xs font-semibold text-app-muted">
          {t("settings.account.badges.empty")}
        </p>
      ) : (
        <BadgeGroups entries={earned} locale={locale} section="earned" t={t} />
      )}
      <BadgeGroups entries={locked} locale={locale} section="locked" t={t} />
    </div>
  );
}
