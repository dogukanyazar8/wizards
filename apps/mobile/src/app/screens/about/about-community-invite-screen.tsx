import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import {
  formatServerProfileCount,
  resolveServerProfileChannelBadge,
  resolveServerProfileFriendStack,
  resolveServerProfileJoinAction,
  type MobileInvitePreviewResponse,
} from "@wizards/types";

import {
  buildMobileCommunityInviteUrl,
  buildMobileServerProfileUrl,
  fetchMobileCommunityInvitePreview,
  fetchMobileServerProfile,
  joinMobileCommunityServer,
  joinMobilePublicServer,
  resolveMobileServerJoinErrorCopyKey,
} from "../../../about/mobile-community-invite-client";
import { MobileApiError } from "../../../api/mobile-api-client";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { mobileCopy } from "../../../locale/mobile-copy";
import { formatMobileCompactCount } from "../../../locale/mobile-number-format";
import { mobileQueryKeys } from "../../../query/mobile-query-keys";
import { Avatar } from "../../components/kit/avatar";
import { Skeleton } from "../../components/kit/skeleton";
import { useToast } from "../../components/kit/toast";
import { MobileCachedImage } from "../../components/mobile-cached-image";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import {
  AboutHashIcon,
  AboutLinkIcon,
  AboutShareIcon,
  AboutSpeakerIcon,
  AboutVerifiedIcon,
} from "./about-icons";
import { AboutBrandLogo, AboutCard, AboutGroupLabel, AboutScreenHeader } from "./about-primitives";
import { useMobileAboutCommunityInviteStyles } from "./about-community-invite-screen.styles";

export type MobileCommunityInviteScreenProps = {
  readonly onBack: () => void;
  readonly onOpenServer: (serverId: string) => void;
  readonly slug: string;
  readonly webUrl: string;
};

/**
 * S2 Section D's second entry point into this same 2g body: a member opens
 * it from `ServerSettings`/`ServerMembers`, so there is a `serverId` but no
 * invite code. `MobileCommunityInviteScreen` below is untouched in shape —
 * the 2g regression test pins it — this is a sibling that feeds the same
 * presentational pieces from `GET .../servers/[serverId]/profile` instead.
 */
export type MobileServerProfileScreenProps = {
  readonly onBack: () => void;
  readonly onOpenServer: (serverId: string) => void;
  readonly serverId: string;
  readonly webUrl: string;
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function isNotFound(error: unknown): boolean {
  return error instanceof MobileApiError && error.status === 404;
}

function CommunityInviteLoading() {
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <AboutCard padding={0} style={styles.inviteCard} testID="mobile-community-loading-card">
      <Skeleton height={92} width="100%" />
      <View style={styles.loadingCard}>
        <View style={styles.loadingIcon}>
          <Skeleton borderRadius={18} height={56} width={56} />
        </View>
        <Skeleton height={24} width={190} />
        <Skeleton height={18} width={240} />
        <Skeleton height={42} width="100%" />
      </View>
    </AboutCard>
  );
}

/**
 * The banner/icon/name/counts/description block, generalised (S2 Section D
 * binding decision 3) to take display-ready values rather than a
 * `MobileInvitePreviewResponse`: each screen below picks its own count
 * formatter, so the card itself no longer needs to know which one applies.
 */
