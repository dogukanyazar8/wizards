import { Pressable, Text, View } from "react-native";

import { Avatar } from "../../app/components/kit/avatar";
import { MobileCachedImage } from "../../app/components/mobile-cached-image";
import { useMobileBannerHeight } from "../mobile-banner-frame";
import { mobileBannerContentPosition } from "../mobile-banner-offset";
import { useTheme } from "../../app/providers/mobile-theme-provider";
import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type { EarnedBadge } from "@wizards/types";

import type { MobileUserProfile } from "../mobile-social-client";
import {
  formatMobileProfileStatusLine,
  getMobileProfileCardActions,
  getMobileProfileCardVariant,
  hasMobileProfileMutuals,
  shouldShowMobileProfileRoles,
  toMobileProfileStatusTone,
  type MobileProfileCardPrimaryAction,
  type MobileProfileStatusTone,
} from "./profile-card-model";
import {
  getProfileCardStatusColor,
  ProfileActionRow,
  ProfileMutualRow,
  ProfileRoleChips,
  ProfileStatusDot,
} from "./profile-card-parts";
import { ProfileBadgeChips } from "../profile-badges/profile-badge-chips";
import {
  PROFILE_CARD_AVATAR_RADIUS,
  PROFILE_CARD_AVATAR_SIZE,
  PROFILE_CARD_WIDTH,
  useProfileCardStyles,
} from "./profile-card.styles";

const PRIMARY_ACTION_ICONS = {
  addFriend: "person-plus",
  editProfile: "edit",
  message: "chat-bubble",
  requestSent: "check",
  respondToRequest: "person-plus",
  unblock: "block",
} as const satisfies Record<MobileProfileCardPrimaryAction, MobileLineIconName>;

const PRIMARY_ACTION_LABEL_KEYS = {
  addFriend: "profileCardAddFriendAction",
  editProfile: "profileCardEditProfileAction",
  message: "profileCardMessageAction",
  requestSent: "profileCardRequestSentAction",
  respondToRequest: "profileCardIncomingRequestAction",
  unblock: "profileCardUnblockAction",
} as const satisfies Record<MobileProfileCardPrimaryAction, keyof typeof copy>;

export interface ProfileCardViewHandlers {
  onAddFriend(): void;
  onEditProfile(): void;
  onMessage(): void;
  onOpenCustomStatus(): void;
  onOpenMutuals(): void;
  onOpenStatusPicker(): void;
  onRespondToRequest(): void;
  onUnblock(): void;
  onVideoCall(): void;
  onViewProfile(): void;
  onVoiceCall(): void;
}

/**
 * Read per render, never hoisted into a module constant: `activeMobileCopy` is a
 * proxy that resolves each access against the live locale, so an object literal
 * built at import time freezes whatever language the bundle started in.
 */
function readStatusLabels(): Record<MobileProfileStatusTone, string> {
  return {
    dnd: copy.profileCardStatusDnd,
    idle: copy.profileCardStatusIdle,
    offline: copy.profileCardStatusOffline,
    online: copy.profileCardStatusOnline,
  };
}

function ProfileCardBanner({
  children,
  profile,
  variant,
}: {
  readonly children: React.ReactNode;
  readonly profile: MobileUserProfile | null;
  readonly variant: ReturnType<typeof getMobileProfileCardVariant> | null;
}) {
  const styles = useProfileCardStyles();
  const theme = useTheme();
  // The server already crops a personal banner for non-friends; the neutral fill
  // is repeated here so a stale cache can never leak one either (README 1b). A
  // card that has not resolved its variant yet (skeleton, error) keeps the brand
  // banner rather than implying "not a friend".
  const isPersonal = variant === null || variant === "friend" || variant === "self";
  const background = isPersonal
    ? (profile?.bannerColor ?? theme.profileCard.bannerDefault)
    : theme.profileCard.bannerNeutral;
  const bannerUrl = isPersonal ? (profile?.bannerUrl ?? null) : null;
  // A photo takes the identity card's proportions so the crop matches the frame
  // its owner positioned it in; the 92px strip stays for the flat-colour banner,
  // which has no framing to preserve.
  const photoHeight = useMobileBannerHeight(PROFILE_CARD_WIDTH);

  return (
    <View
      style={[
        styles.banner,
        bannerUrl ? { height: photoHeight } : null,
        { backgroundColor: background },
      ]}
      testID="mobile-profile-card-banner"
    >
      {bannerUrl ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          contentPosition={mobileBannerContentPosition(
            profile?.bannerOffsetX,
            profile?.bannerOffsetY,
          )}
          importantForAccessibility="no"
          source={{ uri: bannerUrl }}
          style={styles.bannerImage}
        />
      ) : null}
      {children}
    </View>
  );
}

