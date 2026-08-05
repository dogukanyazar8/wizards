import { useQuery } from "@tanstack/react-query";
import { useCallback, useContext, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { DestructiveConfirmationSheet, OptionSheet } from "../app/components/kit";
import { MessageImageLightbox } from "../app/components/message-image-lightbox";
import { startMobileDirectCall } from "../app/features/mobile-direct-call-bridge";
import { getMobileShellTopInset } from "../app/mobile-app-shell";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon, type MobileLineIconName } from "../design/mobile-line-icons";
import { fetchMobileDMDetails } from "../dm/mobile-dm-details-client";
import {
  formatMobileMediaDuration,
  isMobileSharedMediaVideo,
  resolveMobileSharedMediaThumbnail,
} from "../dm/mobile-shared-media-model";
import { mobileCopy } from "../locale/mobile-copy";
import { useMobileDMConversationsQuery } from "../query/mobile-dm-conversations-query";
import { flattenMobileDMConversationPages } from "../query/mobile-dm-conversations-query";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { navigateMobileRouteIntent } from "../navigation/mobile-navigation-ref";
import { useMobileUserBadgesQuery } from "./mobile-badges-query";
import { buildMobileBadgesRouteIntent } from "./profile-badges/mobile-badges-route";
import type { MobileUserReportReason } from "./mobile-social-client";
import {
  useMobileFriendsQuery,
  useMobileSocialMutations,
  useMobileUserProfileQuery,
} from "./mobile-social-query";
import { MobileUserNoteSheet } from "./mobile-user-note-sheet";
import {
  ProfileBadgeDetailSheet,
  type ProfileBadgeDetailRequest,
} from "./profile-badges/profile-badge-detail-sheet";
import {
  MOBILE_PROFILE_MEDIA_PREVIEW_LIMIT,
  ProfileAboutCard,
  ProfileIdentityCard,
  ProfileMutualFriendsCard,
  ProfileMutualServersCard,
  ProfileNoteCard,
  ProfilePageBanner,
  ProfilePageMenu,
  ProfilePageSkeleton,
  ProfileSharedMediaCard,
  ProfileStateNotice,
  type MobileProfileMediaItem,
  type MobileProfilePageChrome,
  type MobileProfilePageMenuItem,
} from "./profile-page/mobile-profile-page-sections";
import { createMobileProfilePageStyles } from "./profile-page/mobile-profile-page.styles";
import {
  buildMobileProfilePageSections,
  findMobileProfileDirectConversationId,
} from "./profile-page/mobile-profile-page-model";

const REPORT_REASONS: readonly MobileUserReportReason[] = [
  "harassment",
  "spam",
  "inappropriate",
  "impersonation",
  "other",
];

export interface MobileUserProfileScreenProps {
  readonly onBack: () => void;
  readonly onOpenConversation: (conversationId: string) => void;
  readonly onOpenProfileEdit: () => void;
  readonly onOpenServer: (serverId: string) => void;
  readonly onOpenUserProfile: (userId: string) => void;
  /**
   * Overrides the built-in 11e note sheet, for a host that owns its own note
   * surface. Without it the NOT card opens the 2b sheet in place.
   */
  readonly onOpenNoteEditor?: ((input: { userId: string }) => void) | undefined;
  /** 11f media gallery (2d). Without it the media card keeps its 3-tile preview only. */
  readonly onOpenSharedMedia?:
    ((input: { conversationId: string; userId: string }) => void) | undefined;
  readonly serverId?: string | undefined;
  readonly userId: string;
}

/**
 * 1c/1f full profile page. One 11a read drives every section; the DM-backed
 * media strip reads an existing conversation from the DM list cache and never
 * creates one.
 */