function CommunityProfileCard({
  bannerUrl,
  description,
  iconUrl,
  memberCountText,
  name,
  onlineCountText,
  verified,
}: {
  readonly bannerUrl: string | null;
  readonly description: string;
  readonly iconUrl: string | null;
  readonly memberCountText: string;
  readonly name: string;
  readonly onlineCountText: string;
  readonly verified: boolean;
}) {
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <AboutCard padding={0} style={styles.inviteCard} testID="mobile-community-invite-card">
      {bannerUrl ? (
        <MobileCachedImage
          source={{ uri: bannerUrl }}
          style={styles.banner}
          testID="mobile-community-banner"
        />
      ) : (
        <LinearGradient
          colors={[
            theme.about.brandGradientStart,
            theme.about.brandGradientMiddle,
            theme.about.brandGradientEnd,
          ]}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.46, 1]}
          start={{ x: 0, y: 0 }}
          style={styles.banner}
          testID="mobile-community-banner"
        >
          {/*
           * React Native/expo-linear-gradient has no radial-gradient primitive.
           * The handoff's white radial light is approximated by one clipped,
           * low-opacity circle over the linear brand gradient; no blur is used.
           */}
          <View pointerEvents="none" style={styles.bannerHighlight} />
        </LinearGradient>
      )}
      <View style={styles.inviteContent} testID="mobile-community-icon-overlap">
        <View style={styles.iconFrame} testID="mobile-community-icon-frame">
          {iconUrl ? (
            <MobileCachedImage
              source={{ uri: iconUrl }}
              style={styles.serverIcon}
              testID="mobile-community-server-icon"
            />
          ) : (
            <AboutBrandLogo size={50} testID="mobile-community-brand-logo" />
          )}
        </View>

        <View style={styles.nameRow}>
          <Text maxFontSizeMultiplier={2} style={styles.name}>
            {name}
          </Text>
          {verified ? (
            <AboutVerifiedIcon
              color={theme.about.accent}
              size={15}
              testID="mobile-community-verified"
            />
          ) : null}
        </View>

        <View style={styles.countRow}>
          <View style={styles.countItem}>
            <View style={styles.countDotOnline} />
            <Text maxFontSizeMultiplier={2} style={styles.countText}>
              {onlineCountText}
            </Text>
          </View>
          <View style={styles.countItem}>
            <View style={styles.countDotMember} />
            <Text maxFontSizeMultiplier={2} style={styles.countText}>
              {memberCountText}
            </Text>
          </View>
        </View>

        {description ? (
          <Text maxFontSizeMultiplier={2} style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
    </AboutCard>
  );
}

type CommunityProfileChannelBadgeValue = {
  readonly kind: "live" | "live-count" | "read-only";
  readonly text: string;
} | null;

function CommunityProfileChannelBadge({
  badge,
}: {
  readonly badge: CommunityProfileChannelBadgeValue;
}) {
  const styles = useMobileAboutCommunityInviteStyles();

  if (!badge) {
    return null;
  }

  if (badge.kind === "read-only") {
    return (
      <Text
        allowFontScaling={false}
        style={styles.readOnly}
        testID="mobile-community-channel-status"
      >
        {badge.text}
      </Text>
    );
  }

  if (badge.kind === "live") {
    return (
      <View style={styles.livePill} testID="mobile-community-channel-status">
        <Text allowFontScaling={false} style={styles.liveLabel}>
          {badge.text}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.voiceStatus} testID="mobile-community-channel-status">
      <View style={styles.voiceDot} />
      <Text maxFontSizeMultiplier={2} style={styles.voiceCount}>
        {badge.text}
      </Text>
    </View>
  );
}

type CommunityProfileChannelRow = {
  readonly badge: CommunityProfileChannelBadgeValue;
  readonly key: string;
  readonly name: string;
  readonly type: "text" | "voice";
};

function CommunityProfileChannels({
  rows,
}: {
  readonly rows: readonly CommunityProfileChannelRow[];
}) {
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      <AboutGroupLabel label={mobileCopy[locale].communityChannels} />
      <AboutCard padding={0} style={styles.channelCard} testID="mobile-community-channels-card">
        {rows.map((row, index) => (
          <View
            key={row.key}
            style={[styles.channelRow, index > 0 && styles.channelDivider]}
            testID={`mobile-community-channel-row-${index}`}
          >
            {row.type === "voice" ? (
              <AboutSpeakerIcon color={theme.about.iconTint} size={16} />
            ) : (
              <AboutHashIcon color={theme.about.iconTint} size={16} />
            )}
            <Text maxFontSizeMultiplier={2} style={styles.channelName}>
              {row.name}
            </Text>
            <CommunityProfileChannelBadge badge={row.badge} />
          </View>
        ))}
      </AboutCard>
    </>
  );
}

