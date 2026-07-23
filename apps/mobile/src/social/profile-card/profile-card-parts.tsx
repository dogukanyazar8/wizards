import { Pressable, Text, View } from "react-native";

import { Avatar } from "../../app/components/kit/avatar";
import { useTheme } from "../../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../../design/themes";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type {
  MobileProfileBadgeName,
  MobileProfileRoleBadge,
  MobileUserProfile,
} from "../mobile-social-client";
import {
  formatMobileProfileMutualSummary,
  toMobileProfileRoleColor,
  type MobileProfileStatusTone,
} from "./profile-card-model";
import {
  PROFILE_CARD_MUTUAL_AVATAR_SIZE,
  useProfileCardStyles,
} from "./profile-card.styles";

type ProfileCardStyles = ReturnType<typeof useProfileCardStyles>;

const STATUS_DOT_STYLE_KEY = {
  dnd: "statusDotDnd",
  idle: "statusDotIdle",
  offline: "statusDotOffline",
  online: "statusDotOnline",
} as const satisfies Record<MobileProfileStatusTone, keyof ProfileCardStyles>;

/**
 * Fill for the flat 9px presence dot the status rows draw. One mapping so the
 * peer row and your own status row can never disagree about what DND looks
 * like — they did, and your own card showed green in every state.
 */
export function getProfileCardStatusColor(theme: MobileTheme, tone: MobileProfileStatusTone) {
  switch (tone) {
    case "online":
      return theme.profileCard.statusOnline;
    case "idle":
      return theme.profileCard.statusIdle;
    case "dnd":
      return theme.profileCard.statusDnd;
    default:
      return theme.profileCard.statusOffline;
  }
}

/**
 * 18px presence dot with the 3px card-coloured ring from the handoff. Offline is
 * drawn hollow — a ring in the muted tone rather than a filled grey circle.
 */
export function ProfileStatusDot({
  testID = "mobile-profile-card-status-dot",
  tone,
}: {
  readonly testID?: string;
  readonly tone: MobileProfileStatusTone;
}) {
  const styles = useProfileCardStyles();
  return <View style={[styles.statusDot, styles[STATUS_DOT_STYLE_KEY[tone]]]} testID={testID} />;
}

const BADGE_ICONS = {
  earlyMember: "star",
  inviter: "person-plus",
  supporter: "bolt",
} as const;

const BADGE_LABEL_KEYS = {
  earlyMember: "profileCardBadgeEarlyMember",
  inviter: "profileCardBadgeInviter",
  supporter: "profileCardBadgeSupporter",
} as const;

