import { useMemo } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { BADGE_CATALOG, splitBadgesForCard, type BadgeId, type EarnedBadge } from "@wizards/types";

import { useMobileHaptics } from "../../app/providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../../app/providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../../app/providers/mobile-locale-provider";
import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import { MOBILE_LINE_ICON_NAMES } from "../../design/mobile-line-icon-definitions";
import type { MobileLocale } from "../../locale/mobile-locale-preferences";
import { mobileCopy } from "../../locale/mobile-copy";
import {
  PROFILE_BADGE_GLYPH_SIZE,
  PROFILE_BADGE_HIT_SLOP,
  createProfileBadgeChipStyles,
} from "./profile-badge-chips.styles";

type MobileCopy = (typeof mobileCopy)[MobileLocale];

const LINE_ICON_NAMES = new Set<string>(MOBILE_LINE_ICON_NAMES);

/**
 * The catalog carries glyphs as plain strings so it can stay platform-neutral;
 * this is the one place they become mobile icon names. `mobile-profile-badges`
 * asserts every catalog glyph resolves, so the fallback is a guard against a
 * broken catalog rather than an expected path — a missing icon must not take a
 * whole profile card down with it.
 */
export function resolveBadgeGlyph(id: BadgeId): MobileLineIconName {
  const { glyph } = BADGE_CATALOG[id];
  return LINE_ICON_NAMES.has(glyph) ? (glyph as MobileLineIconName) : "star";
}

/**
 * Tier is announced, never drawn as a numeral (04 §3). A catalog tier name wins
 * over the generic "Kademe N" frame string when the badge has one.
 */
function readBadgeLabel(badge: EarnedBadge, copy: MobileCopy, locale: MobileLocale): string {
  const definition = BADGE_CATALOG[badge.id];
  const { name, tiers } = definition.copy[locale];

  if (badge.tier <= 1) {
    return name;
  }

  const tierName =
    tiers?.[badge.tier - 1] ?? copy.profileBadgesTierLabel.replace("{tier}", String(badge.tier));
  return `${name} · ${tierName}`;
}

function BadgeChip({
  badge,
  onPress,
  testID,
}: {
  readonly badge: EarnedBadge;
  readonly onPress: (() => void) | undefined;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createProfileBadgeChipStyles);
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const tint = theme.profileBadge[BADGE_CATALOG[badge.id].tint];
  const label = readBadgeLabel(badge, copy, locale);
  const tiered = badge.tier > 1;
  const chipStyle = [
    styles.chip,
    tiered ? styles.chipTiered : null,
    { backgroundColor: tint.surface, borderColor: tiered ? tint.icon : tint.border },
  ];
  const content = (
    <>
      <MobileLineIcon
        color={tint.icon}
        name={resolveBadgeGlyph(badge.id)}
        size={PROFILE_BADGE_GLYPH_SIZE}
      />
      {badge.tier > 2 ? (
        <View
          style={[styles.tierDot, { backgroundColor: tint.icon }]}
          testID={`${testID}-tier-dot`}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityRole="image"
        style={chipStyle}
        testID={testID}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={PROFILE_BADGE_HIT_SLOP}
      onPress={onPress}
      style={chipStyle}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

export interface ProfileBadgeChipsProps {
  readonly badges: readonly EarnedBadge[];
  /** Kartta 3, sayfada 3; ileride değişirse tek yerden. */
  readonly visibleCount?: number;
  /** Rozet yükleniyor: satır yer tutar, chip çizilmez. */
  readonly loading?: boolean;
  readonly onPressBadge?: (badge: EarnedBadge) => void;
  readonly onPressOverflow?: () => void;
  /**
   * Where the row sits. The card lays it out inline next to the avatar, the 1c
   * page pins it to the identity card's top-right corner — the chips themselves
   * are identical, so only the placement is passed in.
   */
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * The one badge row in the app. The 11b card (1a/1d) and the 11c page (1c) drew
 * their own chips from two copies of the same three-badge mapping, which is how
 * the page ended up on different glyphs than the card it opens from; both now
 * render this component with the same props.
 *
 * Order comes from `splitBadgesForCard`, shared with web, so the same account
 * shows the same three chips on every surface.
 */
export function ProfileBadgeChips({
  badges,
  loading = false,
  onPressBadge,
  onPressOverflow,
  style,
  testID = "mobile-profile-badges",
  visibleCount = 3,
}: ProfileBadgeChipsProps) {
  const styles = useThemedStyles(createProfileBadgeChipStyles);
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { overflow, visible } = useMemo(
    () => splitBadgesForCard(badges, visibleCount),
    [badges, visibleCount],
  );

  if (loading) {
    return <View style={[styles.row, style]} testID={testID} />;
  }

  if (visible.length === 0) {
    return null;
  }

  const neutral = theme.profileBadge.neutral;
  const overflowLabel = copy.profileBadgesOverflow.replace("{count}", String(overflow));
  const overflowChipStyle = [
    styles.chip,
    { backgroundColor: neutral.surface, borderColor: neutral.border },
  ];

  return (
    <View style={[styles.row, style]} testID={testID}>
      {visible.map((badge) => (
        <BadgeChip
          badge={badge}
          key={badge.id}
          onPress={
            onPressBadge
              ? () => {
                  // 06 §2: the chip is the only touch target on the identity
                  // row that opens something, so it confirms itself.
                  haptics.selection();
                  onPressBadge(badge);
                }
              : undefined
          }
          testID={`${testID}-${badge.id}`}
        />
      ))}
      {overflow > 0 ? (
        onPressOverflow ? (
          <Pressable
            accessibilityLabel={overflowLabel}
            accessibilityRole="button"
            hitSlop={PROFILE_BADGE_HIT_SLOP}
            onPress={() => {
              haptics.selection();
              onPressOverflow();
            }}
            style={overflowChipStyle}
            testID={`${testID}-overflow`}
          >
            <Text maxFontSizeMultiplier={2} style={styles.overflowLabel}>
              {overflowLabel}
            </Text>
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityLabel={overflowLabel}
            accessibilityRole="text"
            style={overflowChipStyle}
            testID={`${testID}-overflow`}
          >
            <Text maxFontSizeMultiplier={2} style={styles.overflowLabel}>
              {overflowLabel}
            </Text>
          </View>
        )
      ) : null}
    </View>
  );
}
