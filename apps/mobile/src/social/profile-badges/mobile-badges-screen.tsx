import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  BADGE_CATALOG,
  BadgeIdSchema,
  buildOwnBadgeEntries,
  formatBadgeEarnedMonth,
  formatBadgeProgressText,
  groupBadgesByFamily,
  summarizeOwnBadges,
  type BadgeFamily,
  type BadgeId,
  type BadgeUnit,
  type EarnedBadge,
  type OwnBadgeEntry,
} from "@wizards/types";

import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileHaptics } from "../../app/providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileCopy } from "../../locale/mobile-copy";
import type { MobileLocale } from "../../locale/mobile-locale-preferences";
import { useMobileOwnBadgesQuery } from "../mobile-badges-query";
import { resolveBadgeGlyph } from "./profile-badge-chips";
import {
  BADGES_SCREEN_GLYPH_SIZE,
  createMobileBadgesScreenStyles,
} from "./mobile-badges-screen.styles";
import {
  ProfileBadgeDetailSheet,
  type ProfileBadgeDetailRequest,
} from "./profile-badge-detail-sheet";

/** Re-exported so a caller that renders the screen also has its address. */
export { MOBILE_BADGES_SETTINGS_SECTION } from "./mobile-badges-route";

type MobileCopy = (typeof mobileCopy)[MobileLocale];

export const MOBILE_BADGES_SCREEN_TEST_ID = "mobile-badges-screen";

function readFamilyLabel(family: BadgeFamily, copy: MobileCopy): string {
  switch (family) {
    case "identity":
      return copy.profileBadgesFamilyIdentity;
    case "contribution":
      return copy.profileBadgesFamilyContribution;
    case "activity":
      return copy.profileBadgesFamilyActivity;
    case "commerce":
      return copy.profileBadgesFamilyCommerce;
    case "event":
      return copy.profileBadgesFamilyEvent;
  }
}

/** unit → frame string; the detail sheet's mapping, unchanged. */
function readUnitLabels(copy: MobileCopy): Readonly<Partial<Record<BadgeUnit, string>>> {
  return {
    day: copy.profileBadgesUnitDay,
    invite: copy.profileBadgesUnitInvite,
    member: copy.profileBadgesUnitMember,
    // Seconds are stored, hours are shown (06 §1).
    second: copy.profileBadgesUnitHour,
  };
}

function BadgeListRow({
  copy,
  entry,
  isLast,
  locale,
  onPress,
}: {
  readonly copy: MobileCopy;
  readonly entry: OwnBadgeEntry;
  readonly isLast: boolean;
  readonly locale: MobileLocale;
  readonly onPress: (id: BadgeId) => void;
}) {
  const styles = useThemedStyles(createMobileBadgesScreenStyles);
  const theme = useTheme();
  const definition = BADGE_CATALOG[entry.id];
  const badgeCopy = definition.copy[locale];
  // Locked rows go neutral whatever colour the badge carries once earned.
  const tint = theme.profileBadge[entry.earned ? definition.tint : "neutral"];
  const tiered = definition.thresholds.length > 1;
  const tierLabel =
    entry.earned && tiered
      ? (badgeCopy.tiers?.[entry.tier - 1] ??
        copy.profileBadgesTierLabel.replace("{tier}", String(entry.tier)))
      : null;
  const earnedMonth = entry.earnedAt ? formatBadgeEarnedMonth(entry.earnedAt, locale) : "";
  const progressLabel =
    entry.earned || entry.progress === null
      ? null
      : formatBadgeProgressText({
          display: entry.progress,
          maxTierLabel: copy.profileBadgesMaxTier,
          template: copy.profileBadgesProgressTemplate,
          unitLabels: readUnitLabels(copy),
        });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(entry.id)}
      style={({ pressed }) => [styles.row, !isLast && styles.rowDivider, pressed && styles.pressed]}
      testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-row-${entry.id}`}
    >
      <View
        style={[
          styles.chip,
          { backgroundColor: tint.surface, borderColor: tint.border },
          entry.earned ? null : styles.chipLocked,
        ]}
      >
        <MobileLineIcon
          color={tint.icon}
          name={resolveBadgeGlyph(entry.id)}
          size={BADGES_SCREEN_GLYPH_SIZE}
        />
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          <Text maxFontSizeMultiplier={2} style={styles.rowLabel}>
            {badgeCopy.name}
          </Text>
          {tierLabel === null ? null : (
            <Text
              maxFontSizeMultiplier={2}
              style={styles.rowTier}
              testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-tier-${entry.id}`}
            >
              {tierLabel}
            </Text>
          )}
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.rowHint}>
          {badgeCopy.description}
        </Text>
      </View>
      {entry.earned ? (
        earnedMonth === "" ? null : (
          <Text
            maxFontSizeMultiplier={2}
            style={styles.rowMeta}
            testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-date-${entry.id}`}
          >
            {earnedMonth}
          </Text>
        )
      ) : progressLabel === null ? null : (
        <Text
          maxFontSizeMultiplier={2}
          style={styles.rowMeta}
          testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-progress-${entry.id}`}
        >
          {progressLabel}
        </Text>
      )}
    </Pressable>
  );
}