/** Skeleton geometry mirrors the loaded rows so the card never jumps on arrival. */
export function ProfileCardSkeleton() {
  const styles = useProfileCardStyles();

  return (
    <View testID="mobile-profile-card-skeleton">
      <ProfileCardBanner profile={null} variant={null}>
        {null}
      </ProfileCardBanner>
      <View style={styles.body}>
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            <View
              style={[
                styles.avatar,
                styles.skeletonBlock,
                {
                  borderRadius: PROFILE_CARD_AVATAR_RADIUS,
                  height: PROFILE_CARD_AVATAR_SIZE,
                  width: PROFILE_CARD_AVATAR_SIZE,
                },
              ]}
            />
          </View>
        </View>
        <View style={[styles.skeletonBlock, styles.skeletonName]} />
        <View style={[styles.skeletonBlock, styles.skeletonUsername]} />
        <View style={[styles.skeletonBlock, styles.skeletonPresence]} />
        <View style={[styles.skeletonBlock, styles.skeletonMutual]} />
        <View style={styles.actionRow}>
          <View style={[styles.skeletonBlock, styles.skeletonActions]} />
          <View style={[styles.skeletonBlock, styles.skeletonSquare]} />
          <View style={[styles.skeletonBlock, styles.skeletonSquare]} />
        </View>
        <View style={[styles.skeletonBlock, styles.skeletonViewProfile]} />
      </View>
    </View>
  );
}