/** 28×28 r10 chips; the three tints are fixed per badge, not derived from the id. */
export function ProfileBadgeChips({ badges }: { readonly badges: readonly MobileProfileBadgeName[] }) {
  const styles = useProfileCardStyles();
  const theme = useTheme();
  const card = theme.profileCard;
  const tints = {
    earlyMember: {
      borderColor: card.badgeEarlyBorder,
      backgroundColor: card.badgeEarlySurface,
      icon: card.badgeEarlyIcon,
    },
    inviter: {
      borderColor: card.badgeInviterBorder,
      backgroundColor: card.badgeInviterSurface,
      icon: card.badgeInviterIcon,
    },
    supporter: {
      borderColor: card.badgeSupporterBorder,
      backgroundColor: card.badgeSupporterSurface,
      icon: card.badgeSupporterIcon,
    },
  } as const;

  if (badges.length === 0) {
    return null;
  }

  return (
    <View style={styles.badgeRow} testID="mobile-profile-card-badges">
      {badges.map((badge) => {
        const tint = tints[badge];
        return (
          <View
            key={badge}
            style={[
              styles.badge,
              { backgroundColor: tint.backgroundColor, borderColor: tint.borderColor },
            ]}
            testID={`mobile-profile-card-badge-${badge}`}
          >
            <MobileLineIcon
              accessibilityLabel={copy[BADGE_LABEL_KEYS[badge]]}
              color={tint.icon}
              name={BADGE_ICONS[badge]}
              size={14}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Role chips take their colour from the server payload, never from a hash of the
 * role id — the same role has to read the same colour everywhere.
 */
export function ProfileRoleChips({
  roles,
  serverName,
}: {
  readonly roles: readonly MobileProfileRoleBadge[];
  readonly serverName: string;
}) {
  const styles = useProfileCardStyles();
  const theme = useTheme();

  return (
    <View style={styles.rolesBlock} testID="mobile-profile-card-roles">
      <Text style={styles.rolesHeading}>
        {copy.profileCardRolesHeadingTemplate.replace("{server}", serverName.toLocaleUpperCase())}
      </Text>
      <View style={styles.roleChips}>
        {roles.map((role) => (
          <View
            key={role.id}
            style={styles.roleChip}
            testID={`mobile-profile-card-role-${role.id}`}
          >
            <View
              style={[
                styles.roleChipDot,
                {
                  backgroundColor:
                    toMobileProfileRoleColor(role.color) ?? theme.profileCard.roleChipText,
                },
              ]}
            />
            <Text numberOfLines={1} style={styles.roleChipLabel}>
              {role.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Overlapping 22px server marks + the "N ortak sunucu · M ortak arkadaş" summary. */
export function ProfileMutualRow({
  mutualFriends,
  mutualServers,
  onPress,
}: {
  readonly mutualFriends: MobileUserProfile["mutualFriends"];
  readonly mutualServers: MobileUserProfile["mutualServers"];
  onPress?(): void;
}) {
  const styles = useProfileCardStyles();
  const theme = useTheme();
  const label = formatMobileProfileMutualSummary({
    friendCount: mutualFriends.count,
    friendsNone: copy.profileCardMutualFriendsNone,
    friendsTemplate: copy.profileCardMutualFriendsTemplate,
    serverCount: mutualServers.count,
    serversNone: copy.profileCardMutualServersNone,
    serversTemplate: copy.profileCardMutualServersTemplate,
    summaryTemplate: copy.profileCardMutualSummaryTemplate,
  });

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={styles.mutualRow}
      testID="mobile-profile-card-mutuals"
    >
      <View style={styles.mutualAvatars}>
        {mutualServers.preview.slice(0, 3).map((server, index) => (
          <Avatar
            avatarBorderColor={theme.profileCard.mutualAvatarRing}
            avatarBorderRadius={8}
            avatarBorderWidth={2}
            dimension={PROFILE_CARD_MUTUAL_AVATAR_SIZE}
            identityId={server.id}
            imageUrl={server.iconUrl}
            key={server.id}
            label={server.shortName ?? server.name}
            style={index > 0 ? styles.mutualAvatarStacked : undefined}
          />
        ))}
      </View>
      <Text numberOfLines={1} style={styles.mutualLabel}>
        {label}
      </Text>
      <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={15} />
    </Pressable>
  );
}

export interface ProfileActionRowProps {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly showCalls: boolean;
  readonly showMessageSquare: boolean;
  readonly icon: Parameters<typeof MobileLineIcon>[0]["name"];
  onPress(): void;
  onPressMessage?(): void;
  onPressVideoCall?(): void;
  onPressVoiceCall?(): void;
}

/** "Mesaj" primary + 44px call squares (1a), or the add-friend + message pair (1b). */
export function ProfileActionRow({
  busy,
  disabled,
  icon,
  label,
  onPress,
  onPressMessage,
  onPressVideoCall,
  onPressVoiceCall,
  showCalls,
  showMessageSquare,
}: ProfileActionRowProps) {
  const styles = useProfileCardStyles();
  const theme = useTheme();
  const isInert = disabled || busy;

  return (
    <View style={styles.actionRow} testID="mobile-profile-card-actions">
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isInert }}
        disabled={isInert}
        onPress={onPress}
        style={[styles.primaryAction, isInert && styles.primaryActionDisabled]}
        testID="mobile-profile-card-primary-action"
      >
        <MobileLineIcon color={theme.text.onPrimary} name={icon} size={16} />
        <Text numberOfLines={1} style={styles.primaryActionLabel}>
          {label}
        </Text>
      </Pressable>
      {showMessageSquare ? (
        <Pressable
          accessibilityLabel={copy.profileCardMessageAction}
          accessibilityRole="button"
          onPress={onPressMessage}
          style={styles.squareAction}
          testID="mobile-profile-card-message-action"
        >
          <MobileLineIcon
            color={theme.profileCard.secondaryActionIcon}
            name="chat-bubble"
            size={17}
          />
        </Pressable>
      ) : null}
      {showCalls ? (
        <>
          <Pressable
            accessibilityLabel={copy.profileCardVoiceCallAction}
            accessibilityRole="button"
            onPress={onPressVoiceCall}
            style={styles.squareAction}
            testID="mobile-profile-card-voice-action"
          >
            <MobileLineIcon
              color={theme.profileCard.secondaryActionIcon}
              name="phone"
              size={17}
            />
          </Pressable>
          <Pressable
            accessibilityLabel={copy.profileCardVideoCallAction}
            accessibilityRole="button"
            onPress={onPressVideoCall}
            style={styles.squareAction}
            testID="mobile-profile-card-video-action"
          >
            <MobileLineIcon
              color={theme.profileCard.secondaryActionIcon}
              name="video"
              size={17}
            />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
