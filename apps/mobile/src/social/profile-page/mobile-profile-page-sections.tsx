import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { EarnedBadge } from "@wizards/types";

import { Avatar, Skeleton } from "../../app/components/kit";
import { MobileCachedImage } from "../../app/components/mobile-cached-image";
import { useMobileBannerHeight } from "../mobile-banner-frame";
import { mobileBannerContentPosition } from "../mobile-banner-offset";
import { useTheme, useThemedStyles } from "../../app/providers/mobile-theme-provider";
import { getMobileAvatarTint } from "../../design/mobile-avatar-color";
import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import type { MobileTheme } from "../../design/themes";
import type { MobileLocale } from "../../locale/mobile-locale-preferences";
import type { MobileUserProfile } from "../mobile-social-client";
import { ProfileBadgeChips } from "../profile-badges/profile-badge-chips";
import {
  MOBILE_PROFILE_PAGE_METRICS as METRICS,
  createMobileProfilePageStyles,
} from "./mobile-profile-page.styles";
import {
  formatMobileProfileMutualFriendsSummary,
  formatMobileProfileMutualServerSubtitle,
  formatMobileProfileServerJoin,
  formatMobileProfileWhisprJoin,
  getMobileProfileMutualFriendsOverflow,
  getMobileProfileRoleColor,
  type MobileProfileCopy,
  type MobileProfileMutualServerRow,
  type MobileProfilePageSections,
} from "./mobile-profile-page-model";

type Styles = ReturnType<typeof createMobileProfilePageStyles>;

export interface MobileProfilePageChrome {
  readonly copy: MobileProfileCopy;
  readonly locale: MobileLocale;
  readonly styles: Styles;
}

/** How many stacked avatars the mutual-friends row draws before the "+N" chip. */
export const MOBILE_PROFILE_MUTUAL_FRIEND_AVATAR_LIMIT = 4;
/** 1c shows three squares; the rest lives behind "Tümünü gör". */
export const MOBILE_PROFILE_MEDIA_PREVIEW_LIMIT = 3;
/** Mutual servers collapse to this many rows until "Tümünü gör" expands the card. */
export const MOBILE_PROFILE_MUTUAL_SERVER_COLLAPSED_LIMIT = 3;

export function getMobileProfilePresenceColor(
  theme: MobileTheme,
  status: MobileUserProfile["presence"]["status"],
): string {
  switch (status) {
    case "ONLINE":
      return theme.profileCard.statusOnline;
    case "IDLE":
      return theme.profileCard.statusIdle;
    case "DND":
      return theme.profileCard.statusDnd;
    default:
      return theme.profileCard.statusOffline;
  }
}

export function getMobileProfilePresenceLabel(
  status: MobileUserProfile["presence"]["status"],
  copy: MobileProfileCopy,
): string {
  switch (status) {
    case "ONLINE":
      return copy.friendsStatusOnline;
    case "IDLE":
      return copy.friendsStatusIdle;
    case "DND":
      return copy.friendsStatusDnd;
    default:
      return copy.friendsStatusOffline;
  }
}

