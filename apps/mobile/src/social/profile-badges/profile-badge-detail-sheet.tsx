import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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

import { BottomSheet, type BottomSheetPresentation } from "../../app/components/kit/bottom-sheet";
import { MOBILE_PROFILE_BADGE_DETAIL_OVERLAY_ID } from "../../app/components/kit/overlay-registry";
import { useSheetPresentation } from "../../app/components/kit/sheet-primitives";
import { useMobileLocaleRuntime } from "../../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../app/providers/mobile-theme-provider";
import type { MobileApiClient } from "../../api/mobile-api-client";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileCopy } from "../../locale/mobile-copy";
import type { MobileLocale } from "../../locale/mobile-locale-preferences";
import { useMobileOwnBadgesQuery } from "../mobile-badges-query";
import { resolveBadgeGlyph } from "./profile-badge-chips";
import {
  PROFILE_BADGE_DETAIL_CELL_GLYPH_SIZE,
  PROFILE_BADGE_DETAIL_GLYPH_SIZE,
  createProfileBadgeDetailStyles,
} from "./profile-badge-detail-sheet.styles";

type MobileCopy = (typeof mobileCopy)[MobileLocale];

export const PROFILE_BADGE_DETAIL_TEST_ID = "mobile-profile-badge-detail";

/**
 * What the chip row asked for. `list` is the `+N` chip: it opens the same sheet
 * on its all-badges view, and picking a row from there swaps this sheet's body
 * rather than stacking a second overlay on top of it (06 §2).
 */
export type ProfileBadgeDetailRequest =
  { readonly kind: "badge"; readonly badgeId: BadgeId } | { readonly kind: "list" };

export interface ProfileBadgeDetailSheetProps {
  readonly badges: readonly EarnedBadge[];
  readonly client: MobileApiClient;
  /** Progress is a self-only field; a peer's sheet never asks for it (06 §4). */
  readonly isSelf: boolean;
  readonly onClose: () => void;
  readonly request: ProfileBadgeDetailRequest | null;
}

/** unit → frame string. `count`/`none` badges print the pair with no unit word. */
function readUnitLabels(copy: MobileCopy): Readonly<Partial<Record<BadgeUnit, string>>> {
  return {
    day: copy.profileBadgesUnitDay,
    invite: copy.profileBadgesUnitInvite,
    member: copy.profileBadgesUnitMember,
    // Seconds are stored, hours are shown (06 §1).
    second: copy.profileBadgesUnitHour,
  };
}

