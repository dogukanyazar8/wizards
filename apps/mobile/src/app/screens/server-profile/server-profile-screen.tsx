import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import type {
  ServerNotificationLevel,
  ServerPublicProfile,
  ServerPublicProfileAdmin,
  ServerPublicProfileChannel,
} from "@wizards/types";

import {
  buildMobileCommunityInviteUrl,
  buildMobileServerProfileUrl,
  fetchMobileCommunityInvitePreview,
  fetchMobileServerProfile,
  joinMobileCommunityServer,
  joinMobilePublicServer,
  resolveMobileServerJoinErrorCopyKey,
  setMobileServerEventInterest,
} from "../../../about/mobile-community-invite-client";
import { MobileApiError } from "../../../api/mobile-api-client";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { mobileCopy } from "../../../locale/mobile-copy";
import { formatMobileRelativeTime } from "../../../locale/mobile-relative-time";
import { mobileQueryKeys } from "../../../query/mobile-query-keys";
import { useMobileServerUserSettings } from "../../../query/use-mobile-server-user-settings";
import { useMobileServerManagementMutations } from "../../../query/use-mobile-server-management-mutations";
import { useMobileWorkspaceQuery } from "../../../query/mobile-workspace-query";
import { useMobileVoiceStatesQuery } from "../../../query/mobile-voice-states-query";
import { useMobileActiveTargetStore } from "../../../state/mobile-active-target-store";
import { getMobileShellTopInset } from "../../mobile-app-shell";
import { DestructiveConfirmationSheet, Skeleton, useToast } from "../../components/kit";
import { AvatarMark } from "../../components/ui-atoms";
import { MobileCachedImage } from "../../components/mobile-cached-image";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import {
  applyMobileLiveVoiceToProfile,
  formatMobileChannelActivityLabel,
  formatMobileEventDateBlock,
  formatMobileServerCreatedDate,
  getMobileProfileChannelPreview,
  shouldClaimMobileVoiceWatchTarget,
  shouldShowMobileDescriptionMore,
  splitMobileStrongSegments,
  getMobileServerAccessLabel,
  getMobileServerNameLayout,
  getMobileServerProfileStats,
  groupMobileProfileChannelsByCategory,
  MOBILE_SERVER_PROFILE_CHANNEL_PREVIEW_LIMIT,
  resolveMobileEventAction,
  type MobileProfileChannelGroup,
} from "../../mobile-sunucular-model";
import { WorkspaceServerMenuSheet } from "../workspace-server-menu-sheet";
import { createMobileServerProfileStyles } from "./server-profile-screen.styles";

/**
 * 6d/6e. One body, two sources (Faz 5 §A): `ServerProfile` reads
 * `GET .../servers/[serverId]/profile`, `CommunityInvite` reads the invite
 * preview — which Faz 1 turned into the same `ServerPublicProfile` plus a slug,
 * so everything below this fetch is source-blind.
 *
 * The four per-user preferences (`starred`, `muted`, `notificationLevel`,
 * `inviteAddress`) ride the profile read itself and are written only through
 * `runMobileServerUserSettingsUpdate` (Faz 4 §2.1/§2.2). This screen opens no
 * second endpoint for them and holds no second copy.
 */
export type MobileServerProfileSource =
  | { readonly kind: "invite"; readonly slug: string }
  | { readonly kind: "server"; readonly serverId: string };

export interface MobileServerProfileScreenProps {
  readonly onBack: () => void;
  /** A tag chip hands its own text to discovery search; nothing is slugified here. */
  readonly onOpenDiscover: (tag: string) => void;
  readonly onOpenEvents: (serverId: string) => void;
  readonly onOpenInvite: (serverId: string) => void;
  readonly onOpenMembers: (serverId: string) => void;
  readonly onOpenServer: (serverId: string, channelId?: string | null) => void;
  readonly onOpenSettings: (serverId: string) => void;
  readonly onOpenUserProfile: (userId: string, serverId: string) => void;
  readonly source: MobileServerProfileSource;
  readonly webUrl: string;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function isNotFound(error: unknown): boolean {
  return error instanceof MobileApiError && error.status === 404;
}

export function MobileServerProfileScreen({
  onBack,
  onOpenDiscover,
  onOpenEvents,
  onOpenInvite,
  onOpenMembers,
  onOpenServer,
  onOpenSettings,
  onOpenUserProfile,
  source,
  webUrl,
}: MobileServerProfileScreenProps) {
  const auth = useMobileAuth();
  const queryClient = useQueryClient();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerProfileStyles);
  const safeArea = useSafeAreaInsets();
  /**
   * The app shell pads every signed-in screen down by this much, so a screen
   * that means to run under the status bar has to reach back up by exactly it —
   * the same move 11c's banner makes. Without it the banner started below the
   * bar, the strip above stayed the shell's plain background, and the `light`
   * bar style this screen forces painted white clock/battery glyphs onto it.
   */
  const shellTopInset = getMobileShellTopInset(safeArea.top);
  const { showToast } = useToast();