export function MobileUserProfileScreen({
  onBack,
  onOpenConversation,
  onOpenNoteEditor,
  onOpenProfileEdit,
  onOpenServer,
  onOpenSharedMedia,
  onOpenUserProfile,
  serverId,
  userId,
}: MobileUserProfileScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useThemedStyles(createMobileProfilePageStyles);
  // Context form, not the hook: the banner still lays out when a host renders
  // this screen without a SafeAreaProvider.
  const insets = useContext(SafeAreaInsetsContext);
  const copy = mobileCopy[locale];
  const shellTopInset = getMobileShellTopInset(insets?.top ?? 0);

  const profileQuery = useMobileUserProfileQuery(apiClient, { serverId, userId });
  const profile = profileQuery.data ?? null;
  // Its own request, running beside the profile read. The card and this page
  // share the cache entry, so arriving here from a card is already warm.
  const badgesQuery = useMobileUserBadgesQuery(apiClient, { userId });
  const mutations = useMobileSocialMutations(apiClient);

  const [menuOpen, setMenuOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [mutualFriendsExpanded, setMutualFriendsExpanded] = useState(false);
  const [mutualServersExpanded, setMutualServersExpanded] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  /** 06 §2: the badge sheet opens over the page; the page stays where it is. */
  const [badgeRequest, setBadgeRequest] = useState<ProfileBadgeDetailRequest | null>(null);

  const sections = useMemo(
    () => (profile ? buildMobileProfilePageSections(profile) : null),
    [profile],
  );
  const restricted = sections?.variant === "blocked";
  const isSelf = profile?.self === true;

  // The 1:1 conversation behind the media strip: read from the DM list cache,
  // never created here — visiting a profile must not open a DM.
  const conversationsQuery = useMobileDMConversationsQuery(
    apiClient,
    Boolean(profile) && !isSelf && !restricted,
  );
  const conversationId = useMemo(() => {
    if (!profile || isSelf || restricted) {
      return null;
    }
    return findMobileProfileDirectConversationId(
      flattenMobileDMConversationPages(conversationsQuery.data),
      profile.user.id,
    );
  }, [conversationsQuery.data, isSelf, profile, restricted]);

  const mediaQuery = useQuery({
    enabled: Boolean(conversationId),
    // Its own key: the DM details screen owns an infinite cache under the base
    // key and the two payload shapes must not share an entry.
    queryKey: [...mobileQueryKeys.dmDetails(conversationId ?? "none"), "profile-media"],
    queryFn: () => fetchMobileDMDetails(apiClient, conversationId ?? "", { limit: 30 }),
    staleTime: 60_000,
  });
  // Same reading of an attachment the 2d gallery does: a video keeps its tile on
  // the strength of its poster frame and play glyph, and only a photo with no
  // servable url drops out.
  const mediaItems = useMemo<MobileProfileMediaItem[]>(
    () =>
      (mediaQuery.data?.sharedAttachments.media ?? []).flatMap((entry) => {
        const isVideo = isMobileSharedMediaVideo(entry.attachment);
        const uri = resolveMobileSharedMediaThumbnail(entry.attachment);
        if (!isVideo && uri === null) {
          return [];
        }

        return [
          {
            durationLabel: isVideo ? formatMobileMediaDuration(entry.attachment.duration) : null,
            id: entry.attachment.id,
            isVideo,
            uri,
          },
        ];
      }),
    [mediaQuery.data],
  );

  // Accepting an incoming request needs its id, which the profile payload does
  // not carry; the friends cache is the one place that already holds it.
  const friendsQuery = useMobileFriendsQuery(apiClient, profile?.relationship === "incoming");
  const incomingRequestId = useMemo(() => {
    if (!profile || profile.relationship !== "incoming") {
      return null;
    }
    return (
      friendsQuery.data?.pending.incoming.find((entry) => entry.sender.id === profile.user.id)
        ?.id ?? null
    );
  }, [friendsQuery.data, profile]);

  const chrome: MobileProfilePageChrome = { copy, locale, styles };

  // One place opens the 2b note sheet — the NOT card and the three-dot menu row
  // both come through here, and a host may still take it over.
  const openNoteEditor = useCallback(() => {
    if (!profile) {
      return;
    }
    if (onOpenNoteEditor) {
      onOpenNoteEditor({ userId: profile.user.id });
      return;
    }
    setNoteOpen(true);
  }, [onOpenNoteEditor, profile]);

  /**
   * The 1:1 conversation the message and call actions both need: the cached one
   * when the DM already exists, otherwise a freshly opened one. Reading the
   * cache first keeps a message tap from creating a duplicate DM.
   */
  const resolveConversationId = useCallback(async () => {
    if (!profile) {
      return null;
    }
    if (conversationId) {
      return conversationId;
    }
    const created = await mutations.openDM.mutateAsync(profile.user.id);
    return created.conversation.id;
  }, [conversationId, mutations.openDM, profile]);

  const openConversation = useCallback(async () => {
    const target = await resolveConversationId();
    if (target) {
      onOpenConversation(target);
    }
  }, [onOpenConversation, resolveConversationId]);

  /**
   * 1c runs the same call flow as the 11b card: the shared starter the product
   * shell registers, not a navigation to the DM screen. The page used to open
   * the conversation and never ring.
   */
  const startCall = useCallback(
    (video: boolean) => {
      void (async () => {
        const target = await resolveConversationId();
        if (!target || !profile) {
          return;
        }
        await startMobileDirectCall({
          conversationId: target,
          title: profile.user.displayName?.trim() || profile.user.username,
          video,
        });
      })();
    },
    [profile, resolveConversationId],
  );

  const bannerColor =
    profile?.bannerColor ??
    (profile && (profile.self || profile.relationship === "friend")
      ? theme.profileCard.bannerDefault
      : theme.profileCard.bannerNeutral);

  const menuActions = useMemo<readonly MobileProfilePageMenuItem[]>(() => {
    if (!profile || profile.self) {
      return [];
    }

    return [
      {
        icon: "edit",
        id: "note",
        label: profile.note ? copy.profilePageEditNoteAction : copy.profilePageAddNoteAction,
        onPress: openNoteEditor,
      },
      {
        destructive: true,
        icon: "block",
        id: "block",
        label: profile.blocked ? copy.profilePageUnblockAction : copy.profilePageBlockAction,
        onPress: () =>
          profile.blocked
            ? mutations.unblockFriend.mutate(profile.user.id)
            : setBlockConfirmOpen(true),
      },
      {
        destructive: true,
        icon: "flag",
        id: "report",
        label: copy.profilePageReportAction,
        onPress: () => setReportOpen(true),
      },
    ];
  }, [copy, mutations.unblockFriend, openNoteEditor, profile]);

  return (
    <View style={styles.root} testID="mobile-user-profile-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="mobile-user-profile-scroll"
      >
        <View style={{ marginTop: -shellTopInset }}>
          <ProfilePageBanner
            bannerColor={bannerColor}
            bannerOffsetX={profile?.bannerOffsetX ?? null}
            bannerOffsetY={profile?.bannerOffsetY ?? null}
            bannerUrl={profile?.bannerUrl ?? null}
            copy={copy}
            menuOpen={menuOpen}
            onBack={onBack}
            onOpenMenu={() => setMenuOpen(true)}
            safeAreaTop={shellTopInset}
            styles={styles}
          />
        </View>

        {profileQuery.isPending ? <ProfilePageSkeleton /> : null}

        {profileQuery.isError ? (
          <ProfileStateNotice
            actionLabel={copy.profilePageRetryAction}
            chrome={chrome}
            message={copy.profilePageLoadFailed}
            onRetry={() => void profileQuery.refetch()}
          />
        ) : null}

        {profile && sections ? (
          <>
            <ProfileIdentityCard
              actions={
                <ProfileActionRow
                  busy={
                    mutations.createRequest.isPending ||
                    mutations.acceptRequest.isPending ||
                    mutations.unblockFriend.isPending ||
                    mutations.openDM.isPending
                  }
                  chrome={chrome}
                  incomingRequestId={incomingRequestId}
                  onAcceptRequest={(requestId) =>
                    mutations.acceptRequest.mutate({ requestId, userId: profile.user.id })
                  }
                  onAddFriend={() =>
                    void mutations.createRequest.mutateAsync({
                      userId: profile.user.id,
                      username: profile.user.username,
                    })
                  }
                  onEditProfile={onOpenProfileEdit}
                  onOpenConversation={() => void openConversation()}
                  onUnblock={() => mutations.unblockFriend.mutate(profile.user.id)}
                  onVideoCall={() => startCall(true)}
                  onVoiceCall={() => startCall(false)}
                  variant={sections.variant}
                />
              }
              badges={badgesQuery.data?.badges ?? []}
              badgesLoading={badgesQuery.isLoading}
              chrome={chrome}
              onPressBadge={(badge) => setBadgeRequest({ badgeId: badge.id, kind: "badge" })}
              onPressBadgeOverflow={() => {
                // 07 §2: on your own profile `+N` is a shortcut into
                // "Rozetlerim", which is the full list plus your progress; on
                // someone else's it stays the in-place list sheet, where no
                // counter of theirs is ever shown (06 §1).
                if (isSelf) {
                  navigateMobileRouteIntent(buildMobileBadgesRouteIntent(null));
                  return;
                }
                setBadgeRequest({ kind: "list" });
              }}
              profile={profile}
              sections={sections}
            />

            {restricted ? (
              <View style={styles.sectionCard} testID="mobile-user-profile-restricted">
                <Text style={styles.sectionLabel}>{copy.profilePageAboutHeading}</Text>
                <Text style={styles.restrictedLabel}>
                  {profile.blockedBy
                    ? copy.profilePageBlockedByNotice
                    : copy.profilePageBlockedNotice}
                </Text>
              </View>
            ) : null}

            {sections.about.visible ? (
              <ProfileAboutCard chrome={chrome} sections={sections} />
            ) : null}

            {sections.note.visible ? (
              <ProfileNoteCard
                chrome={chrome}
                note={sections.note.value}
                onPress={openNoteEditor}
              />
            ) : null}

            {sections.mutualServers.visible ? (
              <ProfileMutualServersCard
                chrome={chrome}
                expanded={mutualServersExpanded}
                onOpenServer={onOpenServer}
                onToggleExpanded={() => setMutualServersExpanded((current) => !current)}
                sections={sections}
              />
            ) : null}

            {sections.mutualFriends.visible ? (
              <ProfileMutualFriendsCard
                chrome={chrome}
                expanded={mutualFriendsExpanded}
                onOpenFriend={onOpenUserProfile}
                onToggleExpanded={() => setMutualFriendsExpanded((current) => !current)}
                sections={sections}
              />
            ) : null}

            {conversationId && !restricted ? (
              <ProfileSharedMediaCard
                chrome={chrome}
                items={mediaItems}
                onOpenItem={(index) =>
                  setLightboxUri(
                    mediaItems.slice(0, MOBILE_PROFILE_MEDIA_PREVIEW_LIMIT)[index]?.uri ?? null,
                  )
                }
                onSeeAll={
                  onOpenSharedMedia
                    ? () => onOpenSharedMedia({ conversationId, userId: profile.user.id })
                    : null
                }
                // The server's real total, not the length of the preview: the
                // strip only ever holds what the newest message page carried.
                totalCount={mediaQuery.data?.mediaCount ?? mediaItems.length}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {menuOpen && menuActions.length > 0 ? (
        <ProfilePageMenu chrome={chrome} items={menuActions} onDismiss={() => setMenuOpen(false)} />
      ) : null}

      <DestructiveConfirmationSheet
        body={copy.profilePageBlockConfirmBody}
        busy={mutations.blockFriend.isPending}
        confirmLabel={copy.profilePageBlockAction}
        icon="ban-outline"
        onCancel={() => setBlockConfirmOpen(false)}
        onConfirm={() => {
          if (profile) {
            mutations.blockFriend.mutate(profile.user.id);
          }
          setBlockConfirmOpen(false);
        }}
        open={blockConfirmOpen}
        testID="mobile-user-profile-block-confirm"
        title={copy.profilePageBlockConfirmTitle}
      />

      <OptionSheet
        onClose={() => setReportOpen(false)}
        onSelect={(reason) => {
          if (profile) {
            mutations.reportUser.mutate({ reason, userId: profile.user.id });
          }
          setReportOpen(false);
        }}
        open={reportOpen}
        options={REPORT_REASONS.map((reason) => ({
          label: copy.profilePageReportReasons[reason],
          value: reason,
        }))}
        subtitle={copy.profilePageReportSubtitle}
        testID="mobile-user-profile-report-sheet"
        title={copy.profilePageReportAction}
        tone="danger"
      />

      <ProfileBadgeDetailSheet
        badges={badgesQuery.data?.badges ?? []}
        client={apiClient}
        isSelf={isSelf}
        onClose={() => setBadgeRequest(null)}
        request={badgeRequest}
      />

      {profile && !profile.self ? (
        <MobileUserNoteSheet
          client={apiClient}
          note={profile.note}
          onClose={() => setNoteOpen(false)}
          open={noteOpen}
          userId={profile.user.id}
          username={profile.user.displayName?.trim() || profile.user.username}
        />
      ) : null}

      <MessageImageLightbox
        onClose={() => setLightboxUri(null)}
        open={lightboxUri !== null}
        uri={lightboxUri}
      />
    </View>
  );
}

function ProfileActionRow({
  busy,
  chrome,
  incomingRequestId,
  onAcceptRequest,
  onAddFriend,
  onEditProfile,
  onOpenConversation,
  onUnblock,
  onVideoCall,
  onVoiceCall,
  variant,
}: {
  readonly busy: boolean;
  readonly chrome: MobileProfilePageChrome;
  readonly incomingRequestId: string | null;
  readonly onAcceptRequest: (requestId: string) => void;
  readonly onAddFriend: () => void;
  readonly onEditProfile: () => void;
  readonly onOpenConversation: () => void;
  readonly onUnblock: () => void;
  readonly onVideoCall: () => void;
  readonly onVoiceCall: () => void;
  readonly variant: "blocked" | "friend" | "peer" | "self";
}) {
  const theme = useTheme();
  const { copy, styles } = chrome;

  if (variant === "blocked") {
    return (
      <View style={styles.actionRow}>
        <ProfilePrimaryAction
          busy={busy}
          chrome={chrome}
          icon="block"
          label={copy.profilePageUnblockAction}
          onPress={onUnblock}
          testID="mobile-user-profile-unblock"
        />
      </View>
    );
  }

  if (variant === "self") {
    return (
      <View style={styles.actionRow}>
        <ProfilePrimaryAction
          busy={false}
          chrome={chrome}
          icon="edit"
          label={copy.profilePageEditProfileAction}
          onPress={onEditProfile}
          testID="mobile-user-profile-edit"
        />
      </View>
    );
  }

  if (variant === "friend") {
    return (
      <View style={styles.actionRow}>
        <ProfilePrimaryAction
          busy={busy}
          chrome={chrome}
          icon="chat-bubble"
          label={copy.profilePageMessageAction}
          onPress={onOpenConversation}
          testID="mobile-user-profile-message"
        />
        <Pressable
          accessibilityLabel={copy.profilePageVoiceCallAction}
          accessibilityRole="button"
          onPress={onVoiceCall}
          style={({ pressed }) => [styles.actionSecondary, pressed && styles.actionPressed]}
          testID="mobile-user-profile-voice-call"
        >
          <MobileLineIcon color={theme.profileCard.secondaryActionIcon} name="phone" size={17} />
        </Pressable>
        <Pressable
          accessibilityLabel={copy.profilePageVideoCallAction}
          accessibilityRole="button"
          onPress={onVideoCall}
          style={({ pressed }) => [styles.actionSecondary, pressed && styles.actionPressed]}
          testID="mobile-user-profile-video-call"
        >
          <MobileLineIcon color={theme.profileCard.secondaryActionIcon} name="video" size={17} />
        </Pressable>
      </View>
    );
  }

  // 1b button set: friendship first, message second, no call buttons.
  const requestPending = incomingRequestId === null && busy;
  return (
    <>
      <View style={styles.actionRow}>
        {incomingRequestId ? (
          <ProfilePrimaryAction
            busy={busy}
            chrome={chrome}
            icon="person-plus"
            label={copy.profilePageAcceptRequestAction}
            onPress={() => onAcceptRequest(incomingRequestId)}
            testID="mobile-user-profile-accept-request"
          />
        ) : (
          <ProfilePrimaryAction
            busy={requestPending}
            chrome={chrome}
            icon="person-plus"
            label={copy.profilePageAddFriendAction}
            onPress={onAddFriend}
            testID="mobile-user-profile-add-friend"
          />
        )}
        <Pressable
          accessibilityLabel={copy.profilePageMessageAction}
          accessibilityRole="button"
          onPress={onOpenConversation}
          style={({ pressed }) => [styles.actionSecondary, pressed && styles.actionPressed]}
          testID="mobile-user-profile-message"
        >
          <MobileLineIcon
            color={theme.profileCard.secondaryActionIcon}
            name="chat-bubble"
            size={17}
          />
        </Pressable>
      </View>
      <Text style={styles.actionNotice}>{copy.profilePageNonFriendCallNotice}</Text>
    </>
  );
}

function ProfilePrimaryAction({
  busy,
  chrome,
  icon,
  label,
  onPress,
  testID,
}: {
  readonly busy: boolean;
  readonly chrome: MobileProfilePageChrome;
  readonly icon: MobileLineIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const theme = useTheme();
  const { styles } = chrome;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionPrimary,
        busy && styles.actionDisabled,
        pressed && !busy && styles.actionPressed,
      ]}
      testID={testID}
    >
      <MobileLineIcon color={theme.text.onPrimary} name={icon} size={16} />
      <Text maxFontSizeMultiplier={2} style={styles.actionPrimaryLabel}>
        {label}
      </Text>
    </Pressable>
  );
}