function MutualFriendAvatar({
  friend,
  index,
}: {
  readonly friend: {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    readonly id: string;
  };
  readonly index: number;
}) {
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <View
      style={[styles.avatarFrame, index > 0 && styles.avatarOverlap]}
      testID={`mobile-community-mutual-avatar-${index}-frame`}
    >
      <Avatar
        avatarBorderWidth={0}
        avatarBorderRadius={12}
        dimension={24}
        identityId={friend.id}
        imageUrl={friend.avatarUrl}
        label={friend.displayName}
      />
    </View>
  );
}

/**
 * The avatar row + caption, generalised the same way as the card: it renders
 * whatever `visible`/`overflowCount`/`caption` it is given rather than
 * slicing the friend list itself. Each screen decides *how* to cap the list
 * (S2 Section B's `resolveServerProfileFriendStack` for the new `serverId`
 * path; the pre-existing 3-avatar cap, unchanged, for the invite path) and
 * whether to render this at all.
 */
function CommunityProfileFriends({
  caption,
  overflowCount,
  visible,
}: {
  readonly caption: string;
  readonly overflowCount: number;
  readonly visible: readonly {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    readonly id: string;
  }[];
}) {
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <AboutCard style={styles.socialCard} testID="mobile-community-social-proof">
      <View style={styles.avatarStack}>
        {visible.map((friend, index) => (
          <MutualFriendAvatar friend={friend} index={index} key={friend.id} />
        ))}
        {overflowCount > 0 ? (
          <View
            style={[styles.avatarFrame, visible.length > 0 && styles.avatarOverlap]}
            testID={`mobile-community-mutual-avatar-${visible.length}-frame`}
          >
            <Text allowFontScaling={false} style={styles.avatarOverflow}>
              +{overflowCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.socialText}>
        {caption}
      </Text>
    </AboutCard>
  );
}

/**
 * The two-button footer (primary action + copy-link icon), generalised the
 * same way: the invite path still runs its own join mutation and optimistic
 * `joined` state, the server-id path never mutates (S2 binding decision 2 —
 * joining ships in S3), so only the *resolved* label/busy/handlers are
 * shared here.
 */
function CommunityProfileActions({
  copyAccessibilityLabel,
  onCopyPress,
  onPrimaryPress,
  primaryAccessibilityLabel,
  primaryBusy,
  primaryLabel,
}: {
  readonly copyAccessibilityLabel: string;
  readonly onCopyPress: () => void;
  readonly onPrimaryPress: () => void;
  readonly primaryAccessibilityLabel: string;
  readonly primaryBusy: boolean;
  readonly primaryLabel: string;
}) {
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <View style={styles.actions} testID="mobile-community-actions">
      <Pressable
        accessibilityLabel={primaryAccessibilityLabel}
        accessibilityRole="button"
        disabled={primaryBusy}
        onPress={onPrimaryPress}
        style={({ pressed }) => [
          styles.primaryAction,
          primaryBusy && styles.primaryActionDisabled,
          pressed && !primaryBusy && styles.pressed,
        ]}
        testID="mobile-community-primary-action"
      >
        {primaryBusy ? (
          <ActivityIndicator color={theme.about.updateOnGradient} size="small" />
        ) : (
          <Text maxFontSizeMultiplier={2} style={styles.primaryActionLabel}>
            {primaryLabel}
          </Text>
        )}
      </Pressable>
      <Pressable
        accessibilityLabel={copyAccessibilityLabel}
        accessibilityRole="button"
        onPress={onCopyPress}
        style={({ pressed }) => [styles.copyAction, pressed && styles.pressed]}
        testID="mobile-community-copy"
      >
        <AboutLinkIcon color={theme.about.textSecondary} size={18} />
      </Pressable>
    </View>
  );
}