  const signedIn = auth.status === "signed-in";
  const inviteQuery = useQuery({
    enabled: signedIn && source.kind === "invite",
    queryFn: () =>
      fetchMobileCommunityInvitePreview(
        auth.apiClient,
        source.kind === "invite" ? source.slug : "",
      ),
    queryKey: mobileQueryKeys.aboutCommunityInvite(source.kind === "invite" ? source.slug : ""),
    retry: false,
  });
  const profileQuery = useQuery({
    enabled: signedIn && source.kind === "server",
    queryFn: () =>
      fetchMobileServerProfile(auth.apiClient, source.kind === "server" ? source.serverId : ""),
    queryKey: mobileQueryKeys.aboutServerProfile(source.kind === "server" ? source.serverId : ""),
    retry: false,
  });

  const activeQuery = source.kind === "invite" ? inviteQuery : profileQuery;
  /** The HTTP snapshot. `profile` below is this with live voice folded over it. */
  const rawProfile: ServerPublicProfile | undefined = activeQuery.data;
  const serverId = rawProfile?.serverId ?? (source.kind === "server" ? source.serverId : "");

  // 6c's menu needs one thing the profile read model does not carry: the invite
  // capability. The workspace payload is the established source for it and is
  // already cached for a member; a non-member never reads it (the route would
  // answer 403 anyway). Ownership does *not* come from here — the profile's own
  // admin list names the owner.
  const workspaceQuery = useMobileWorkspaceQuery(
    auth.apiClient,
    rawProfile?.joined === true ? serverId : "",
  );
  const capabilities = workspaceQuery.data?.detail.capabilities;
  const viewerId = auth.session?.user.id ?? null;

  /**
   * 6d's "Seste" stat and every voice row come from the profile snapshot, which
   * stops moving the moment it is read. The socket already streams
   * `voice:state:update` into this query, so the screen watches the same feed
   * the Sunucular list does and folds it over the snapshot below -- no profile
   * refetch per join and leave.
   *
   * A non-member is excluded on purpose: the voice-states route answers 403 for
   * them, and the invite preview has no live figures to show anyway.
   */
  const canWatchVoice = rawProfile?.joined === true && serverId.length > 0;
  const voiceStatesQuery = useMobileVoiceStatesQuery(auth.apiClient, canWatchVoice ? serverId : "");
  const setRealtimeServerTarget = useMobileActiveTargetStore((state) => state.setServer);
  useEffect(() => {
    if (
      canWatchVoice &&
      shouldClaimMobileVoiceWatchTarget(useMobileActiveTargetStore.getState(), serverId)
    ) {
      setRealtimeServerTarget(serverId);
    }
  }, [canWatchVoice, serverId, setRealtimeServerTarget]);
  /**
   * `null` until the read answers: an empty map from a still-loading query would
   * zero out counts the server did produce.
   */
  const liveVoiceByChannelId = useMemo(() => {
    const states = voiceStatesQuery.data?.states;
    if (!states) {
      return null;
    }

    return new Map(states.map((state) => [state.channelId, state.participants]));
  }, [voiceStatesQuery.data]);
  /**
   * One merge point: the stat card, the channel preview and 6e's grouped list
   * all read this, so none of them can disagree about who is in a room.
   */
  const profile = useMemo(
    () =>
      rawProfile ? applyMobileLiveVoiceToProfile(rawProfile, liveVoiceByChannelId) : rawProfile,
    [liveVoiceByChannelId, rawProfile],
  );

