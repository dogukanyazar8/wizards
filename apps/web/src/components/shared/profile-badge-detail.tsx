"use client";

// The default import is what `node --test --import tsx` compiles JSX against in
// this package, the same as `profile-badge-chips.tsx` and the admin sections.
import React, { useMemo, useState } from "react";
import {
  BADGE_CATALOG,
  buildBadgeDetailModel,
  formatBadgeEarnedMonth,
  formatBadgeProgressText,
  sortBadges,
  type BadgeDetailModel,
  type BadgeId,
  type BadgeProgress,
  type BadgeUnit,
  type EarnedBadge,
} from "@wizards/types";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  BADGE_LUCIDE_ICON,
  BADGE_TINT_VARIABLES,
  PROFILE_BADGE_CHIP_RADIUS,
  PROFILE_BADGE_CHIP_SIZE,
  PROFILE_BADGE_GLYPH_SIZE,
} from "@/components/shared/profile-badge-chips";
import type { AppLocale } from "@/lib/locale/core";

/** Hero glyph box, 06 §1: 56×56 at r18 with a 28px glyph. */
export const PROFILE_BADGE_DETAIL_TILE_SIZE = 56;
export const PROFILE_BADGE_DETAIL_TILE_RADIUS = 18;
export const PROFILE_BADGE_DETAIL_GLYPH_SIZE = 28;
/** Matches the popover's own entry animation so the swap reads as one surface. */
export const PROFILE_BADGE_DETAIL_TRANSITION = { duration: 0.15 } as const;

/**
 * What the chip row asked for. `list` is the `+N` chip: it shows every badge in
 * this same panel, and picking a row swaps the panel's body — no second portal
 * and no second focus trap, which the popover already owns (06 §3).
 */
export type ProfileBadgeDetailRequest = { kind: "badge"; badgeId: BadgeId } | { kind: "list" };

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

/** unit → frame string. `count`/`none` badges print the pair with no unit word. */
function readUnitLabels(t: TranslateFn): Readonly<Partial<Record<BadgeUnit, string>>> {
  return {
    day: t("profile.badges.unit.day"),
    invite: t("profile.badges.unit.invite"),
    member: t("profile.badges.unit.member"),
    // Seconds are stored, hours are shown (06 §1).
    second: t("profile.badges.unit.hour"),
  };
}

function BadgeDetailBody({
  locale,
  model,
  t,
  testId,
}: {
  locale: AppLocale;
  model: BadgeDetailModel;
  t: TranslateFn;
  testId: string;
}) {
  const tint = BADGE_TINT_VARIABLES[model.tint];
  const Icon = BADGE_LUCIDE_ICON[model.id];
  const earnedMonth = formatBadgeEarnedMonth(model.earnedAt, locale);
  const expiresMonth = model.expiresAt ? formatBadgeEarnedMonth(model.expiresAt, locale) : null;

  return (
    <div className="flex flex-col items-center gap-2 text-center" data-testid={`${testId}-badge`}>
      <span
        className="box-border inline-flex items-center justify-center border border-solid"
        data-testid={`${testId}-glyph`}
        style={{
          backgroundColor: tint.surface,
          borderColor: tint.border,
          borderRadius: PROFILE_BADGE_DETAIL_TILE_RADIUS,
          height: PROFILE_BADGE_DETAIL_TILE_SIZE,
          width: PROFILE_BADGE_DETAIL_TILE_SIZE,
        }}
      >
        <Icon
          aria-hidden
          color={tint.icon}
          height={PROFILE_BADGE_DETAIL_GLYPH_SIZE}
          width={PROFILE_BADGE_DETAIL_GLYPH_SIZE}
        />
      </span>
      <h4 className="text-[19px] font-extrabold text-app-foreground" data-testid={`${testId}-name`}>
        {model.name}
      </h4>
      {model.tierLabel === null ? null : (
        <p
          className="text-[12.5px] font-bold text-[hsl(var(--primary))]"
          data-testid={`${testId}-tier`}
        >
          {model.tierLabel}
        </p>
      )}
      <p
        className="text-[13.5px] leading-[1.5] text-app-muted"
        data-testid={`${testId}-description`}
      >
        {model.description}
      </p>
      {earnedMonth === "" ? null : (
        <p className="text-[11.5px] font-semibold text-app-muted" data-testid={`${testId}-earned`}>
          {t("profile.badges.earned", { date: earnedMonth })}
        </p>
      )}
      {expiresMonth === null || expiresMonth === "" ? null : (
        <p className="text-[11.5px] font-semibold text-app-muted" data-testid={`${testId}-expires`}>
          {t("profile.badges.expires", { date: expiresMonth })}
        </p>
      )}
      {model.progress === null ? null : (
        <div className="mt-1 flex w-full flex-col gap-1.5" data-testid={`${testId}-progress`}>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: tint.surface }}
          >
            <div
              className="h-full rounded-full"
              data-testid={`${testId}-progress-fill`}
              style={{
                backgroundColor: tint.icon,
                width: `${Math.round(model.progress.ratio * 100)}%`,
              }}
            />
          </div>
          <p
            className="text-[12px] font-bold text-app-muted"
            data-testid={`${testId}-progress-label`}
          >
            {formatBadgeProgressText({
              display: model.progress,
              maxTierLabel: t("profile.badges.maxTier"),
              template: t("profile.badges.progress"),
              unitLabels: readUnitLabels(t),
            })}
          </p>
        </div>
      )}
    </div>
  );
}