function CommunityProfileEmpty({
  isInvalid,
  onBack,
  onRetry,
  title,
}: {
  readonly isInvalid: boolean;
  readonly onBack: () => void;
  readonly onRetry: () => void;
  readonly title: string;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <View style={styles.emptyState} testID="mobile-community-invalid">
      <Text maxFontSizeMultiplier={2} style={styles.emptyTitle}>
        {title}
      </Text>
      <Pressable
        accessibilityLabel={isInvalid ? copy.authBackAction : copy.communityRetry}
        accessibilityRole="button"
        onPress={isInvalid ? onBack : onRetry}
        style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}
        testID={isInvalid ? "mobile-community-invalid-back" : "mobile-community-retry"}
      >
        <Text maxFontSizeMultiplier={2} style={styles.emptyActionLabel}>
          {isInvalid ? copy.authBackAction : copy.communityRetry}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The invite-code path. Its own decision logic (channel badge condition,
 * 3-avatar cap, join mutation) is preserved byte-for-byte from before the
 * S2 generalisation — `mobile-about-community-2g.test.tsx` pins the visible
 * result of that logic, and it is not the same as Section B's resolvers for
 * every edge case they do not cover (e.g. a text channel's CANLI pill fires
 * on any non-null `liveCount` here, not only zero). Only the presentational
 * pieces above are shared with `MobileServerProfileScreen`.
 */
export function MobileCommunityInviteScreen({
  onBack,
  onOpenServer,
  slug,
  webUrl,
}: MobileCommunityInviteScreenProps) {
  const auth = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();
  const safeArea = useSafeAreaInsets();
  const { showToast } = useToast();
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const previewQuery = useQuery({
    enabled: auth.status === "signed-in",
    queryFn: () => fetchMobileCommunityInvitePreview(auth.apiClient, slug),
    queryKey: mobileQueryKeys.aboutCommunityInvite(slug),
    retry: false,
  });
  const preview: MobileInvitePreviewResponse | undefined = previewQuery.data;
  const inviteUrl = useMemo(
    () => buildMobileCommunityInviteUrl(webUrl, preview?.slug ?? slug),
    [preview?.slug, slug, webUrl],
  );

  useEffect(() => {
    if (preview) {
      setJoined(preview.joined);
    }
  }, [preview]);

  const copyInvite = async () => {
    try {
      await Clipboard.setStringAsync(inviteUrl);
      showToast({ title: copy.toastInviteLinkCopiedTitle, variant: "success" });
    } catch {
      showToast({ title: copy.inviteSheetCopyFailed, variant: "error" });
    }
  };

  const handlePrimaryAction = async () => {
    if (!preview || joining) {
      return;
    }
    if (joined) {
      onOpenServer(preview.serverId);
      return;
    }

    const previousJoined = joined;
    setJoined(true);
    setJoining(true);
    try {
      await joinMobileCommunityServer(auth.apiClient, preview.slug);
      showToast({ title: copy.communityJoinSuccess, variant: "success" });
    } catch {
      setJoined(previousJoined);
      showToast({ title: copy.communityJoinFailed, variant: "error" });
    } finally {
      setJoining(false);
    }
  };

  const channelRows: readonly CommunityProfileChannelRow[] = preview
    ? preview.channels.map((channel, index) => {
        let badge: CommunityProfileChannelBadgeValue = null;
        if (channel.readOnly) {
          badge = { kind: "read-only", text: copy.communityReadOnly };
        } else if (channel.type === "text" && channel.liveCount !== null) {
          badge = { kind: "live", text: copy.communityLive };
        } else if (channel.type === "voice" && channel.liveCount !== null) {
          badge = {
            kind: "live-count",
            text: fill(copy.communityInVoice, { count: String(channel.liveCount) }),
          };
        }
        return {
          badge,
          key: `${channel.type}:${channel.name}:${index}`,
          name: channel.name,
          type: channel.type,
        };
      })
    : [];

  const visibleFriends = preview ? preview.mutualFriends.slice(0, 3) : [];
  const hiddenFriendCount = preview
    ? Math.max(0, preview.mutualFriendCount - visibleFriends.length)
    : 0;

  return (
    <View style={styles.root} testID="mobile-community-invite-screen">
      <AboutScreenHeader
        action={{
          accessibilityLabel: copy.communityShare,
          icon: <AboutShareIcon color={theme.about.textSecondary} size={16} />,
          onPress: () => {
            void copyInvite();
          },
          testID: "mobile-community-share",
        }}
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-community-header"
        title={copy.communityTitle}
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: safeArea.bottom + 26 + 48,
        }}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-community-scroll"
      >
        {previewQuery.isPending ? (
          <CommunityInviteLoading />
        ) : preview ? (
          <>
            <CommunityProfileCard
              bannerUrl={preview.bannerUrl}
              description={preview.description}
              iconUrl={preview.iconUrl}
              memberCountText={fill(copy.communityMembers, {
                count: formatMobileCompactCount(preview.memberCount, locale),
              })}
              name={preview.name}
              onlineCountText={fill(copy.communityOnline, {
                count: formatMobileCompactCount(preview.onlineCount, locale),
              })}
              verified={preview.verified}
            />
            <CommunityProfileChannels rows={channelRows} />
            {preview.mutualFriendCount === 0 ? null : (
              <CommunityProfileFriends
                caption={fill(copy.communityMutualFriends, {
                  count: String(preview.mutualFriendCount),
                })}
                overflowCount={hiddenFriendCount}
                visible={visibleFriends}
              />
            )}
          </>
        ) : (
          <CommunityProfileEmpty
            isInvalid={isNotFound(previewQuery.error)}
            onBack={onBack}
            onRetry={() => {
              void previewQuery.refetch();
            }}
            title={
              isNotFound(previewQuery.error) ? copy.communityInvalid : copy.communityLoadFailed
            }
          />
        )}
      </ScrollView>

      {preview ? (
        <CommunityProfileActions
          copyAccessibilityLabel={copy.communityCopyInvite}
          onCopyPress={() => {
            void copyInvite();
          }}
          onPrimaryPress={() => {
            void handlePrimaryAction();
          }}
          primaryAccessibilityLabel={joined ? copy.communityOpen : copy.communityJoin}
          primaryBusy={joining}
          primaryLabel={joined ? copy.communityOpen : copy.communityJoin}
        />
      ) : null}
    </View>
  );
}