  const serverUserSettings = useMobileServerUserSettings(auth.apiClient, serverId || null);
  const mutations = useMobileServerManagementMutations(auth.apiClient);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLayer, setMenuLayer] = useState<"menu" | "notifications">("menu");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  /**
   * How many lines the description actually needs, measured unclamped. `null`
   * until the measuring pass reports, which is what keeps "Devamı" from
   * flashing on a one-line description.
   *
   * `onTextLayout` on the *clamped* Text cannot answer this: Android reports
   * every line of the underlying layout while iOS reports only the ones inside
   * the limit, so the same description would be truncatable on one platform and
   * not on the other.
   */
  const [descriptionLineCount, setDescriptionLineCount] = useState<number | null>(null);
  const description = rawProfile?.description ?? "";
  useEffect(() => {
    // A different server (or an edited description) has to be measured again.
    setDescriptionLineCount(null);
    setDescriptionExpanded(false);
  }, [description]);
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  const scrollY = useSharedValue(0);
  /**
   * Mirrors `stickyVisible` on the UI thread. The opacity interpolations below
   * are worklets and never leave it; only the pointer-events swap needs React.
   * Without this gate `runOnJS` would cross the bridge on every scroll frame
   * (~60/s at `scrollEventThrottle={16}`) to hand `setState` a boolean it
   * already holds -- React bails out on the value, but the hop is paid anyway.
   */
  const stickyLatch = useSharedValue(false);
  const stickyStart = theme.serverProfile.sheetTop - theme.serverProfile.logo.size;
  const stickyEnd = theme.serverProfile.sheetTop;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const next = event.contentOffset.y;
      scrollY.value = next;

      const shouldStick = next >= stickyEnd;
      if (shouldStick !== stickyLatch.value) {
        stickyLatch.value = shouldStick;
        runOnJS(setStickyVisible)(shouldStick);
      }
    },
  });
  // Continuous, not a swap: the banner buttons fade out over exactly the
  // distance the compact header fades in, so there is no frame with both.
  const stickyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [stickyStart, stickyEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const bannerActionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [stickyStart, stickyEnd], [1, 0], Extrapolation.CLAMP),
  }));

  // The slug is the source's own, not the profile's -- an invite URL is built
  // from the code that was followed, so this does not wait on the fetch.
  const inviteUrl = useMemo(() => {
    if (source.kind === "invite") {
      return buildMobileCommunityInviteUrl(webUrl, source.slug);
    }
    return buildMobileServerProfileUrl(webUrl, source.serverId);
  }, [source, webUrl]);
  const shareTarget = profile?.inviteAddress ?? inviteUrl;

  const copyLink = useCallback(
    async (value: string) => {
      try {
        await Clipboard.setStringAsync(value);
        showToast({ title: copy.toastInviteLinkCopiedTitle, variant: "success" });
      } catch {
        showToast({ title: copy.inviteSheetCopyFailed, variant: "error" });
      }
    },
    [copy.inviteSheetCopyFailed, copy.toastInviteLinkCopiedTitle, showToast],
  );

  const handleOwnerTransferNotice = useCallback(() => {
    setMenuOpen(false);
    showToast({
      action: {
        label: copy.serverMenuOwnerTransferAction,
        onPress: () => onOpenSettings(serverId),
      },
      subtitle: copy.serverMenuOwnerTransferBody,
      title: copy.serverMenuOwnerTransferTitle,
      variant: "info",
    });
  }, [
    copy.serverMenuOwnerTransferAction,
    copy.serverMenuOwnerTransferBody,
    copy.serverMenuOwnerTransferTitle,
    onOpenSettings,
    serverId,
    showToast,
  ]);

  const joinServer = useCallback(async () => {
    if (!profile || joining) {
      return;
    }

    setJoining(true);
    try {
      if (source.kind === "invite") {
        await joinMobileCommunityServer(auth.apiClient, source.slug);
      } else {
        await joinMobilePublicServer(auth.apiClient, source.serverId);
      }
      showToast({ title: copy.communityJoinSuccess, variant: "success" });
      await activeQuery.refetch();
    } catch (error) {
      const copyKey = resolveMobileServerJoinErrorCopyKey(
        error instanceof MobileApiError ? error.serverCode : null,
      );
      showToast({ title: copy[copyKey], variant: "error" });
    } finally {
      setJoining(false);
    }
  }, [activeQuery, auth.apiClient, copy, joining, profile, showToast, source]);

  const toggleEventInterest = useCallback(async () => {
    if (!profile?.upcomingEvent) {
      return;
    }

    const event = profile.upcomingEvent;
    try {
      await setMobileServerEventInterest(
        auth.apiClient,
        { eventId: event.id, serverId: profile.serverId },
        !event.viewerInterested,
      );
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.serverProfile(profile.serverId),
      });
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.serverEvents(profile.serverId),
      });
    } catch {
      showToast({ title: copy.serverEventInterestFailed, variant: "error" });
    }
  }, [auth.apiClient, copy.serverEventInterestFailed, profile, queryClient, showToast]);

  const leaveServer = useCallback(async () => {
    if (!serverId) {
      return;
    }

    try {
      await mutations.leaveServer.mutateAsync({ serverId });
      setLeaveOpen(false);
      onBack();
    } catch {
      showToast({ title: copy.serverMenuLeaveFailed, variant: "error" });
    }
  }, [copy.serverMenuLeaveFailed, mutations.leaveServer, onBack, serverId, showToast]);

  const channelGroups = useMemo(
    () => (profile ? groupMobileProfileChannelsByCategory(profile.channels) : []),
    [profile],
  );
  const channelPreview = useMemo(
    () =>
      getMobileProfileChannelPreview(channelGroups, MOBILE_SERVER_PROFILE_CHANNEL_PREVIEW_LIMIT),
    [channelGroups],
  );
  const visibleGroups = channelsExpanded ? channelGroups : channelPreview.groups;
  const remainingChannels = channelsExpanded ? 0 : channelPreview.remaining;

  const bottomBarHeight =
    theme.serverProfile.bottomBar.paddingTop +
    theme.serverProfile.bottomBar.primary.height +
    theme.serverProfile.bottomBar.paddingBottom +
    safeArea.bottom;

  if (activeQuery.isPending) {
    return (
      <View style={styles.root} testID="mobile-server-profile-screen">
        <View style={styles.loadingBlock} testID="mobile-server-profile-loading">
          <Skeleton borderRadius={theme.serverProfile.sheetRadius} height={186} width="100%" />
          <Skeleton borderRadius={theme.serverProfile.logo.radius} height={74} width={74} />
          <Skeleton height={26} width={220} />
          <Skeleton height={72} width="100%" />
        </View>
      </View>
    );
  }

  if (!profile) {
    const missing = isNotFound(activeQuery.error);
    const title =
      source.kind === "invite"
        ? missing
          ? copy.communityInvalid
          : copy.communityLoadFailed
        : missing
          ? copy.serverProfileNotFound
          : copy.serverProfileLoadFailed;

    return (
      <View style={styles.root} testID="mobile-server-profile-screen">
        <View style={styles.emptyState} testID="mobile-server-profile-empty">
          <Text maxFontSizeMultiplier={2} style={styles.emptyTitle}>
            {title}
          </Text>
          <Pressable
            accessibilityLabel={missing ? copy.authBackAction : copy.communityRetry}
            accessibilityRole="button"
            onPress={() => {
              if (missing) {
                onBack();
                return;
              }
              void activeQuery.refetch();
            }}
            style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}
            testID={
              missing ? "mobile-server-profile-empty-back" : "mobile-server-profile-empty-retry"
            }
          >
            <Text maxFontSizeMultiplier={2} style={styles.emptyActionLabel}>
              {missing ? copy.authBackAction : copy.communityRetry}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const nameLayout = getMobileServerNameLayout(profile.name, "profile");
  const stickyNameLayout = getMobileServerNameLayout(profile.name, "sticky");
  const shortName = profile.shortName ?? profile.name.slice(0, 2).toUpperCase();
  const stats = getMobileServerProfileStats(profile);
  const statLabels: Record<string, string> = {
    channels: copy.serverProfileStatChannels,
    members: copy.serverProfileStatMembers,
    voice: copy.serverProfileStatVoice,
    weekly: copy.serverProfileStatWeekly,
  };
  /**
   * 6c draws the leave row for every member, so the owner keeps it and answers
   * with the transfer notice instead of a request the service can only refuse.
   * A non-member has nothing to leave; an owner the admin list could not name
   * falls back to `allowed`, which is what the service adjudicates anyway.
   */
  const ownerId = profile.admins.find((admin) => admin.role === "owner")?.id ?? null;
  const leaveAccess: "allowed" | "hidden" | "owner-must-transfer" = !profile.joined
    ? "hidden"
    : ownerId !== null && ownerId === viewerId
      ? "owner-must-transfer"
      : "allowed";

  return (
    <View style={styles.root} testID="mobile-server-profile-screen">
      {/* Over the banner the bar sits on brand purple; under the compact header it does not. */}
      <StatusBar animated style={stickyVisible ? theme.systemBars.statusBar : "light"} />

      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: bottomBarHeight + 16 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-server-profile-scroll"
      >
        <View
          style={[styles.banner, { marginTop: -shellTopInset }]}
          testID="mobile-server-profile-banner"
        >
          {profile.bannerUrl ? (
            <>
              <MobileCachedImage source={{ uri: profile.bannerUrl }} style={styles.bannerImage} />
              <View pointerEvents="none" style={styles.bannerOverlay} />
            </>
          ) : (
            <LinearGradient
              colors={
                [...theme.serverProfile.bannerGradient.colors] as [string, string, ...string[]]
              }
              end={{ x: 1, y: 1 }}
              locations={
                [...theme.serverProfile.bannerGradient.locations] as [number, number, ...number[]]
              }
              start={{ x: 0, y: 0 }}
              style={styles.bannerImage}
            >
              <View pointerEvents="none" style={styles.bannerBlob} />
            </LinearGradient>
          )}
        </View>

        <View style={styles.sheet}>
          <View style={styles.identityRow}>
            <View style={styles.logoFrame}>
              <AvatarMark
                avatarBorderRadius={theme.serverProfile.logo.innerRadius}
                avatarBorderWidth={0}
                dimension={theme.serverProfile.logo.size}
                fallbackTextStyle={styles.logoInitials}
                identityId={profile.serverId}
                imageUrl={profile.iconUrl}
                label={shortName}
                size="large"
              />
            </View>
            <View style={styles.statusChips}>
              <View style={styles.chipOnline} testID="mobile-server-profile-online-chip">
                <View style={styles.chipOnlineDot} />
                <Text allowFontScaling={false} style={styles.chipOnlineText}>
                  {fill(copy.communityOnline, { count: String(profile.onlineCount) })}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.nameRow}>
            <Text
              ellipsizeMode="tail"
              maxFontSizeMultiplier={2}
              numberOfLines={nameLayout.numberOfLines}
              style={[
                styles.name,
                {
                  fontSize: nameLayout.fontSize,
                  letterSpacing: nameLayout.letterSpacing,
                  lineHeight: nameLayout.lineHeight,
                },
              ]}
              testID="mobile-server-profile-name"
            >
              {profile.name}
            </Text>
            {profile.verified ? (
              <View style={styles.verifiedBadge} testID="mobile-server-profile-verified">
                <MobileLineIcon
                  color={theme.serverProfile.verifiedBadge.check}
                  name="check"
                  size={theme.serverProfile.verifiedBadge.size - 6}
                />
              </View>
            ) : null}
          </View>

          {profile.inviteAddress ? (
            <Pressable
              accessibilityLabel={copy.communityCopyInvite}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                void copyLink(profile.inviteAddress ?? "");
              }}
              style={({ pressed }) => [styles.addressRow, pressed && styles.pressed]}
              testID="mobile-server-profile-address"
            >
              <Text maxFontSizeMultiplier={2} style={styles.addressText}>
                {profile.inviteAddress}
              </Text>
              <MobileLineIcon
                color={theme.serverProfile.copyIcon.color}
                name="copy"
                size={theme.serverProfile.copyIcon.size}
              />
            </Pressable>
          ) : null}

          {profile.description ? (
            <>
              <Text
                maxFontSizeMultiplier={2}
                {...(descriptionExpanded
                  ? {}
                  : { numberOfLines: theme.serverProfile.description.numberOfLines })}
                style={styles.description}
                testID="mobile-server-profile-description"
              >
                {profile.description}
              </Text>
              {/*
                The same string, same style, same width, laid out without the
                clamp so its true line count can be read once. Absolutely
                positioned so it occupies no space, invisible, and out of the
                accessibility tree — and unmounted the moment it has answered.
              */}
              {descriptionLineCount === null ? (
                <Text
                  accessibilityElementsHidden
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                  maxFontSizeMultiplier={2}
                  onTextLayout={(event) => setDescriptionLineCount(event.nativeEvent.lines.length)}
                  pointerEvents="none"
                  style={[styles.description, styles.descriptionMeasure]}
                  testID="mobile-server-profile-description-measure"
                >
                  {profile.description}
                </Text>
              ) : null}
              {shouldShowMobileDescriptionMore({
                expanded: descriptionExpanded,
                lineCount: descriptionLineCount,
                maxLines: theme.serverProfile.description.numberOfLines,
              }) ? (
                <Pressable
                  accessibilityLabel={copy.serverProfileMore}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setDescriptionExpanded(true)}
                  testID="mobile-server-profile-description-more"
                >
                  <Text maxFontSizeMultiplier={2} style={styles.descriptionMore}>
                    {copy.serverProfileMore}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {profile.tags.length > 0 ? (
            <View style={styles.tagRow} testID="mobile-server-profile-tags">
              {profile.tags.map((tag) => (
                <Pressable
                  accessibilityLabel={tag}
                  accessibilityRole="button"
                  key={tag}
                  onPress={() => onOpenDiscover(tag)}
                  style={({ pressed }) => [styles.tagChip, pressed && styles.pressed]}
                  testID={`mobile-server-profile-tag-${tag}`}
                >
                  <Text allowFontScaling={false} style={styles.tagChipText}>
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.statCard} testID="mobile-server-profile-stats">
            {stats.map((stat, index) => (
              <View
                key={stat.id}
                style={[styles.statCell, index > 0 && styles.statCellDivider]}
                testID={`mobile-server-profile-stat-${stat.id}`}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.statValue, stat.id === "voice" && styles.statValueVoice]}
                >
                  {stat.value}
                </Text>
                <Text allowFontScaling={false} style={styles.statLabel}>
                  {statLabels[stat.id]}
                </Text>
              </View>
            ))}
          </View>

          {profile.mutualFriendCount > 0 ? (
            <Pressable
              accessibilityLabel={fill(copy.serverProfileFriends, {
                count: String(profile.mutualFriendCount),
              })}
              accessibilityRole="button"
              disabled={!profile.joined}
              onPress={() => onOpenMembers(profile.serverId)}
              style={({ pressed }) => [styles.friendsRow, pressed && styles.pressed]}
              testID="mobile-server-profile-friends"
            >
              <View style={styles.friendsStack}>
                {profile.mutualFriends.slice(0, 3).map((friend, index) => (
                  <View
                    key={friend.id}
                    style={[styles.friendAvatar, index > 0 && styles.friendAvatarOverlap]}
                  >
                    <AvatarMark
                      avatarBorderWidth={0}
                      dimension={theme.serverProfile.friendsRow.avatar}
                      identityId={friend.id}
                      imageUrl={friend.avatarUrl}
                      label={friend.displayName}
                      size="small"
                    />
                  </View>
                ))}
              </View>
              <Text maxFontSizeMultiplier={2} style={styles.friendsText}>
                {splitMobileStrongSegments(
                  fill(copy.serverProfileFriends, { count: String(profile.mutualFriendCount) }),
                ).map((segment, index) => (
                  <Text
                    key={`${index}-${segment.text}`}
                    style={segment.strong ? styles.friendsTextStrong : undefined}
                  >
                    {segment.text}
                  </Text>
                ))}
              </Text>
              <MobileLineIcon
                color={theme.workspace.menuRow.chevron}
                name="chevron-right"
                size={theme.workspace.menuRow.chevronSize}
              />
            </Pressable>
          ) : null}

          <ServerProfileEventCard
            onOpenEvents={() => onOpenEvents(profile.serverId)}
            onPrimaryAction={(action) => {
              if (action === "join") {
                onOpenServer(profile.serverId, profile.upcomingEvent?.channelId ?? null);
                return;
              }
              void toggleEventInterest();
            }}
            profile={profile}
          />

          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={styles.sectionLabel}>
              {copy.serverProfileChannelsSection}
            </Text>
            <Text allowFontScaling={false} style={styles.sectionCount}>
              {String(profile.channelCount)}
            </Text>
          </View>

          {visibleGroups.map((group) => (
            <ServerProfileChannelGroupBlock
              group={group}
              key={group.categoryId ?? "uncategorised"}
            />
          ))}

          {remainingChannels > 0 ? (
            <Pressable
              accessibilityLabel={fill(copy.serverProfileShowRemaining, {
                count: String(remainingChannels),
              })}
              accessibilityRole="button"
              onPress={() => setChannelsExpanded(true)}
              style={({ pressed }) => [styles.showRemaining, pressed && styles.pressed]}
              testID="mobile-server-profile-show-remaining"
            >
              <Text maxFontSizeMultiplier={2} style={styles.showRemainingText}>
                {fill(copy.serverProfileShowRemaining, { count: String(remainingChannels) })}
              </Text>
              <MobileLineIcon
                color={theme.serverProfile.eventJoinPill.text}
                name="chevron-down"
                size={13}
              />
            </Pressable>
          ) : null}

          {profile.admins.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text allowFontScaling={false} style={styles.sectionLabel}>
                  {copy.serverProfileAdminsSection}
                </Text>
              </View>
              <View style={styles.channelCard} testID="mobile-server-profile-admins">
                {profile.admins.map((admin, index) => (
                  <ServerProfileAdminRow
                    admin={admin}
                    divider={index > 0}
                    key={admin.id}
                    onPress={() => onOpenUserProfile(admin.id, profile.serverId)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={styles.sectionLabel}>
              {copy.serverProfileAboutSection}
            </Text>
          </View>
          <View style={styles.channelCard} testID="mobile-server-profile-about">
            <View style={styles.aboutRow} testID="mobile-server-profile-about-created">
              <Text maxFontSizeMultiplier={2} style={styles.aboutLabel}>
                {copy.serverProfileAboutCreated}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.aboutValue}>
                {formatMobileServerCreatedDate(profile.createdAt, locale)}
              </Text>
            </View>
            {profile.joinedAt ? (
              <View
                style={[styles.aboutRow, styles.rowDivider]}
                testID="mobile-server-profile-about-joined"
              >
                <Text maxFontSizeMultiplier={2} style={styles.aboutLabel}>
                  {copy.serverProfileAboutJoined}
                </Text>
                <Text maxFontSizeMultiplier={2} style={styles.aboutValue}>
                  {formatMobileRelativeTime(profile.joinedAt, locale)}
                </Text>
              </View>
            ) : null}
            <View
              style={[styles.aboutRow, styles.rowDivider]}
              testID="mobile-server-profile-about-access"
            >
              <Text maxFontSizeMultiplier={2} style={styles.aboutLabel}>
                {copy.serverProfileAboutAccess}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.aboutValue}>
                {getMobileServerAccessLabel(profile.accessLevel, copy)}
              </Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/*
       * Both overlays reach back over the shell's inset the same way the banner
       * does, so `safeArea.top` below is measured from the device edge rather
       * than from a top that has already been padded once.
       */}
      <Animated.View
        pointerEvents={stickyVisible ? "none" : "box-none"}
        style={[
          styles.bannerActions,
          { paddingTop: safeArea.top + 6, top: -shellTopInset },
          bannerActionsStyle,
        ]}
      >
        <Pressable
          accessibilityLabel={copy.authBackAction}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.bannerButton, pressed && styles.pressed]}
          testID="mobile-server-profile-back"
        >
          <MobileLineIcon
            color={theme.serverProfile.bannerButton.icon}
            name="back-arrow"
            size={theme.serverProfile.bannerButton.iconSize}
          />
        </Pressable>
        <View style={styles.bannerActionsSpacer} />
        <Pressable
          accessibilityLabel={copy.communityShare}
          accessibilityRole="button"
          onPress={() => {
            void Share.share({ message: shareTarget }).catch(() => undefined);
          }}
          style={({ pressed }) => [styles.bannerButton, pressed && styles.pressed]}
          testID="mobile-server-profile-share"
        >
          <MobileLineIcon
            color={theme.serverProfile.bannerButton.icon}
            name="arrow-up-tray"
            size={theme.serverProfile.bannerButton.iconSize}
          />
        </Pressable>
        {profile.joined ? (
          <Pressable
            accessibilityLabel={copy.workspaceServerMenuAction}
            accessibilityRole="button"
            onPress={() => {
              setMenuLayer("menu");
              setMenuOpen(true);
            }}
            style={({ pressed }) => [styles.bannerButton, pressed && styles.pressed]}
            testID="mobile-server-profile-menu"
          >
            <MobileLineIcon
              color={theme.serverProfile.bannerButton.icon}
              name="dots-horizontal"
              size={theme.serverProfile.bannerButton.iconSize}
            />
          </Pressable>
        ) : null}
      </Animated.View>

      <Animated.View
        pointerEvents={stickyVisible ? "box-none" : "none"}
        style={[styles.stickyHeader, { top: -shellTopInset }, stickyStyle]}
        testID="mobile-server-profile-sticky-header"
      >
        <View style={[styles.stickyRow, { paddingTop: safeArea.top + 6 }]}>
          <Pressable
            accessibilityLabel={copy.authBackAction}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.stickyIconButton, pressed && styles.pressed]}
            testID="mobile-server-profile-sticky-back"
          >
            <MobileLineIcon color={theme.text.primary} name="back-arrow" size={16} />
          </Pressable>
          <AvatarMark
            avatarBorderRadius={theme.serverProfile.stickyHeader.avatarRadius}
            avatarBorderWidth={0}
            dimension={theme.serverProfile.stickyHeader.avatar}
            imageUrl={profile.iconUrl}
            label={shortName}
            size="small"
          />
          <Text
            ellipsizeMode="tail"
            maxFontSizeMultiplier={2}
            numberOfLines={stickyNameLayout.numberOfLines}
            style={styles.stickyName}
            testID="mobile-server-profile-sticky-name"
          >
            {profile.name}
          </Text>
          {profile.joined ? (
            <Pressable
              accessibilityLabel={copy.workspaceServerMenuAction}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setMenuLayer("menu");
                setMenuOpen(true);
              }}
              style={({ pressed }) => [styles.stickyMenuButton, pressed && styles.pressed]}
              testID="mobile-server-profile-sticky-menu"
            >
              <MobileLineIcon
                color={theme.serverProfile.eventJoinPill.text}
                name="dots-horizontal"
                size={16}
              />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: theme.serverProfile.bottomBar.paddingBottom + safeArea.bottom },
        ]}
        testID="mobile-server-profile-bottom-bar"
      >
        <Pressable
          accessibilityLabel={profile.joined ? copy.serverProfileOpen : copy.serverProfileJoin}
          accessibilityRole="button"
          disabled={joining}
          onPress={() => {
            if (profile.joined) {
              onOpenServer(profile.serverId, null);
              return;
            }
            void joinServer();
          }}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          testID="mobile-server-profile-primary-action"
        >
          <Text maxFontSizeMultiplier={2} style={styles.primaryActionLabel}>
            {profile.joined ? copy.serverProfileOpen : copy.serverProfileJoin}
          </Text>
        </Pressable>
        {profile.joined ? (
          <Pressable
            accessibilityLabel={copy.serverMenuNotifications}
            accessibilityRole="button"
            onPress={() => {
              setMenuLayer("notifications");
              setMenuOpen(true);
            }}
            style={({ pressed }) => [styles.barIconButton, pressed && styles.pressed]}
            testID="mobile-server-profile-notifications"
          >
            <MobileLineIcon
              color={theme.serverProfile.bottomBar.iconButton.icon}
              name="bell"
              size={theme.serverProfile.bottomBar.iconButton.iconSize}
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={copy.communityCopyInvite}
          accessibilityRole="button"
          onPress={() => {
            void copyLink(shareTarget);
          }}
          style={({ pressed }) => [styles.barIconButton, pressed && styles.pressed]}
          testID="mobile-server-profile-copy-link"
        >
          <MobileLineIcon
            color={theme.serverProfile.bottomBar.iconButton.icon}
            name="link"
            size={theme.serverProfile.bottomBar.iconButton.iconSize}
          />
        </Pressable>
      </View>

      {profile.joined ? (
        <WorkspaceServerMenuSheet
          leaveAccess={leaveAccess}
          onOwnerTransferNotice={handleOwnerTransferNotice}
          canManageInvites={capabilities?.canManageInvites === true}
          canManageServer={profile.canManageServer}
          initialLayer={menuLayer}
          inviteAddress={profile.inviteAddress}
          isMuted={profile.muted}
          isStarred={profile.starred}
          memberCount={profile.memberCount}
          notificationLevel={profile.notificationLevel}
          onClose={() => setMenuOpen(false)}
          onLeave={() => {
            setMenuOpen(false);
            setLeaveOpen(true);
          }}
          onOpenInvite={() => {
            setMenuOpen(false);
            onOpenInvite(profile.serverId);
          }}
          onOpenMembers={() => {
            setMenuOpen(false);
            onOpenMembers(profile.serverId);
          }}
          // The viewer is already looking at the profile; the entry closes the
          // sheet rather than pushing a second copy of this screen.
          onOpenProfile={() => setMenuOpen(false)}
          onOpenSettings={() => {
            setMenuOpen(false);
            onOpenSettings(profile.serverId);
          }}
          onSelectNotificationLevel={(level: ServerNotificationLevel) =>
            serverUserSettings.update({ notificationLevel: level })
          }
          onShare={() => {
            void Share.share({ message: shareTarget }).catch(() => undefined);
          }}
          onToggleMute={(next) => serverUserSettings.update({ muted: next })}
          onToggleStar={(next) => serverUserSettings.update({ starred: next })}
          open={menuOpen}
          serverIconUrl={profile.iconUrl}
          serverId={profile.serverId}
          serverName={profile.name}
          serverShortName={shortName}
        />
      ) : null}

      <DestructiveConfirmationSheet
        body={fill(copy.serverMenuLeaveBody, { server: profile.name })}
        busy={mutations.leaveServer.isPending}
        confirmLabel={copy.serverMenuLeave}
        icon="log-out-outline"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => {
          void leaveServer();
        }}
        open={leaveOpen}
        testID="mobile-server-profile-leave-confirm"
        title={copy.serverMenuLeave}
      />
    </View>
  );
}