export function ProfileCardErrorState({ onRetry }: { onRetry(): void }) {
  const styles = useProfileCardStyles();
  const theme = useTheme();

  return (
    <View testID="mobile-profile-card-error">
      <ProfileCardBanner profile={null} variant={null}>
        {null}
      </ProfileCardBanner>
      <View style={styles.body}>
        <View style={styles.stateBlock}>
          <Text style={styles.stateLabel}>{copy.profileCardLoadFailed}</Text>
          <Pressable
            accessibilityLabel={copy.profileCardRetryAction}
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.viewProfileAction}
            testID="mobile-profile-card-retry"
          >
            <Text style={styles.viewProfileLabel}>{copy.profileCardRetryAction}</Text>
            <MobileLineIcon
              color={theme.profileCard.viewProfileText}
              name="chevron-right"
              size={14}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export interface ProfileCardViewProps extends ProfileCardViewHandlers {
  readonly gameActivityLabel?: string | null;
  /**
   * From the badge query, not from `profile.badges`: the profile payload's
   * field is frozen to the three 0.8.x ids (00 §2) and no longer read by any
   * screen.
   */
  readonly badges: readonly EarnedBadge[];
  /** Badges resolve on their own request; the row holds its height until then. */
  readonly badgesLoading: boolean;
  /** 06: a chip opens the detail sheet over the card; the card stays up. */
  readonly onPressBadge: ((badge: EarnedBadge) => void) | undefined;
  readonly onPressBadgeOverflow: (() => void) | undefined;
  readonly busy: boolean;
  readonly menu: React.ReactNode;
  readonly onOpenMenu: (() => void) | null;
  readonly profile: MobileUserProfile;
  readonly serverId: string | undefined;
}

/** Presentational card body; every variant in README 1a/1b/1d renders from here. */
export function ProfileCardView({
  gameActivityLabel,
  badges,
  badgesLoading,
  busy,
  menu,
  onAddFriend,
  onEditProfile,
  onMessage,
  onOpenCustomStatus,
  onOpenMenu,
  onOpenMutuals,
  onOpenStatusPicker,
  onPressBadge,
  onPressBadgeOverflow,
  onRespondToRequest,
  onUnblock,
  onVideoCall,
  onViewProfile,
  onVoiceCall,
  profile,
  serverId,
}: ProfileCardViewProps) {
  const styles = useProfileCardStyles();
  const theme = useTheme();
  const variant = getMobileProfileCardVariant(profile);
  const actions = getMobileProfileCardActions(profile);
  const displayName = profile.user.displayName ?? profile.user.username;
  const tone = toMobileProfileStatusTone(profile.presence.status);
  const isSelf = variant === "self";
  const isBlocked = variant === "blocked";
  const showRoles = shouldShowMobileProfileRoles(profile, serverId);
  const showMutuals = !isSelf && !isBlocked && hasMobileProfileMutuals(profile);
  const primary = actions.primary;
  const statusLabels = readStatusLabels();
  const statusColor = getProfileCardStatusColor(theme, tone);

  return (
    <View testID={`mobile-profile-card-variant-${variant}`}>
      <ProfileCardBanner profile={profile} variant={variant}>
        {isSelf ? (
          <Pressable
            accessibilityLabel={copy.profileCardEditAction}
            accessibilityRole="button"
            onPress={onEditProfile}
            style={styles.bannerEditChip}
            testID="mobile-profile-card-edit-chip"
          >
            <MobileLineIcon color={theme.profileCard.bannerControlText} name="edit" size={13} />
            <Text style={styles.bannerEditLabel}>{copy.profileCardEditAction}</Text>
          </Pressable>
        ) : onOpenMenu ? (
          <Pressable
            accessibilityLabel={copy.profileCardMenuAction}
            accessibilityRole="button"
            onPress={onOpenMenu}
            style={[styles.bannerAction, menu ? styles.bannerActionOpen : null]}
            testID="mobile-profile-card-menu-trigger"
          >
            <MobileLineIcon
              color={theme.profileCard.bannerControlText}
              name="dots-vertical"
              size={17}
            />
          </Pressable>
        ) : null}
      </ProfileCardBanner>
      {menu}
      <View style={styles.body}>
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            <Avatar
              avatarBorderColor={theme.surface.card}
              avatarBorderRadius={PROFILE_CARD_AVATAR_RADIUS}
              avatarBorderWidth={4}
              dimension={PROFILE_CARD_AVATAR_SIZE}
              identityId={profile.user.id}
              imageUrl={profile.user.avatarUrl}
              label={displayName}
              testID="mobile-profile-card-avatar"
            />
            <ProfileStatusDot tone={isBlocked ? "offline" : tone} />
          </View>
          {isBlocked ? null : (
            <ProfileBadgeChips
              badges={badges}
              loading={badgesLoading}
              {...(onPressBadge ? { onPressBadge } : {})}
              {...(onPressBadgeOverflow ? { onPressOverflow: onPressBadgeOverflow } : {})}
              style={styles.badgeRow}
              testID="mobile-profile-card-badges"
            />
          )}
        </View>
        <View style={styles.nameBlock}>
          <Text numberOfLines={1} style={styles.displayName} testID="mobile-profile-card-name">
            {displayName}
          </Text>
          <Text numberOfLines={1} style={styles.username}>
            {`@${profile.user.username}`}
          </Text>
        </View>
        {isBlocked ? (
          <View style={styles.stateBlock}>
            <Text style={styles.stateLabel}>{copy.profileCardBlockedNotice}</Text>
          </View>
        ) : isSelf ? (
          <>
            <Pressable
              accessibilityLabel={copy.profileCardStatusPickerAction}
              accessibilityRole="button"
              onPress={onOpenStatusPicker}
              style={styles.selfStatusRow}
              testID="mobile-profile-card-status-picker"
            >
              <View
                style={[styles.presenceDot, { backgroundColor: statusColor }]}
                testID="mobile-profile-card-self-status-dot"
              />
              <Text numberOfLines={1} style={styles.selfStatusLabel}>
                {statusLabels[tone]}
              </Text>
              <MobileLineIcon color={theme.text.visualFaint} name="chevron-down" size={15} />
            </Pressable>
            <Pressable
              accessibilityLabel={copy.profileCardAddCustomStatusAction}
              accessibilityRole="button"
              onPress={onOpenCustomStatus}
              style={styles.customStatusRow}
              testID="mobile-profile-card-custom-status"
            >
              <MobileLineIcon color={theme.text.visualFaint} name="plus" size={14} />
              <Text numberOfLines={1} style={styles.customStatusLabel}>
                {profile.presence.customStatus ?? copy.profileCardAddCustomStatusAction}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.presenceRow} testID="mobile-profile-card-presence">
            <View style={[styles.presenceDot, { backgroundColor: statusColor }]} />
            <Text
              numberOfLines={1}
              style={[styles.presenceText, tone === "offline" && styles.presenceTextOffline]}
            >
              {formatMobileProfileStatusLine({
                customStatus: profile.presence.customStatus,
                labels: statusLabels,
                status: profile.presence.status,
                template: copy.profileCardStatusWithMessageTemplate,
              })}
            </Text>
          </View>
        )}
        {!isBlocked && tone !== "offline" && gameActivityLabel ? (
          <Text style={styles.presenceText} testID="mobile-profile-game-activity">
            {gameActivityLabel}
          </Text>
        ) : null}
        {showRoles && profile.serverContext ? (
          <ProfileRoleChips
            roles={profile.serverContext.roles}
            serverName={profile.serverContext.serverName}
          />
        ) : null}
        {showMutuals ? (
          <ProfileMutualRow
            mutualFriends={profile.mutualFriends}
            mutualServers={profile.mutualServers}
            onPress={onOpenMutuals}
          />
        ) : null}
        {primary ? (
          <ProfileActionRow
            busy={busy}
            disabled={actions.primaryDisabled}
            icon={PRIMARY_ACTION_ICONS[primary]}
            label={copy[PRIMARY_ACTION_LABEL_KEYS[primary]]}
            onPress={
              primary === "message"
                ? onMessage
                : primary === "addFriend"
                  ? onAddFriend
                  : primary === "respondToRequest"
                    ? onRespondToRequest
                    : primary === "editProfile"
                      ? onEditProfile
                      : primary === "unblock"
                        ? onUnblock
                        : () => undefined
            }
            onPressMessage={onMessage}
            onPressVideoCall={onVideoCall}
            onPressVoiceCall={onVoiceCall}
            showCalls={actions.calls}
            showMessageSquare={actions.secondaryMessage}
          />
        ) : null}
        {actions.viewProfile ? (
          <Pressable
            accessibilityLabel={copy.profileCardViewProfileAction}
            accessibilityRole="button"
            onPress={onViewProfile}
            style={styles.viewProfileAction}
            testID="mobile-profile-card-view-profile"
          >
            <Text style={styles.viewProfileLabel}>{copy.profileCardViewProfileAction}</Text>
            <MobileLineIcon
              color={theme.profileCard.viewProfileText}
              name="chevron-right"
              size={14}
            />
          </Pressable>
        ) : null}
        {actions.callsDisabledNotice ? (
          <View style={styles.noticeRow} testID="mobile-profile-card-calls-notice">
            <MobileLineIcon color={theme.text.visualPlaceholder} name="info" size={12} />
            <Text style={styles.noticeLabel}>{copy.profileCardCallsDisabledNotice}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