function BadgeDetailBody({
  copy,
  locale,
  model,
}: {
  readonly copy: MobileCopy;
  readonly locale: MobileLocale;
  readonly model: BadgeDetailModel;
}) {
  const styles = useThemedStyles(createProfileBadgeDetailStyles);
  const theme = useTheme();
  // A locked badge is drawn neutral and dimmed (06 §1); it only ever appears on
  // your own "Rozetlerim" list, never on a profile.
  const tint = theme.profileBadge[model.earned ? model.tint : "neutral"];
  const earnedMonth = formatBadgeEarnedMonth(model.earnedAt, locale);
  const expiresMonth = model.expiresAt ? formatBadgeEarnedMonth(model.expiresAt, locale) : null;

  return (
    <View style={styles.detail} testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-badge`}>
      <View
        style={[
          styles.tile,
          { backgroundColor: tint.surface, borderColor: tint.border },
          model.earned ? null : styles.tileLocked,
        ]}
        testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-glyph`}
      >
        <MobileLineIcon
          color={tint.icon}
          name={resolveBadgeGlyph(model.id)}
          size={PROFILE_BADGE_DETAIL_GLYPH_SIZE}
        />
      </View>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={2}
        style={styles.name}
        testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-name`}
      >
        {model.name}
      </Text>
      {model.tierLabel === null ? null : (
        <Text
          maxFontSizeMultiplier={2}
          style={styles.tierLabel}
          testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-tier`}
        >
          {model.tierLabel}
        </Text>
      )}
      <Text
        maxFontSizeMultiplier={2}
        style={styles.description}
        testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-description`}
      >
        {model.description}
      </Text>
      {earnedMonth === "" ? null : (
        <Text
          maxFontSizeMultiplier={2}
          style={styles.meta}
          testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-earned`}
        >
          {copy.profileBadgesEarnedTemplate.replace("{date}", earnedMonth)}
        </Text>
      )}
      {expiresMonth === null || expiresMonth === "" ? null : (
        <Text
          maxFontSizeMultiplier={2}
          style={styles.meta}
          testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-expires`}
        >
          {copy.profileBadgesExpiresTemplate.replace("{date}", expiresMonth)}
        </Text>
      )}
      {model.progress === null ? null : (
        <View style={styles.progressBlock} testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-progress`}>
          <View style={[styles.progressTrack, { backgroundColor: tint.surface }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: tint.icon,
                  width: `${Math.round(model.progress.ratio * 100)}%`,
                },
              ]}
              testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-progress-fill`}
            />
          </View>
          <Text
            maxFontSizeMultiplier={2}
            style={styles.progressLabel}
            testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-progress-label`}
          >
            {formatBadgeProgressText({
              display: model.progress,
              maxTierLabel: copy.profileBadgesMaxTier,
              template: copy.profileBadgesProgressTemplate,
              unitLabels: readUnitLabels(copy),
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

function BadgeListBody({
  badges,
  copy,
  locale,
  onSelect,
}: {
  readonly badges: readonly EarnedBadge[];
  readonly copy: MobileCopy;
  readonly locale: MobileLocale;
  readonly onSelect: (id: BadgeId) => void;
}) {
  const styles = useThemedStyles(createProfileBadgeDetailStyles);
  const theme = useTheme();
  // Same order the row uses, so the list continues the three chips rather than
  // re-shuffling the same account into a second ordering.
  const ordered = useMemo(() => sortBadges(badges), [badges]);

  return (
    <View testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-list`}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.listTitle}>
        {copy.profileBadgesTitle}
      </Text>
      <View style={styles.grid}>
        {ordered.map((badge) => {
          const tint = theme.profileBadge[BADGE_CATALOG[badge.id].tint];
          return (
            <Pressable
              accessibilityRole="button"
              key={badge.id}
              onPress={() => onSelect(badge.id)}
              style={({ pressed }) => [styles.gridCell, pressed && styles.gridCellPressed]}
              testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-list-${badge.id}`}
            >
              <View
                style={[
                  styles.gridChip,
                  { backgroundColor: tint.surface, borderColor: tint.border },
                ]}
              >
                <MobileLineIcon
                  color={tint.icon}
                  name={resolveBadgeGlyph(badge.id)}
                  size={PROFILE_BADGE_DETAIL_CELL_GLYPH_SIZE}
                />
              </View>
              <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.gridLabel}>
                {BADGE_CATALOG[badge.id].copy[locale].name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * 06 §2. One sheet for both views: a badge's detail and the full badge list.
 * It rides the shared `BottomSheet`, so it draws into the single overlay host
 * and never opens an RN `Modal` of its own (00 §2), and it is a sibling of the
 * profile card rather than a replacement for it — opening it leaves the card up.
 *
 * The badges it shows are the ones the card already loaded; only your own
 * progress is a second request, and only while this sheet is open (06 §4).
 */
export function ProfileBadgeDetailSheet({
  badges,
  client,
  isSelf,
  onClose,
  request,
}: ProfileBadgeDetailSheetProps) {
  const styles = useThemedStyles(createProfileBadgeDetailStyles);
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const sheetPresentation = useSheetPresentation();
  const open = request !== null;
  /**
   * Which badge the body is on. It is seeded from the request and then owned by
   * the sheet, because picking a row from the list view has to swap this body
   * without the caller re-opening anything.
   */
  const [selectedId, setSelectedId] = useState<BadgeId | null>(null);

  useEffect(() => {
    if (request === null) {
      return;
    }

    setSelectedId(request.kind === "badge" ? request.badgeId : null);
  }, [request]);

  /**
   * Progress is fetched only for your own profile and only while the sheet is
   * up: the card must not pay for a request whose result it cannot show, and a
   * peer's sheet must never issue it at all (06 §4).
   */
  const ownBadgesQuery = useMobileOwnBadgesQuery(client, isSelf && open);
  const progress: readonly BadgeProgress[] = ownBadgesQuery.data?.progress ?? [];

  const selected =
    selectedId === null ? null : (badges.find((entry) => entry.id === selectedId) ?? null);
  const model = useMemo(
    () =>
      selected === null
        ? null
        : buildBadgeDetailModel({
            badge: selected,
            formatTierLabel: (tier) => copy.profileBadgesTierLabel.replace("{tier}", String(tier)),
            isSelf,
            locale,
            progress,
          }),
    [copy, isSelf, locale, progress, selected],
  );

  const presentation = useMemo<BottomSheetPresentation>(
    () => ({
      contentStyle: styles.content,
      handleAreaStyle: styles.handleArea,
      handleStyle: styles.handle,
      panelStyle: [sheetPresentation.panelStyle, styles.panel],
    }),
    [sheetPresentation, styles],
  );

  // Only a detail reached through the list can go back; a chip's own detail has
  // nowhere behind it and shows no control.
  const canGoBack = request?.kind === "list" && model !== null;

  return (
    <BottomSheet
      accessibilityLabel={model?.name ?? copy.profileBadgesTitle}
      onClose={onClose}
      open={open}
      overlayId={MOBILE_PROFILE_BADGE_DETAIL_OVERLAY_ID}
      presentation={presentation}
      sizing="content"
      testID={PROFILE_BADGE_DETAIL_TEST_ID}
    >
      <ScrollView
        accessibilityLabel={copy.profileBadgesDetailLabel}
        contentContainerStyle={styles.root}
        showsVerticalScrollIndicator={false}
      >
        {canGoBack ? (
          <View style={styles.backRow}>
            <Pressable
              accessibilityLabel={copy.profileBadgesBackAction}
              accessibilityRole="button"
              onPress={() => setSelectedId(null)}
              style={({ pressed }) => [styles.backAction, pressed && styles.backActionPressed]}
              testID={`${PROFILE_BADGE_DETAIL_TEST_ID}-back`}
            >
              <MobileLineIcon color={theme.text.secondary} name="back-arrow" size={17} />
            </Pressable>
          </View>
        ) : null}
        {model === null ? (
          <BadgeListBody
            badges={badges}
            copy={copy}
            locale={locale}
            onSelect={(id) => setSelectedId(id)}
          />
        ) : (
          <BadgeDetailBody copy={copy} locale={locale} model={model} />
        )}
      </ScrollView>
    </BottomSheet>
  );
}