export function ProfilePageBanner({
  bannerColor,
  bannerOffsetX,
  bannerOffsetY,
  bannerUrl,
  copy,
  menuOpen,
  onBack,
  onOpenMenu,
  safeAreaTop,
  styles,
}: {
  readonly bannerColor: string;
  readonly bannerOffsetX: number | null;
  readonly bannerOffsetY: number | null;
  readonly bannerUrl: string | null;
  readonly copy: MobileProfileCopy;
  readonly menuOpen: boolean;
  readonly onBack: () => void;
  readonly onOpenMenu: () => void;
  readonly safeAreaTop: number;
  readonly styles: Styles;
}) {
  const theme = useTheme();
  // Same rule as the card: a photo is framed like the identity card the owner
  // positioned it in, a flat colour keeps the handoff's 148px strip.
  const photoHeight = useMobileBannerHeight(null);

  return (
    <View
      style={[
        styles.banner,
        bannerUrl ? { height: photoHeight } : null,
        { backgroundColor: bannerColor },
      ]}
      testID="mobile-user-profile-banner"
    >
      {bannerUrl ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          contentPosition={mobileBannerContentPosition(bannerOffsetX, bannerOffsetY)}
          importantForAccessibility="no"
          source={{ uri: bannerUrl }}
          style={styles.bannerImage}
        />
      ) : null}
      <View style={[styles.bannerNav, { top: safeAreaTop + METRICS.bannerNavPaddingTop }]}>
        <Pressable
          accessibilityLabel={copy.profilePageBackAction}
          accessibilityRole="button"
          hitSlop={styles.bannerControlHitSlop}
          onPress={onBack}
          style={({ pressed }) => [styles.bannerControl, pressed && styles.bannerControlActive]}
          testID="mobile-user-profile-back"
        >
          <MobileLineIcon color={theme.profileCard.bannerControlText} name="back-arrow" size={18} />
        </Pressable>
        <Pressable
          accessibilityLabel={copy.profilePageMoreAction}
          accessibilityRole="button"
          hitSlop={styles.bannerControlHitSlop}
          onPress={onOpenMenu}
          style={({ pressed }) => [
            styles.bannerControl,
            (pressed || menuOpen) && styles.bannerControlActive,
          ]}
          testID="mobile-user-profile-menu"
        >
          <MobileLineIcon
            color={theme.profileCard.bannerControlText}
            name="dots-vertical"
            size={17}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function ProfileIdentityCard({
  actions,
  badges,
  badgesLoading,
  chrome,
  onPressBadge,
  onPressBadgeOverflow,
  profile,
  sections,
}: {
  readonly actions: ReactNode;
  /** From the badge query; `profile.badges` is frozen and no longer read (00 §2). */
  readonly badges: readonly EarnedBadge[];
  readonly badgesLoading: boolean;
  readonly chrome: MobileProfilePageChrome;
  /** 06: a chip opens the shared detail sheet over the page. */
  readonly onPressBadge: ((badge: EarnedBadge) => void) | undefined;
  readonly onPressBadgeOverflow: (() => void) | undefined;
  readonly profile: MobileUserProfile;
  readonly sections: MobileProfilePageSections;
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;
  const name = profile.user.displayName?.trim() || profile.user.username;
  const presenceLabel = getMobileProfilePresenceLabel(profile.presence.status, copy);
  const statusLine = profile.presence.customStatus
    ? copy.profilePageStatusWithMessage
        .replace("{presence}", presenceLabel)
        .replace("{message}", profile.presence.customStatus)
    : presenceLabel;

  return (
    <View style={styles.identityCard} testID="mobile-user-profile-identity">
      <View style={styles.identityAvatarSlot}>
        <View style={styles.identityAvatarFrame}>
          <Avatar
            avatarBorderColor={theme.surface.card}
            avatarBorderRadius={METRICS.avatarRadius}
            avatarBorderWidth={METRICS.avatarBorder}
            dimension={METRICS.avatar}
            fallbackTextStyle={styles.identityAvatarInitials}
            identityId={profile.user.id}
            imageUrl={profile.user.avatarUrl}
            label={name}
            style={styles.identityAvatar}
            testID="mobile-user-profile-avatar"
          />
          <View
            style={[
              styles.identityPresenceDot,
              { backgroundColor: getMobileProfilePresenceColor(theme, profile.presence.status) },
            ]}
            testID="mobile-user-profile-presence-dot"
          />
        </View>
      </View>
      <ProfileBadgeChips
        badges={badges}
        loading={badgesLoading}
        {...(onPressBadge ? { onPressBadge } : {})}
        {...(onPressBadgeOverflow ? { onPressOverflow: onPressBadgeOverflow } : {})}
        style={styles.identityBadges}
        testID="mobile-user-profile-badges"
      />
      <View style={styles.identityNameBlock}>
        <Text numberOfLines={1} style={styles.identityName}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.identityUsername}>
          @{profile.user.username}
        </Text>
      </View>
      <View style={styles.identityStatusRow}>
        <View
          style={[
            styles.identityStatusDot,
            { backgroundColor: getMobileProfilePresenceColor(theme, profile.presence.status) },
          ]}
        />
        <Text
          numberOfLines={1}
          style={styles.identityStatusLabel}
          testID="mobile-user-profile-status"
        >
          {statusLine}
        </Text>
      </View>
      {sections.roles.visible ? (
        <View style={styles.roleChipRow} testID="mobile-user-profile-roles">
          {sections.roles.items.map((role) => (
            <View key={role.id} style={styles.roleChip}>
              <View
                style={[
                  styles.roleChipDot,
                  {
                    backgroundColor:
                      getMobileProfileRoleColor(role.color) ?? theme.profileCard.roleChipText,
                  },
                ]}
              />
              <Text numberOfLines={1} style={styles.roleChipLabel}>
                {role.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {actions}
    </View>
  );
}

export function ProfileSectionCard({
  action,
  children,
  heading,
  listBottom = false,
  onAction,
  styles,
  testID,
}: {
  readonly action?: string | undefined;
  readonly children: ReactNode;
  readonly heading: string;
  readonly listBottom?: boolean;
  readonly onAction?: (() => void) | undefined;
  readonly styles: Styles;
  readonly testID: string;
}) {
  return (
    <View style={[styles.sectionCard, listBottom && styles.sectionCardListBottom]} testID={testID}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{heading}</Text>
        {action && onAction ? (
          <Pressable
            accessibilityLabel={action}
            accessibilityRole="button"
            hitSlop={styles.sectionActionHitSlop}
            onPress={onAction}
            testID={`${testID}-action`}
          >
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ProfileAboutCard({
  chrome,
  sections,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly sections: MobileProfilePageSections;
}) {
  const theme = useTheme();
  const { copy, locale, styles } = chrome;
  const { about } = sections;
  const whisprJoin = formatMobileProfileWhisprJoin(about.registeredAt, locale, copy);
  const serverJoin =
    about.joinedServerAt && about.serverName
      ? formatMobileProfileServerJoin(about.joinedServerAt, about.serverName, locale, copy)
      : null;

  return (
    <ProfileSectionCard
      heading={copy.profilePageAboutHeading}
      styles={styles}
      testID="mobile-user-profile-about"
    >
      {about.bio ? <Text style={styles.aboutBio}>{about.bio}</Text> : null}
      <View style={[about.bio ? styles.aboutDivider : styles.aboutMetaRowSpaced]}>
        <View style={styles.aboutMetaRow}>
          <MobileLineIcon color={theme.text.visualFaint} name="calendar" size={METRICS.metaGlyph} />
          <Text style={styles.aboutMetaLabel} testID="mobile-user-profile-registered-at">
            {whisprJoin}
          </Text>
        </View>
      </View>
      {serverJoin ? (
        <View style={[styles.aboutMetaRow, styles.aboutMetaRowSpaced]}>
          <MobileLineIcon color={theme.text.visualFaint} name="servers" size={METRICS.metaGlyph} />
          <Text style={styles.aboutMetaLabel} testID="mobile-user-profile-server-joined-at">
            {serverJoin}
          </Text>
        </View>
      ) : null}
    </ProfileSectionCard>
  );
}

export function ProfileNoteCard({
  chrome,
  note,
  onPress,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly note: string | null;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;

  return (
    <ProfileSectionCard
      heading={copy.profilePageNoteHeading}
      styles={styles}
      testID="mobile-user-profile-note"
    >
      <Pressable
        accessibilityLabel={note ? copy.profilePageEditNoteAction : copy.profilePageAddNoteAction}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.noteField, pressed && styles.actionPressed]}
        testID="mobile-user-profile-note-field"
      >
        <MobileLineIcon color={theme.text.visualFaint} name="edit" size={METRICS.metaGlyph} />
        <Text numberOfLines={3} style={[styles.notePlaceholder, note ? styles.noteValue : null]}>
          {note ?? copy.profilePageNotePlaceholder}
        </Text>
      </Pressable>
    </ProfileSectionCard>
  );
}

export function ProfileMutualServersCard({
  chrome,
  expanded,
  onOpenServer,
  onToggleExpanded,
  sections,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly expanded: boolean;
  readonly onOpenServer: (serverId: string) => void;
  readonly onToggleExpanded: () => void;
  readonly sections: MobileProfilePageSections;
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;
  const rows = expanded
    ? sections.mutualServers.rows
    : sections.mutualServers.rows.slice(0, MOBILE_PROFILE_MUTUAL_SERVER_COLLAPSED_LIMIT);
  const canExpand =
    sections.mutualServers.rows.length > MOBILE_PROFILE_MUTUAL_SERVER_COLLAPSED_LIMIT;

  return (
    <ProfileSectionCard
      {...(canExpand
        ? {
            action: expanded ? copy.profilePageCollapseAction : copy.profilePageSeeAllAction,
            onAction: onToggleExpanded,
          }
        : {})}
      heading={copy.profilePageMutualServersHeading.replace(
        "{count}",
        String(sections.mutualServers.count),
      )}
      listBottom
      styles={styles}
      testID="mobile-user-profile-mutual-servers"
    >
      {rows.map((row, index) => (
        <ProfileMutualServerRow
          chrome={chrome}
          divided={index < rows.length - 1}
          key={row.id}
          onPress={() => onOpenServer(row.id)}
          row={row}
          theme={theme}
        />
      ))}
    </ProfileSectionCard>
  );
}

function ProfileMutualServerRow({
  chrome,
  divided,
  onPress,
  row,
  theme,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly divided: boolean;
  readonly onPress: () => void;
  readonly row: MobileProfileMutualServerRow;
  readonly theme: MobileTheme;
}) {
  const { copy, styles } = chrome;
  const tint = getMobileAvatarTint(row.id, theme);
  const initials = (row.shortName ?? row.name).trim().slice(0, 2).toLocaleUpperCase("tr-TR");

  return (
    <Pressable
      accessibilityLabel={row.name}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.serverRow,
        divided && styles.serverRowDivided,
        pressed && styles.actionPressed,
      ]}
      testID={`mobile-user-profile-mutual-server-${row.id}`}
    >
      <View style={[styles.serverAvatar, { backgroundColor: tint.bg }]}>
        {row.iconUrl ? (
          <MobileCachedImage
            accessibilityIgnoresInvertColors
            importantForAccessibility="no"
            source={{ uri: row.iconUrl }}
            style={styles.mediaThumbnail}
          />
        ) : (
          <Text style={[styles.serverAvatarInitials, { color: tint.fg }]}>{initials}</Text>
        )}
      </View>
      <View style={styles.serverRowBody}>
        <Text numberOfLines={1} style={styles.serverRowName}>
          {row.name}
        </Text>
        <Text numberOfLines={1} style={styles.serverRowMeta}>
          {formatMobileProfileMutualServerSubtitle(row, copy)}
        </Text>
      </View>
      <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={15} />
    </Pressable>
  );
}

export function ProfileMutualFriendsCard({
  chrome,
  expanded,
  onOpenFriend,
  onToggleExpanded,
  sections,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly expanded: boolean;
  readonly onOpenFriend: (userId: string) => void;
  readonly onToggleExpanded: () => void;
  readonly sections: MobileProfilePageSections;
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;
  const visible = sections.mutualFriends.preview.slice(
    0,
    MOBILE_PROFILE_MUTUAL_FRIEND_AVATAR_LIMIT,
  );
  const overflow = getMobileProfileMutualFriendsOverflow(
    sections.mutualFriends,
    MOBILE_PROFILE_MUTUAL_FRIEND_AVATAR_LIMIT,
  );
  // The stack only ever draws four faces, so "Tümünü gör" appears as soon as the
  // payload carries a fifth. 11a caps the preview itself, which is why the
  // expanded list can be shorter than the heading count.
  const canExpand = sections.mutualFriends.preview.length > visible.length;

  return (
    <ProfileSectionCard
      {...(canExpand
        ? {
            action: expanded ? copy.profilePageCollapseAction : copy.profilePageSeeAllAction,
            onAction: onToggleExpanded,
          }
        : {})}
      heading={copy.profilePageMutualFriendsHeading.replace(
        "{count}",
        String(sections.mutualFriends.count),
      )}
      styles={styles}
      testID="mobile-user-profile-mutual-friends"
    >
      {expanded && canExpand ? (
        <View style={styles.mutualFriendsList} testID="mobile-user-profile-mutual-friends-list">
          {sections.mutualFriends.preview.map((friend, index) => {
            const label = friend.displayName?.trim() || friend.username;
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                key={friend.id}
                onPress={() => onOpenFriend(friend.id)}
                style={({ pressed }) => [
                  styles.mutualFriendRow,
                  index < sections.mutualFriends.preview.length - 1 &&
                    styles.mutualFriendRowDivided,
                  pressed && styles.actionPressed,
                ]}
                testID={`mobile-user-profile-mutual-friend-${friend.id}`}
              >
                <Avatar
                  avatarBorderColor={theme.surface.card}
                  avatarBorderRadius={METRICS.mutualAvatarRadius}
                  avatarBorderWidth={METRICS.mutualAvatarBorder}
                  dimension={METRICS.mutualAvatar}
                  fallbackTextStyle={styles.mutualFriendInitials}
                  identityId={friend.id}
                  imageUrl={friend.avatarUrl}
                  label={label}
                  style={styles.mutualFriendAvatar}
                />
                <View style={styles.mutualFriendRowBody}>
                  <Text numberOfLines={1} style={styles.mutualFriendRowName}>
                    {label}
                  </Text>
                  <Text numberOfLines={1} style={styles.mutualFriendRowMeta}>
                    @{friend.username}
                  </Text>
                </View>
                <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={15} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.mutualFriendsRow}>
          <View style={styles.mutualFriendsStack}>
            {visible.map((friend, index) => (
              <Pressable
                accessibilityLabel={friend.displayName?.trim() || friend.username}
                accessibilityRole="button"
                key={friend.id}
                onPress={() => onOpenFriend(friend.id)}
                style={index > 0 ? styles.mutualFriendAvatarStacked : undefined}
                testID={`mobile-user-profile-mutual-friend-${friend.id}`}
              >
                <Avatar
                  avatarBorderColor={theme.surface.card}
                  avatarBorderRadius={METRICS.mutualAvatarRadius}
                  avatarBorderWidth={METRICS.mutualAvatarBorder}
                  dimension={METRICS.mutualAvatar}
                  fallbackTextStyle={styles.mutualFriendInitials}
                  identityId={friend.id}
                  imageUrl={friend.avatarUrl}
                  label={friend.displayName?.trim() || friend.username}
                  style={styles.mutualFriendAvatar}
                />
              </Pressable>
            ))}
            {overflow > 0 ? (
              <View
                style={[
                  styles.mutualFriendAvatar,
                  styles.mutualFriendOverflow,
                  visible.length > 0 ? styles.mutualFriendAvatarStacked : undefined,
                ]}
                testID="mobile-user-profile-mutual-friend-overflow"
              >
                <Text style={[styles.mutualFriendInitials, styles.mutualFriendOverflowLabel]}>
                  +{overflow}
                </Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={2} style={styles.mutualFriendsSummary}>
            {formatMobileProfileMutualFriendsSummary(sections.mutualFriends, copy)}
          </Text>
        </View>
      )}
    </ProfileSectionCard>
  );
}

export interface MobileProfileMediaItem {
  /** Only set when the attachment carries real duration metadata (`0:42`). */
  readonly durationLabel: string | null;
  readonly id: string;
  readonly isVideo: boolean;
  /** Poster frame or photo; null for a video that produced neither. */
  readonly uri: string | null;
}

export function ProfileSharedMediaCard({
  chrome,
  items,
  onOpenItem,
  onSeeAll,
  totalCount,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly items: readonly MobileProfileMediaItem[];
  readonly onOpenItem: (index: number) => void;
  readonly onSeeAll: (() => void) | null;
  readonly totalCount: number;
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;
  const preview = items.slice(0, MOBILE_PROFILE_MEDIA_PREVIEW_LIMIT);

  return (
    <ProfileSectionCard
      {...(onSeeAll && preview.length > 0
        ? { action: copy.profilePageSeeAllAction, onAction: onSeeAll }
        : {})}
      heading={copy.profilePageSharedMediaHeading.replace("{count}", String(totalCount))}
      styles={styles}
      testID="mobile-user-profile-shared-media"
    >
      {preview.length === 0 ? (
        <Text style={styles.mediaEmpty} testID="mobile-user-profile-media-empty">
          {copy.profilePageMediaEmpty}
        </Text>
      ) : (
        <View style={styles.mediaRow}>
          {preview.map((item, index) => (
            <Pressable
              accessibilityLabel={
                item.durationLabel
                  ? copy.sharedMediaVideoLabelTemplate.replace("{duration}", item.durationLabel)
                  : copy.profilePageOpenMediaAction
              }
              accessibilityRole="imagebutton"
              key={item.id}
              onPress={() => onOpenItem(index)}
              style={({ pressed }) => [styles.mediaTile, pressed && styles.actionPressed]}
              testID={`mobile-user-profile-media-${item.id}`}
            >
              {item.uri ? (
                <MobileCachedImage
                  accessibilityIgnoresInvertColors
                  importantForAccessibility="no"
                  source={{ uri: item.uri }}
                  style={styles.mediaThumbnail}
                />
              ) : null}
              {/* A video reads as a video whether or not it produced a poster. */}
              {item.isVideo ? (
                <View style={styles.mediaVideoGlyph}>
                  <MobileLineIcon
                    color={item.uri ? theme.text.onPrimary : theme.profileCard.secondaryActionIcon}
                    name="play-circle"
                    size={26}
                  />
                </View>
              ) : null}
              {item.durationLabel ? (
                <View
                  style={styles.mediaDurationBadge}
                  testID={`mobile-user-profile-media-duration-${item.id}`}
                >
                  <Text maxFontSizeMultiplier={2} style={styles.mediaDurationLabel}>
                    {item.durationLabel}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </ProfileSectionCard>
  );
}

export interface MobileProfilePageMenuItem {
  readonly destructive?: boolean;
  readonly icon: MobileLineIconName;
  readonly id: string;
  readonly label: string;
  onPress(): void;
}

/**
 * The 196px anchored menu handoff 1b/1c hangs off the three-dot control. The
 * page used to raise a bottom sheet here, which is the same actions in the wrong
 * shape — and a different shape from the card that opens this page. The backdrop
 * takes the outside tap, so the page underneath cannot scroll out from under it.
 */
export function ProfilePageMenu({
  chrome,
  items,
  onDismiss,
}: {
  readonly chrome: MobileProfilePageChrome;
  readonly items: readonly MobileProfilePageMenuItem[];
  readonly onDismiss: () => void;
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;

  return (
    <>
      <Pressable
        accessibilityLabel={copy.profilePageCloseMenuAction}
        accessibilityRole="button"
        onPress={onDismiss}
        style={styles.menuBackdrop}
        testID="mobile-user-profile-menu-backdrop"
      />
      <View accessibilityRole="menu" style={styles.menu} testID="mobile-user-profile-menu-popover">
        {items.map((item, index) => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="menuitem"
            key={item.id}
            onPress={() => {
              onDismiss();
              item.onPress();
            }}
            style={({ pressed }) => [
              styles.menuItem,
              index < items.length - 1 && styles.menuItemDivided,
              pressed && styles.menuItemPressed,
            ]}
            testID={`mobile-user-profile-menu-${item.id}`}
          >
            <MobileLineIcon
              color={item.destructive ? theme.status.dangerOnBase : theme.profileCard.menuIcon}
              name={item.icon}
              size={15}
            />
            <Text style={[styles.menuLabel, item.destructive && styles.menuLabelDanger]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

export function ProfileStateNotice({
  actionLabel,
  chrome,
  message,
  onRetry,
}: {
  readonly actionLabel: string;
  readonly chrome: MobileProfilePageChrome;
  readonly message: string;
  readonly onRetry: () => void;
}) {
  const theme = useTheme();
  const { styles } = chrome;

  return (
    <View style={styles.stateNotice} testID="mobile-user-profile-error">
      <MobileLineIcon color={theme.status.dangerOnBase} name="alert-circle" size={18} />
      <Text style={styles.stateNoticeLabel}>{message}</Text>
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        hitSlop={styles.sectionActionHitSlop}
        onPress={onRetry}
        testID="mobile-user-profile-retry"
      >
        <Text style={styles.stateNoticeAction}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

/** Section-shaped skeletons: same card geometry as the loaded page, no layout jump. */
export function ProfilePageSkeleton() {
  const styles = useThemedStyles(createMobileProfilePageStyles);

  return (
    <View testID="mobile-user-profile-skeleton">
      <View style={styles.identityCard}>
        <View style={styles.identityNameBlock}>
          <Skeleton height={26} width={168} />
          <Skeleton height={18} width={112} />
        </View>
        <View style={styles.identityStatusRow}>
          <Skeleton borderRadius={999} height={METRICS.statusDot} width={METRICS.statusDot} />
          <Skeleton height={17} width={196} />
        </View>
        <View style={styles.actionRow}>
          <Skeleton
            borderRadius={14}
            height={METRICS.secondaryAction}
            style={styles.skeletonStack}
          />
          <Skeleton
            borderRadius={14}
            height={METRICS.secondaryAction}
            width={METRICS.secondaryAction}
          />
          <Skeleton
            borderRadius={14}
            height={METRICS.secondaryAction}
            width={METRICS.secondaryAction}
          />
        </View>
      </View>
      <View style={styles.sectionCard}>
        <Skeleton height={14} width={96} />
        <View style={styles.skeletonStack}>
          <Skeleton height={20} style={styles.aboutBio} />
          <Skeleton height={17} width="70%" />
        </View>
      </View>
      <View style={styles.sectionCard}>
        <Skeleton height={14} width={148} />
        <View style={styles.skeletonRow}>
          <Skeleton
            borderRadius={METRICS.serverAvatarRadius}
            height={METRICS.serverAvatar}
            width={METRICS.serverAvatar}
          />
          <View style={styles.skeletonStack}>
            <Skeleton height={19} width="60%" />
            <Skeleton height={15} width="40%" />
          </View>
        </View>
      </View>
    </View>
  );
}