function BadgeListBody({
  badges,
  locale,
  onSelect,
  t,
  testId,
}: {
  badges: readonly EarnedBadge[];
  locale: AppLocale;
  onSelect: (id: BadgeId) => void;
  t: TranslateFn;
  testId: string;
}) {
  // Same order the chip row uses, so the list continues the three chips instead
  // of re-shuffling the same account into a second ordering.
  const ordered = useMemo(() => sortBadges(badges), [badges]);

  return (
    <div data-testid={`${testId}-list`}>
      <h4 className="pb-1 text-[19px] font-extrabold text-app-foreground">
        {t("profile.badges.title")}
      </h4>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
        {ordered.map((badge) => {
          const tint = BADGE_TINT_VARIABLES[BADGE_CATALOG[badge.id].tint];
          const Icon = BADGE_LUCIDE_ICON[badge.id];
          return (
            <li key={badge.id}>
              <button
                className="flex w-full items-center gap-2.5 rounded-2xl py-1.5 pr-2 text-left transition hover:bg-[hsl(var(--surface-soft)/0.5)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid={`${testId}-list-${badge.id}`}
                onClick={() => onSelect(badge.id)}
                type="button"
              >
                <span
                  className="box-border inline-flex shrink-0 items-center justify-center border border-solid"
                  style={{
                    backgroundColor: tint.surface,
                    borderColor: tint.border,
                    borderRadius: PROFILE_BADGE_CHIP_RADIUS,
                    height: PROFILE_BADGE_CHIP_SIZE,
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
                <span className="min-w-0 text-[12.5px] font-semibold text-app-foreground">
                  {BADGE_CATALOG[badge.id].copy[locale].name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type ProfileBadgeDetailProps = {
  badges: readonly EarnedBadge[];
  /** Progress is a self-only field; a peer's panel never receives it (06 §4). */
  isSelf: boolean;
  /** Returns the popover body to the profile it was showing. */
  onBack: () => void;
  progress?: readonly BadgeProgress[] | null | undefined;
  request: ProfileBadgeDetailRequest;
  testId?: string;
};

/**
 * 06 §3. The badge detail is an inline panel inside the profile popover, not a
 * second overlay: the popover already owns the portal and the focus trap, and a
 * layer on top of it would break both. The body swaps, the shell does not move.
 */
export function ProfileBadgeDetail(props: ProfileBadgeDetailProps) {
  const detailKey =
    props.request.kind === "badge" ? `badge:${props.request.badgeId}` : "badge-list";

  return <ProfileBadgeDetailContent {...props} key={detailKey} />;
}

function ProfileBadgeDetailContent({
  badges,
  isSelf,
  onBack,
  progress,
  request,
  testId = "profile-badge-detail",
}: ProfileBadgeDetailProps) {
  const { locale, t } = useI18n();
  /**
   * Which badge the body is on. Seeded from the request and then owned here,
   * because picking a row from the list view swaps this body rather than asking
   * the popover to open anything.
   */
  const [selectedId, setSelectedId] = useState<BadgeId | null>(
    request.kind === "badge" ? request.badgeId : null,
  );

  const selected =
    selectedId === null ? null : (badges.find((entry) => entry.id === selectedId) ?? null);
  const model = useMemo(
    () =>
      selected === null
        ? null
        : buildBadgeDetailModel({
            badge: selected,
            formatTierLabel: (tier) => t("profile.badges.tier", { tier }),
            isSelf,
            locale,
            progress,
          }),
    [isSelf, locale, progress, selected, t],
  );

  // A detail reached through the list steps back to the list; everything else
  // steps back out to the profile.
  const goBack = () => {
    if (request.kind === "list" && model !== null) {
      setSelectedId(null);
      return;
    }

    onBack();
  };

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      // The popover's role="dialog" stays on the shell; this is the region that
      // changes under it, so it is what announces the swap.
      aria-live="polite"
      className="flex flex-col gap-2.5"
      data-testid={testId}
      initial={{ opacity: 0, y: 6 }}
      transition={PROFILE_BADGE_DETAIL_TRANSITION}
    >
      <div className="flex">
        <button
          aria-label={t("common.back")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-soft)/0.42)] text-app-muted transition hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid={`${testId}-back`}
          onClick={goBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>
      {model === null ? (
        <BadgeListBody
          badges={badges}
          locale={locale}
          onSelect={(id) => setSelectedId(id)}
          t={t}
          testId={testId}
        />
      ) : (
        <BadgeDetailBody locale={locale} model={model} t={t} testId={testId} />
      )}
    </motion.div>
  );
}
