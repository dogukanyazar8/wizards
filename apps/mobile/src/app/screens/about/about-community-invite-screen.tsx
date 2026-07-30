import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import type {
  MobileInvitePreviewChannel,
  MobileInvitePreviewMutualFriend,
  MobileInvitePreviewResponse,
} from "@wizards/types";

import {
  buildMobileCommunityInviteUrl,
  fetchMobileCommunityInvitePreview,
  joinMobileCommunityServer,
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

function CommunityInviteCard({
  locale,
  preview,
}: {
  readonly locale: "en" | "tr";
  readonly preview: MobileInvitePreviewResponse;
}) {
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <AboutCard padding={0} style={styles.inviteCard} testID="mobile-community-invite-card">
      {preview.bannerUrl ? (
        <MobileCachedImage
          source={{ uri: preview.bannerUrl }}
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
          {preview.iconUrl ? (
            <MobileCachedImage
              source={{ uri: preview.iconUrl }}
              style={styles.serverIcon}
              testID="mobile-community-server-icon"
            />
          ) : (
            <AboutBrandLogo size={50} testID="mobile-community-brand-logo" />
          )}
        </View>

        <View style={styles.nameRow}>
          <Text maxFontSizeMultiplier={2} style={styles.name}>
            {preview.name}
          </Text>
          {preview.verified ? (
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
              {fill(copy.communityOnline, {
                count: formatMobileCompactCount(preview.onlineCount, locale),
              })}
            </Text>
          </View>
          <View style={styles.countItem}>
            <View style={styles.countDotMember} />
            <Text maxFontSizeMultiplier={2} style={styles.countText}>
              {fill(copy.communityMembers, {
                count: formatMobileCompactCount(preview.memberCount, locale),
              })}
            </Text>
          </View>
        </View>

        {preview.description ? (
          <Text maxFontSizeMultiplier={2} style={styles.description}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </AboutCard>
  );
}

function CommunityChannelStatus({ channel }: { readonly channel: MobileInvitePreviewChannel }) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutCommunityInviteStyles();

  if (channel.readOnly) {
    return (
      <Text
        allowFontScaling={false}
        style={styles.readOnly}
        testID="mobile-community-channel-status"
      >
        {copy.communityReadOnly}
      </Text>
    );
  }

  if (channel.type === "text" && channel.liveCount !== null) {
    return (
      <View style={styles.livePill} testID="mobile-community-channel-status">
        <Text allowFontScaling={false} style={styles.liveLabel}>
          {copy.communityLive}
        </Text>
      </View>
    );
  }

  if (channel.type === "voice" && channel.liveCount !== null) {
    return (
      <View style={styles.voiceStatus} testID="mobile-community-channel-status">
        <View style={styles.voiceDot} />
        <Text maxFontSizeMultiplier={2} style={styles.voiceCount}>
          {fill(copy.communityInVoice, { count: String(channel.liveCount) })}
        </Text>
      </View>
    );
  }

  return null;
}

function CommunityChannels({
  channels,
}: {
  readonly channels: readonly MobileInvitePreviewChannel[];
}) {
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useMobileAboutCommunityInviteStyles();

  if (channels.length === 0) {
    return null;
  }

  return (
    <>
      <AboutGroupLabel label={mobileCopy[locale].communityChannels} />
      <AboutCard padding={0} style={styles.channelCard} testID="mobile-community-channels-card">
        {channels.map((channel, index) => (
          <View
            key={`${channel.type}:${channel.name}:${index}`}
            style={[styles.channelRow, index > 0 && styles.channelDivider]}
            testID={`mobile-community-channel-row-${index}`}
          >
            {channel.type === "voice" ? (
              <AboutSpeakerIcon color={theme.about.iconTint} size={16} />
            ) : (
              <AboutHashIcon color={theme.about.iconTint} size={16} />
            )}
            <Text maxFontSizeMultiplier={2} style={styles.channelName}>
              {channel.name}
            </Text>
            <CommunityChannelStatus channel={channel} />
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
  readonly friend: MobileInvitePreviewMutualFriend;
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

function CommunitySocialProof({
  mutualFriendCount,
  mutualFriends,
}: {
  readonly mutualFriendCount: number;
  readonly mutualFriends: readonly MobileInvitePreviewMutualFriend[];
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutCommunityInviteStyles();
  const visibleFriends = mutualFriends.slice(0, 3);
  const hiddenCount = Math.max(0, mutualFriendCount - visibleFriends.length);

  if (mutualFriendCount === 0) {
    return null;
  }

  return (
    <AboutCard style={styles.socialCard} testID="mobile-community-social-proof">
      <View style={styles.avatarStack}>
        {visibleFriends.map((friend, index) => (
          <MutualFriendAvatar friend={friend} index={index} key={friend.id} />
        ))}
        {hiddenCount > 0 ? (
          <View
            style={[styles.avatarFrame, visibleFriends.length > 0 && styles.avatarOverlap]}
            testID={`mobile-community-mutual-avatar-${visibleFriends.length}-frame`}
          >
            <Text allowFontScaling={false} style={styles.avatarOverflow}>
              +{hiddenCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.socialText}>
        {fill(copy.communityMutualFriends, { count: String(mutualFriendCount) })}
      </Text>
    </AboutCard>
  );
}

function CommunityInviteEmpty({
  isInvalid,
  onBack,
  onRetry,
}: {
  readonly isInvalid: boolean;
  readonly onBack: () => void;
  readonly onRetry: () => void;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutCommunityInviteStyles();

  return (
    <View style={styles.emptyState} testID="mobile-community-invalid">
      <Text maxFontSizeMultiplier={2} style={styles.emptyTitle}>
        {isInvalid ? copy.communityInvalid : copy.communityLoadFailed}
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
  const preview = previewQuery.data;
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
            <CommunityInviteCard locale={locale} preview={preview} />
            <CommunityChannels channels={preview.channels} />
            <CommunitySocialProof
              mutualFriendCount={preview.mutualFriendCount}
              mutualFriends={preview.mutualFriends}
            />
          </>
        ) : (
          <CommunityInviteEmpty
            isInvalid={isNotFound(previewQuery.error)}
            onBack={onBack}
            onRetry={() => {
              void previewQuery.refetch();
            }}
          />
        )}
      </ScrollView>

      {preview ? (
        <View style={styles.actions} testID="mobile-community-actions">
          <Pressable
            accessibilityLabel={joined ? copy.communityOpen : copy.communityJoin}
            accessibilityRole="button"
            disabled={joining}
            onPress={() => {
              void handlePrimaryAction();
            }}
            style={({ pressed }) => [
              styles.primaryAction,
              joining && styles.primaryActionDisabled,
              pressed && !joining && styles.pressed,
            ]}
            testID="mobile-community-primary-action"
          >
            {joining ? (
              <ActivityIndicator color={theme.about.updateOnGradient} size="small" />
            ) : (
              <Text maxFontSizeMultiplier={2} style={styles.primaryActionLabel}>
                {joined ? copy.communityOpen : copy.communityJoin}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityLabel={copy.communityCopyInvite}
            accessibilityRole="button"
            onPress={() => {
              void copyInvite();
            }}
            style={({ pressed }) => [styles.copyAction, pressed && styles.pressed]}
            testID="mobile-community-copy"
          >
            <AboutLinkIcon color={theme.about.textSecondary} size={18} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