/**
 * The `serverId` path (S2 Section D). Reached from `ServerSettings` /
 * `ServerMembers` — both member-only surfaces — plus the `ServerProfile`
 * deep link and the discovery grid, which owns no join of its own. A member
 * sees "Sunucuya git" into the server; a non-member joins through S3's
 * invite-free endpoint, the same one the web profile card calls. The button
 * label is never hand-derived after a join: the profile is refetched and
 * `resolveServerProfileJoinAction(joined)` resolves it, exactly as on first
 * paint.
 */
export function MobileServerProfileScreen({
  onBack,
  onOpenServer,
  serverId,
  webUrl,
}: MobileServerProfileScreenProps) {
  const auth = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();
  const safeArea = useSafeAreaInsets();
  const { showToast } = useToast();
  const profileQuery = useQuery({
    enabled: auth.status === "signed-in",
    queryFn: () => fetchMobileServerProfile(auth.apiClient, serverId),
    queryKey: mobileQueryKeys.aboutServerProfile(serverId),
    retry: false,
  });
  const profile = profileQuery.data;
  const profileUrl = useMemo(
    () => buildMobileServerProfileUrl(webUrl, serverId),
    [serverId, webUrl],
  );

  const copyProfileLink = async () => {
    try {
      await Clipboard.setStringAsync(profileUrl);
      showToast({ title: copy.toastInviteLinkCopiedTitle, variant: "success" });
    } catch {
      showToast({ title: copy.inviteSheetCopyFailed, variant: "error" });
    }
  };

  const [joining, setJoining] = useState(false);

  const joinServer = async () => {
    if (joining) {
      return;
    }

    setJoining(true);
    try {
      await joinMobilePublicServer(auth.apiClient, serverId);
      showToast({ title: copy.communityJoinSuccess, variant: "success" });
      await profileQuery.refetch();
    } catch (error) {
      const copyKey = resolveMobileServerJoinErrorCopyKey(
        error instanceof MobileApiError ? error.serverCode : null,
      );
      showToast({ title: copy[copyKey], variant: "error" });
    } finally {
      setJoining(false);
    }
  };

  const channelRows: readonly CommunityProfileChannelRow[] = profile
    ? profile.channels.map((channel, index) => {
        const resolved = resolveServerProfileChannelBadge(channel);
        let badge: CommunityProfileChannelBadgeValue = null;
        if (resolved?.kind === "read-only") {
          badge = { kind: "read-only", text: copy.communityReadOnly };
        } else if (resolved?.kind === "live") {
          badge = { kind: "live", text: copy.communityLive };
        } else if (resolved?.kind === "live-count") {
          badge = {
            kind: "live-count",
            text: fill(copy.communityInVoice, { count: String(resolved.count) }),
          };
        }
        return {
          badge,
          key: `${channel.type}:${channel.name}:${index}`,
          name: channel.name,
          type: channel.type,
        };
      })
    : [];

  const friendStack = profile
    ? resolveServerProfileFriendStack(profile.mutualFriends, profile.mutualFriendCount)
    : null;
  const joinAction = profile ? resolveServerProfileJoinAction(profile.joined) : null;
  const isNotFoundError = isNotFound(profileQuery.error);

  return (
    <View style={styles.root} testID="mobile-server-profile-screen">
      <AboutScreenHeader
        action={{
          accessibilityLabel: copy.communityShare,
          icon: <AboutShareIcon color={theme.about.textSecondary} size={16} />,
          onPress: () => {
            void copyProfileLink();
          },
          testID: "mobile-server-profile-share",
        }}
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-server-profile-header"
        title={copy.communityTitle}
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: safeArea.bottom + 26 + 48,
        }}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-server-profile-scroll"
      >
        {profileQuery.isPending ? (
          <CommunityInviteLoading />
        ) : profile ? (
          <>
            <CommunityProfileCard
              bannerUrl={profile.bannerUrl}
              description={profile.description}
              iconUrl={profile.iconUrl}
              memberCountText={fill(copy.communityMembers, {
                count: formatServerProfileCount(profile.memberCount, locale),
              })}
              name={profile.name}
              onlineCountText={fill(copy.communityOnline, {
                count: formatServerProfileCount(profile.onlineCount, locale),
              })}
              verified={profile.verified}
            />
            <CommunityProfileChannels rows={channelRows} />
            {friendStack ? (
              <CommunityProfileFriends
                caption={fill(copy.communityMutualFriends, {
                  count: String(profile.mutualFriendCount),
                })}
                overflowCount={friendStack.overflowCount}
                visible={friendStack.visible}
              />
            ) : null}
          </>
        ) : (
          <CommunityProfileEmpty
            isInvalid={isNotFoundError}
            onBack={onBack}
            onRetry={() => {
              void profileQuery.refetch();
            }}
            title={isNotFoundError ? copy.serverProfileNotFound : copy.serverProfileLoadFailed}
          />
        )}
      </ScrollView>

      {profile && joinAction ? (
        <CommunityProfileActions
          copyAccessibilityLabel={copy.communityCopyInvite}
          onCopyPress={() => {
            void copyProfileLink();
          }}
          onPrimaryPress={() => {
            if (joinAction.kind === "go") {
              onOpenServer(profile.serverId);
            } else {
              void joinServer();
            }
          }}
          primaryAccessibilityLabel={
            joinAction.kind === "go" ? copy.communityOpen : copy.communityJoin
          }
          primaryBusy={joining}
          primaryLabel={joinAction.kind === "go" ? copy.communityOpen : copy.communityJoin}
        />
      ) : null}
    </View>
  );
}
