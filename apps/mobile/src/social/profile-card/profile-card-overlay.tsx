import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { DestructiveConfirmationSheet } from "../../app/components/kit/destructive-confirmation-sheet";
import { ActionSheet, OptionSheet } from "../../app/components/kit/sheet-primitives";
import {
  MOBILE_OVERLAY_CLOSE_DURATION_MS,
  MOBILE_OVERLAY_CLOSE_EASING,
  OverlaySurface,
  useOverlayPhase,
} from "../../app/components/kit/overlay-surface";
import { useToast } from "../../app/components/kit/toast";
import { startMobileDirectCall } from "../../app/features/mobile-direct-call-bridge";
import { useMobileHaptics } from "../../app/providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../../app/providers/mobile-locale-provider";
import { useMobileAccountSettingsQuery } from "../../account/mobile-account-settings-query";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { MobileCustomStatusSheet } from "../mobile-custom-status-sheet";
import type { MobileUserReportReason } from "../mobile-social-client";
import {
  useMobileFriendsQuery,
  useMobileSocialMutations,
  useMobileUserProfileQuery,
} from "../mobile-social-query";
import { MobileStatusPickerSheet } from "../mobile-status-picker-sheet";
import { MobileUserNoteSheet } from "../mobile-user-note-sheet";
import { ProfileCardMenu, type ProfileCardMenuItem } from "./profile-card-menu";
import {
  ProfileCardErrorState,
  ProfileCardSkeleton,
  ProfileCardView,
} from "./profile-card-view";
import { PROFILE_CARD_OPEN_DURATION_MS, useProfileCardStyles } from "./profile-card.styles";

export interface MobileProfileCardTarget {
  /** Server surfaces pass their id so the card can show role chips (README 1a). */
  readonly serverId?: string | undefined;
  readonly userId: string;
}

export interface MobileProfileCardController {
  readonly openProfileCard: (target: MobileProfileCardTarget) => void;
}

const NOOP_CONTROLLER: MobileProfileCardController = { openProfileCard: () => undefined };

const ProfileCardContext = createContext<MobileProfileCardController>(NOOP_CONTROLLER);

/**
 * Every avatar/name touch in the app opens the same card through this hook. It
 * degrades to a no-op outside the provider so isolated component tests of a
 * message row do not need the whole social stack.
 */
export function useMobileProfileCard(): MobileProfileCardController {
  return useContext(ProfileCardContext);
}

/**
 * Built per render rather than hoisted: `copy` is a proxy that resolves each
 * access against the live locale, so a module-level literal would pin the
 * reason labels to whatever language the bundle booted in.
 */
function readReportReasons(): readonly { label: string; value: MobileUserReportReason }[] {
  return [
    { label: copy.profileCardReportReasonHarassment, value: "harassment" },
    { label: copy.profileCardReportReasonSpam, value: "spam" },
    { label: copy.profileCardReportReasonInappropriate, value: "inappropriate" },
    { label: copy.profileCardReportReasonImpersonation, value: "impersonation" },
    { label: copy.profileCardReportReasonOther, value: "other" },
  ];
}