/** B5. No upcoming event means no card — 6d leaves no empty shell behind. */
function ServerProfileEventCard({
  onOpenEvents,
  onPrimaryAction,
  profile,
}: {
  readonly onOpenEvents: () => void;
  readonly onPrimaryAction: (action: "join" | "remind") => void;
  readonly profile: ServerPublicProfile;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useThemedStyles(createMobileServerProfileStyles);
  const event = profile.upcomingEvent;

  if (!event) {
    return null;
  }

  const now = Date.now();
  const dateBlock = formatMobileEventDateBlock(event, now, locale);
  const action = resolveMobileEventAction(event, now);

  return (
    <Pressable
      accessibilityLabel={event.name}
      accessibilityRole="button"
      onPress={onOpenEvents}
      style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
      testID="mobile-server-profile-event"
    >
      <View style={styles.eventDateBlock}>
        <Text allowFontScaling={false} style={styles.eventDateLabel}>
          {dateBlock.label}
        </Text>
        <Text allowFontScaling={false} style={styles.eventDateTime}>
          {dateBlock.time}
        </Text>
      </View>
      <View style={styles.eventBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.eventName}>
          {event.name}
        </Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.eventSubtitle}>
          {fill(copy.eventSubtitle, {
            channel: event.channelName ?? event.externalLocation ?? "",
            count: String(event.attendeeCount),
          })}
        </Text>
      </View>
      {action ? (
        <Pressable
          accessibilityLabel={action.kind === "join" ? copy.eventJoin : copy.eventRemind}
          accessibilityRole="button"
          onPress={() => onPrimaryAction(action.kind)}
          style={({ pressed }) => [styles.eventPill, pressed && styles.pressed]}
          testID="mobile-server-profile-event-action"
        >
          <Text allowFontScaling={false} style={styles.eventPillText}>
            {action.kind === "join"
              ? copy.eventJoin
              : event.viewerInterested
                ? copy.serverEventReminderOn
                : copy.eventRemind}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * C2. Category order is whatever the profile route produced (Faz 3 §A0.3 fixed
 * it at the SQL); this never re-sorts. The uncategorised group prints no header.
 */
function ServerProfileChannelGroupBlock({
  group,
}: {
  readonly group: MobileProfileChannelGroup<ServerPublicProfileChannel>;
}) {
  const styles = useThemedStyles(createMobileServerProfileStyles);

  return (
    <>
      {group.categoryName ? (
        <View style={[styles.sectionHeader, styles.sectionHeaderTight]}>
          <Text allowFontScaling={false} style={styles.sectionLabel}>
            {group.categoryName}
          </Text>
          <Text allowFontScaling={false} style={styles.sectionCount}>
            {String(group.channels.length)}
          </Text>
        </View>
      ) : null}
      <View
        style={styles.channelCard}
        testID={`mobile-server-profile-group-${group.categoryId ?? "none"}`}
      >
        {group.channels.map((channel, index) => (
          <ServerProfileChannelRow channel={channel} divider={index > 0} key={channel.id} />
        ))}
      </View>
    </>
  );
}

function ServerProfileChannelRow({
  channel,
  divider,
}: {
  readonly channel: ServerPublicProfileChannel;
  readonly divider: boolean;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerProfileStyles);
  const isVoice = channel.type === "voice";
  const activity = formatMobileChannelActivityLabel(channel.lastActivityAt, locale);

  return (
    <View
      style={[styles.channelRow, divider && styles.rowDivider]}
      testID={`mobile-server-profile-channel-${channel.id}`}
    >
      <View style={[styles.channelIconBox, isVoice && styles.channelIconBoxVoice]}>
        <MobileLineIcon
          color={
            isVoice ? theme.serverProfile.statValue.voice : theme.serverProfile.statLabel.color
          }
          name={isVoice ? "speaker" : "hash"}
          size={13}
        />
      </View>
      <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.channelName}>
        {channel.name}
      </Text>
      {channel.isPrivate ? (
        <View style={styles.privateChip} testID={`mobile-server-profile-private-${channel.id}`}>
          <MobileLineIcon
            color={theme.serverProfile.privateChip.icon}
            name="lock"
            size={theme.serverProfile.privateChip.iconSize}
          />
          <Text allowFontScaling={false} style={styles.privateChipText}>
            {copy.serverProfilePrivateChannel}
          </Text>
        </View>
      ) : isVoice ? (
        channel.participants.length > 0 ? (
          <View style={styles.participantStack}>
            {channel.participants.map((participant, index) => (
              <View
                key={participant.id}
                style={[styles.participantAvatar, index > 0 && styles.participantAvatarOverlap]}
              >
                <AvatarMark
                  avatarBorderWidth={0}
                  dimension={20}
                  identityId={participant.id}
                  imageUrl={participant.avatarUrl}
                  label={participant.shortName ?? participant.displayName}
                  size="small"
                />
              </View>
            ))}
          </View>
        ) : channel.liveCount ? (
          <Text allowFontScaling={false} style={styles.channelVoiceCount}>
            {fill(copy.communityInVoice, { count: String(channel.liveCount) })}
          </Text>
        ) : (
          <Text allowFontScaling={false} style={styles.channelActivity}>
            {copy.channelEmptyVoiceShort}
          </Text>
        )
      ) : activity ? (
        <Text allowFontScaling={false} style={styles.channelActivity}>
          {activity}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * C4. `presence` is the Redis-backed online set the route resolves; the
 * "n saat önce" line is `AppSession.lastSeenAt`. Faz 3 §2.9 keeps the two
 * apart — the dot and the sentence answer different questions.
 */
function ServerProfileAdminRow({
  admin,
  divider,
  onPress,
}: {
  readonly admin: ServerPublicProfileAdmin;
  readonly divider: boolean;
  readonly onPress: () => void;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useThemedStyles(createMobileServerProfileStyles);
  const subtitle =
    admin.presence === "online"
      ? copy.profileCardStatusOnline
      : admin.lastSeenAt
        ? formatMobileRelativeTime(admin.lastSeenAt, locale)
        : "";

  return (
    <Pressable
      accessibilityLabel={admin.displayName}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.channelRow,
        divider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
      testID={`mobile-server-profile-admin-${admin.id}`}
    >
      <View style={styles.adminAvatarWrap}>
        <AvatarMark
          avatarBorderRadius={11}
          avatarBorderWidth={0}
          dimension={32}
          identityId={admin.id}
          imageUrl={admin.avatarUrl}
          label={admin.shortName ?? admin.displayName}
          size="regular"
        />
        {admin.presence === "online" ? <View style={styles.adminPresenceDot} /> : null}
      </View>
      <View style={styles.adminBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.adminName}>
          {admin.displayName}
        </Text>
        {subtitle ? (
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.adminSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.roleChip,
          admin.role === "owner" ? styles.roleChipOwner : styles.roleChipAdmin,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.roleChipText,
            admin.role === "owner" ? styles.roleChipTextOwner : styles.roleChipTextAdmin,
          ]}
        >
          {admin.role === "owner" ? copy.roleOwner : copy.roleAdmin}
        </Text>
      </View>
    </Pressable>
  );
}