function BadgeSection({
  copy,
  entries,
  locale,
  onPress,
  section,
}: {
  readonly copy: MobileCopy;
  readonly entries: readonly OwnBadgeEntry[];
  readonly locale: MobileLocale;
  readonly onPress: (id: BadgeId) => void;
  readonly section: "earned" | "locked";
}) {
  const styles = useThemedStyles(createMobileBadgesScreenStyles);
  const groups = useMemo(() => groupBadgesByFamily(entries), [entries]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <View testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-${section}`}>
      <Text maxFontSizeMultiplier={2} style={styles.sectionHeading}>
        {section === "earned" ? copy.profileBadgesEarnedSection : copy.profileBadgesLockedSection}
      </Text>
      {groups.map((group) => (
        <View key={group.family}>
          <Text
            maxFontSizeMultiplier={2}
            style={styles.familyHeading}
            testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-${section}-${group.family}`}
          >
            {readFamilyLabel(group.family, copy)}
          </Text>
          <View style={styles.card}>
            {group.badges.map((entry, index) => (
              <BadgeListRow
                copy={copy}
                entry={entry}
                isLast={index === group.badges.length - 1}
                key={entry.id}
                locale={locale}
                onPress={onPress}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export interface MobileBadgesScreenProps {
  /**
   * Set when a BADGE notification opened this screen: that badge's detail is
   * shown straight away rather than making the user hunt for the row.
   */
  readonly initialBadgeId?: string | undefined;
  readonly onBack: () => void;
}

/**
 * 07 §2 "Rozetlerim". Every catalog badge is a row — earned or not, reachable
 * or not — grouped by family and split into two sections. The split, the order
 * and the counter all come out of `@wizards/types`, which is what keeps this
 * screen and the web settings panel from drifting into different lists.
 *
 * It states no rule of its own: a row shows the catalog description and, when
 * the badge is locked and the evaluator counts it, the progress pair. There is
 * no invented "how to earn this" step anywhere on the screen (07 §1).
 */
export function MobileBadgesScreen({ initialBadgeId, onBack }: MobileBadgesScreenProps) {
  const styles = useThemedStyles(createMobileBadgesScreenStyles);
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const badgesQuery = useMobileOwnBadgesQuery(apiClient);
  const [request, setRequest] = useState<ProfileBadgeDetailRequest | null>(null);

  const entries = useMemo(
    () =>
      badgesQuery.data ? buildOwnBadgeEntries(badgesQuery.data) : ([] as readonly OwnBadgeEntry[]),
    [badgesQuery.data],
  );
  const summary = useMemo(
    () => summarizeOwnBadges({ badges: badgesQuery.data?.badges ?? [] }),
    [badgesQuery.data],
  );

  /**
   * The detail sheet reads one flat list, so a locked row travels as tier 0 with
   * no earned date — which is exactly how `buildBadgeDetailModel` reads "not
   * earned yet" (06 §1). No second sheet and no second shape.
   */
  const detailBadges = useMemo<readonly EarnedBadge[]>(
    () =>
      entries.map((entry) => ({
        earnedAt: entry.earnedAt ?? "",
        expiresAt: entry.expiresAt,
        id: entry.id,
        tier: entry.tier,
      })),
    [entries],
  );

  // A notification carries the badge it is about; the screen opens on it once,
  // and closing the sheet must not re-open it.
  useEffect(() => {
    const parsed = BadgeIdSchema.safeParse(initialBadgeId);
    if (parsed.success) {
      setRequest({ badgeId: parsed.data, kind: "badge" });
    }
  }, [initialBadgeId]);

  // BadgeSection memoizes its family grouping by entry identity. Inline filters
  // rebuilt both inputs on every sheet or header state change and defeated it.
  const earned = useMemo(() => entries.filter((entry) => entry.earned), [entries]);
  const locked = useMemo(() => entries.filter((entry) => !entry.earned), [entries]);
  const openDetail = (id: BadgeId) => {
    haptics.selection();
    setRequest({ badgeId: id, kind: "badge" });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID={MOBILE_BADGES_SCREEN_TEST_ID}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={copy.profileBadgesBackAction}
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-back`}
          >
            <View style={styles.backVisual}>
              <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
            </View>
          </Pressable>
          <View style={styles.headerText}>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
              {copy.profileBadgesScreenTitle}
            </Text>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.subtitle}>
              {copy.profileBadgesScreenSubtitle}
            </Text>
          </View>
        </View>

        {badgesQuery.isLoading ? (
          <View style={styles.stateCard} testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-loading`}>
            <ActivityIndicator color={theme.accent.strong} size="small" />
            <Text maxFontSizeMultiplier={2} style={styles.stateText}>
              {copy.profileBadgesLoading}
            </Text>
          </View>
        ) : badgesQuery.isError ? (
          <View style={styles.stateCard} testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-error`}>
            <Text maxFontSizeMultiplier={2} style={styles.stateText}>
              {copy.profileBadgesLoadFailed}
            </Text>
            <Pressable
              accessibilityLabel={copy.profileBadgesRetryAction}
              accessibilityRole="button"
              onPress={() => void badgesQuery.refetch()}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-retry`}
            >
              <Text maxFontSizeMultiplier={2} style={styles.retryLabel}>
                {copy.profileBadgesRetryAction}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text maxFontSizeMultiplier={2} style={styles.summaryLabel}>
                  {copy.profileBadgesScreenSubtitle}
                </Text>
                <Text
                  maxFontSizeMultiplier={2}
                  style={styles.summaryValue}
                  testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-summary`}
                >
                  {copy.profileBadgesSummary
                    .replace("{earned}", String(summary.earned))
                    .replace("{total}", String(summary.total))}
                </Text>
              </View>
              <View style={styles.summaryTrack}>
                <View
                  style={[styles.summaryFill, { width: `${Math.round(summary.ratio * 100)}%` }]}
                  testID={`${MOBILE_BADGES_SCREEN_TEST_ID}-summary-fill`}
                />
              </View>
            </View>

            {earned.length === 0 ? (
              <Text maxFontSizeMultiplier={2} style={styles.emptyText}>
                {copy.profileBadgesEmpty}
              </Text>
            ) : (
              <BadgeSection
                copy={copy}
                entries={earned}
                locale={locale}
                onPress={openDetail}
                section="earned"
              />
            )}
            <BadgeSection
              copy={copy}
              entries={locked}
              locale={locale}
              onPress={openDetail}
              section="locked"
            />
          </>
        )}
      </ScrollView>

      <ProfileBadgeDetailSheet
        badges={detailBadges}
        client={apiClient}
        isSelf
        onClose={() => setRequest(null)}
        request={request}
      />
    </View>
  );
}