function ProfileCardOverlay({
  onClose,
  open,
  target,
}: {
  onClose(): void;
  readonly open: boolean;
  readonly target: MobileProfileCardTarget;
}) {
  const styles = useProfileCardStyles();
  const haptics = useMobileHaptics();
  const { showToast } = useToast();
  const { apiClient, session, status } = useMobileAuth();
  // The card reads its strings off the `activeMobileCopy` proxy, which is live
  // per access but only repaints what re-renders. Subscribing to the runtime is
  // what makes a language switch reach a card that is already mounted.
  const { locale } = useMobileLocaleRuntime();
  const mutations = useMobileSocialMutations(apiClient);
  // Only your own card offers the status sheets, and only they need the emoji —
  // the peer profile payload carries the status text but not its emoji.
  const accountQuery = useMobileAccountSettingsQuery(
    apiClient,
    status === "signed-in" && target.userId === session?.user.id,
  );
  const customStatusEmoji = accountQuery.data?.account.customStatusEmoji ?? null;
  const cardRef = useRef<View | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [customStatusOpen, setCustomStatusOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  const { phase, settleClosed } = useOverlayPhase(open);
  const profileQuery = useMobileUserProfileQuery(apiClient, {
    enabled: status === "signed-in",
    serverId: target.serverId,
    userId: target.userId,
  });
  const profile = profileQuery.data ?? null;
  const displayName = profile ? (profile.user.displayName ?? profile.user.username) : "";

  // Replying to an incoming request needs the request id, which the profile
  // payload does not carry; the friends overview is the one cache that holds it.
  // Same resolution the 1c page does, so both surfaces answer the same request.
  const friendsQuery = useMobileFriendsQuery(
    apiClient,
    status === "signed-in" && profile?.relationship === "incoming",
  );
  const incomingRequestId = useMemo(() => {
    if (!profile || profile.relationship !== "incoming") {
      return null;
    }
    return (
      friendsQuery.data?.pending.incoming.find((entry) => entry.sender.id === profile.user.id)?.id ??
      null
    );
  }, [friendsQuery.data, profile]);

  useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    if (phase === "open") {
      // ~200ms scale(.96→1) + fade, straight from the handoff interaction notes.
      progress.value = reducedMotion
        ? 1
        : withTiming(1, {
            duration: PROFILE_CARD_OPEN_DURATION_MS,
            easing: Easing.out(Easing.cubic),
          });
      return;
    }

    if (reducedMotion) {
      progress.value = 0;
      settleClosed();
      return;
    }

    progress.value = withTiming(
      0,
      { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: MOBILE_OVERLAY_CLOSE_EASING },
      (finished) => {
        "worklet";
        if (finished === true) {
          runOnJS(settleClosed)();
        }
      },
    );
  }, [phase, progress, reducedMotion, settleClosed]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }), []);
  const animatedCardStyle = useAnimatedStyle(
    () => ({
      opacity: progress.value,
      transform: [{ scale: 0.96 + progress.value * 0.04 }],
    }),
    [],
  );

  const openConversation = useCallback(async () => {
    const result = await mutations.openDM.mutateAsync(target.userId);
    return result.conversation.id;
  }, [mutations.openDM, target.userId]);

  const handleMessage = useCallback(() => {
    void (async () => {
      const conversationId = await openConversation();
      if (mobileNavigationRef.isReady()) {
        mobileNavigationRef.navigate("DirectMessage", { conversationId });
      }
      onClose();
    })();
  }, [onClose, openConversation]);

  const startCall = useCallback(
    (video: boolean) => {
      void (async () => {
        const conversationId = await openConversation();
        await startMobileDirectCall({ conversationId, title: displayName, video });
        onClose();
      })();
    },
    [displayName, onClose, openConversation],
  );

  const handleAddFriend = useCallback(() => {
    if (!profile) {
      return;
    }

    void (async () => {
      await mutations.createRequest.mutateAsync({
        userId: profile.user.id,
        username: profile.user.username,
      });
      haptics.impact();
    })();
  }, [haptics, mutations.createRequest, profile]);

  const handleUnblock = useCallback(() => {
    void (async () => {
      await mutations.unblockFriend.mutateAsync(target.userId);
      onClose();
    })();
  }, [mutations.unblockFriend, onClose, target.userId]);

  const handleBlockConfirm = useCallback(async () => {
    await mutations.blockFriend.mutateAsync(target.userId);
    haptics.impact();
    setBlockOpen(false);
    showToast({
      message: copy.profileCardBlockedToastTemplate.replace("{name}", displayName),
      tone: "success",
    });
    onClose();
  }, [displayName, haptics, mutations.blockFriend, onClose, showToast, target.userId]);

  const handleReport = useCallback(
    (reason: MobileUserReportReason) => {
      setReportOpen(false);
      void (async () => {
        await mutations.reportUser.mutateAsync({ reason, userId: target.userId });
        showToast({ message: copy.profileCardReportedToast, tone: "success" });
        onClose();
      })();
    },
    [mutations.reportUser, onClose, showToast, target.userId],
  );

  /**
   * The card stays up behind the 2b/2c sheets: dismissing a sheet returns to the
   * card the user opened it from, which is what the handoff shows and what makes
   * "change status, keep reading the profile" work without a re-open.
   */
  const openStatusPicker = useCallback(() => setStatusPickerOpen(true), []);
  const openCustomStatus = useCallback(() => setCustomStatusOpen(true), []);

  /** Friend-request replies are not a 11e surface; 11b still owns this funnel. */
  const openPendingSurface = useCallback(() => setRequestOpen(true), []);

  const handleAcceptRequest = useCallback(() => {
    if (!incomingRequestId || !profile) {
      return;
    }

    void (async () => {
      await mutations.acceptRequest.mutateAsync({
        requestId: incomingRequestId,
        userId: profile.user.id,
      });
      haptics.impact();
      showToast({
        message: copy.profileCardRequestAcceptedToastTemplate.replace("{name}", displayName),
        tone: "success",
      });
    })();
  }, [displayName, haptics, incomingRequestId, mutations.acceptRequest, profile, showToast]);

  /** Declining closes the card: there is nothing left on it to act on. */
  const handleRejectRequest = useCallback(() => {
    if (!incomingRequestId || !profile) {
      return;
    }

    void (async () => {
      await mutations.rejectRequest.mutateAsync({
        requestId: incomingRequestId,
        userId: profile.user.id,
      });
      showToast({ message: copy.profileCardRequestRejectedToast, tone: "success" });
      onClose();
    })();
  }, [incomingRequestId, mutations.rejectRequest, onClose, profile, showToast]);

  /**
   * 11c: "Profili görüntüle" and the mutual summary row both land on the full
   * page. The card closes first so back returns to the surface the card was
   * opened from, not to a dismissed overlay.
   */
  const openFullProfile = useCallback(() => {
    onClose();
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("UserProfile", {
        ...(target.serverId ? { serverId: target.serverId } : {}),
        userId: target.userId,
      });
    }
  }, [onClose, target.serverId, target.userId]);

  const handleEditProfile = useCallback(() => {
    onClose();
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("ProfileEdit");
    }
  }, [onClose]);

  const menuItems = useMemo<readonly ProfileCardMenuItem[]>(
    () => [
      // The note row leads: it is the only non-destructive action in the menu,
      // and its label reports whether a note already exists.
      {
        icon: "edit",
        id: "note",
        label: profile?.note ? copy.profileNoteEditAction : copy.profileNoteAddAction,
        onPress: () => {
          setMenuOpen(false);
          setNoteOpen(true);
        },
      },
      {
        destructive: true,
        icon: "block",
        id: "block",
        label: copy.profileCardMenuBlock,
        onPress: () => {
          setMenuOpen(false);
          setBlockOpen(true);
        },
      },
      {
        destructive: true,
        icon: "flag",
        id: "report",
        label: copy.profileCardMenuReport,
        onPress: () => {
          setMenuOpen(false);
          setReportOpen(true);
        },
      },
    ],
    // `locale` is a repaint dependency, not a value one: the labels come off the
    // copy proxy and have to be re-read when the language changes.
    [locale, profile?.note],
  );

  const reportReasons = useMemo(() => readReportReasons(), [locale]);

  const isBusy =
    mutations.openDM.isPending ||
    mutations.createRequest.isPending ||
    mutations.acceptRequest.isPending ||
    mutations.rejectRequest.isPending ||
    mutations.unblockFriend.isPending ||
    // Without a resolved request id there is nothing to accept, so the
    // "İsteği yanıtla" button stays inert instead of opening a dead sheet.
    (profile?.relationship === "incoming" && incomingRequestId === null);

  return (
    <>
      <OverlaySurface
        accessibilityLabel={copy.profileCardCloseAction}
        animatedBackdropStyle={animatedBackdropStyle}
        backdropStyle={styles.backdrop}
        focusRef={cardRef}
        onClose={onClose}
        open={open}
        style={styles.surface}
        testID="mobile-profile-card"
      >
        {/*
          React Native has no "dialog" accessibility role; `accessibilityViewIsModal`
          plus a labelled focus target is the platform equivalent, and it is what
          every other overlay in this app announces itself with.
        */}
        <Animated.View
          accessibilityLabel={copy.profileCardDialogLabel}
          accessibilityViewIsModal
          pointerEvents="box-none"
          ref={cardRef}
          style={[styles.cardShell, animatedCardStyle]}
          testID="mobile-profile-card-shell"
        >
          {profile ? (
            <ProfileCardView
              busy={isBusy}
              menu={menuOpen ? <ProfileCardMenu items={menuItems} /> : null}
              onAddFriend={handleAddFriend}
              onEditProfile={handleEditProfile}
              onMessage={handleMessage}
              onOpenCustomStatus={openCustomStatus}
              onOpenMenu={profile.self ? null : () => setMenuOpen((current) => !current)}
              onOpenMutuals={openFullProfile}
              onOpenStatusPicker={openStatusPicker}
              onRespondToRequest={openPendingSurface}
              onUnblock={handleUnblock}
              onVideoCall={() => startCall(true)}
              onViewProfile={openFullProfile}
              onVoiceCall={() => startCall(false)}
              profile={profile}
              serverId={target.serverId}
            />
          ) : profileQuery.isError ? (
            <ProfileCardErrorState onRetry={() => void profileQuery.refetch()} />
          ) : (
            <ProfileCardSkeleton />
          )}
        </Animated.View>
      </OverlaySurface>
      <DestructiveConfirmationSheet
        body={copy.profileCardBlockConfirmBody.replace("{name}", displayName)}
        busy={mutations.blockFriend.isPending}
        confirmLabel={copy.profileCardMenuBlock}
        icon="ban-outline"
        onCancel={() => setBlockOpen(false)}
        onConfirm={handleBlockConfirm}
        open={blockOpen}
        testID="mobile-profile-card-block-confirm"
        title={copy.profileCardBlockConfirmTitle}
      />
      <OptionSheet
        icon="flag-outline"
        onClose={() => setReportOpen(false)}
        onSelect={handleReport}
        open={reportOpen}
        options={reportReasons}
        subtitle={copy.profileCardReportBody}
        testID="mobile-profile-card-report"
        title={copy.profileCardReportTitle}
        tone="danger"
      />
      <ActionSheet
        actions={[
          {
            icon: "person-add-outline",
            id: "accept",
            label: copy.friendsAccept,
            onPress: handleAcceptRequest,
            testID: "mobile-profile-card-request-accept",
          },
          {
            destructive: true,
            icon: "close-circle-outline",
            id: "reject",
            label: copy.friendsReject,
            onPress: handleRejectRequest,
            testID: "mobile-profile-card-request-reject",
          },
        ]}
        icon="person-add-outline"
        onClose={() => setRequestOpen(false)}
        open={requestOpen && incomingRequestId !== null}
        subtitle={copy.profileCardRequestSheetSubtitle.replace("{name}", displayName)}
        testID="mobile-profile-card-request"
        title={copy.profileCardRequestSheetTitle}
      />
      {profile && !profile.self ? (
        <MobileUserNoteSheet
          client={apiClient}
          note={profile.note}
          onClose={() => setNoteOpen(false)}
          open={noteOpen}
          userId={profile.user.id}
          username={profile.user.username}
        />
      ) : null}
      {profile?.self ? (
        <>
          <MobileStatusPickerSheet
            client={apiClient}
            customStatus={profile.presence.customStatus}
            customStatusEmoji={customStatusEmoji}
            onClose={() => setStatusPickerOpen(false)}
            onOpenCustomStatus={openCustomStatus}
            open={statusPickerOpen}
            presence={profile.presence.status}
          />
          <MobileCustomStatusSheet
            client={apiClient}
            customStatus={profile.presence.customStatus}
            customStatusEmoji={customStatusEmoji}
            onClose={() => setCustomStatusOpen(false)}
            open={customStatusOpen}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Mounts one card for the whole app. Keeping a single instance means the five
 * entry points share its cache, its animation and its back-key registration.
 */
export function MobileProfileCardProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<MobileProfileCardTarget | null>(null);
  const [open, setOpen] = useState(false);
  const controller = useMemo<MobileProfileCardController>(
    () => ({
      openProfileCard: (next) => {
        setTarget(next);
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <ProfileCardContext.Provider value={controller}>
      {children}
      {target ? (
        <ProfileCardOverlay onClose={() => setOpen(false)} open={open} target={target} />
      ) : null}
    </ProfileCardContext.Provider>
  );
}
