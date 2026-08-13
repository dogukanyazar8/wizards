import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  hasGroupCreateProgress,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type DMConversationDTO,
  type GroupCreateState,
  type GroupCreateStep,
  type GroupDMCreateRequest,
} from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { DestructiveConfirmationSheet } from "../../components/kit/destructive-confirmation-sheet";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useGroupChatStyles } from "../group-chat.styles";
import { MobileGroupIdentityStep, MobileGroupIdentityStepFooter } from "./identity-step";
import {
  MobileGroupMemberStep,
  MobileGroupMemberStepFooter,
  type MobileGroupCreateConversation,
  type MobileGroupCreateFriend,
} from "./member-step";

export type { MobileGroupCreateConversation, MobileGroupCreateFriend };

export interface MobileGroupCreateScreenProps {
  /** V9's source for "SIK MESAJLAŞTIKLARIN" — the inbox, not a new endpoint. */
  readonly conversations?: readonly MobileGroupCreateConversation[];
  readonly friends: readonly MobileGroupCreateFriend[];
  /** 2c's "Düzenle" re-enters at step one; the route carries which step to open. */
  readonly initialStep?: GroupCreateStep;
  readonly isPending?: boolean;
  /** Injected in tests so V9's 30-day window does not depend on the wall clock. */
  readonly now?: Date;
  onCancel(): void;
  onCreated(conversationId: string): void;
  /** Resolves to an https icon URL, or null when the user backs out. */
  onPickPhoto?(): Promise<string | null>;
  onSubmit(input: GroupDMCreateRequest): Promise<DMConversationDTO>;
  /** The "Sen" tile's initials source. */
  readonly viewerLabel?: string;
}

/** D2's ceiling flash: two beats, unless the reader has asked for less motion. */
const CAP_FLASH_STEPS = [true, false, true, false] as const;
const CAP_FLASH_INTERVAL_MS = 180;
const CAP_FLASH_STILL_MS = 900;

/**
 * 2b + 2c behind one route. The shell owns the selection state and the two
 * chrome pieces both steps share — the header with its counter and step bars,
 * and the footer slot — while each step owns its own body.
 *
 * Every rule about what may be picked and what may be submitted comes from
 * `@wizards/types`: this file owns pixels and navigation, so the web dialog can
 * enforce the identical ceiling without a second implementation.
 */
export function MobileGroupCreateScreen({
  conversations = [],
  friends,
  initialStep,
  isPending = false,
  now,
  onCancel,
  onCreated,
  onPickPhoto,
  onSubmit,
  viewerLabel = copy.groupCreateYou,
}: MobileGroupCreateScreenProps) {
  const theme = useTheme();
  const styles = useGroupChatStyles();
  const groupTokens = theme.groupChat;
  const reducedMotion = useReducedMotion() === true;
  const [state, setState] = useState<GroupCreateState>(() => ({
    ...createInitialGroupCreateState(),
    ...(initialStep ? { step: initialStep } : {}),
  }));
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [capWarning, setCapWarning] = useState(false);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isIdentityStep = state.step === "identity";
  const busy = isPending || isSubmitting;
  // Both steps resolve selected ids. Share one index instead of repeating a
  // nested scan on every render and every selected member.
  const friendsById = useMemo(
    () => new Map(friends.map((friend) => [friend.id, friend] as const)),
    [friends],
  );
  const selectedFriends = useMemo(
    () =>
      state.selectedUserIds
        .map((userId) => friendsById.get(userId))
        .filter((friend): friend is MobileGroupCreateFriend => Boolean(friend)),
    [friendsById, state.selectedUserIds],
  );

  const clearFlash = useCallback(() => {
    for (const timer of flashTimers.current) {
      clearTimeout(timer);
    }
    flashTimers.current = [];
  }, []);

  useEffect(() => clearFlash, [clearFlash]);

  /**
   * D2. A refused tap has to say something, and the counter is the thing that
   * refused it. With reduced motion on it changes colour once and settles —
   * the message survives, the blinking does not.
   */
  const flashCeiling = useCallback(() => {
    clearFlash();

    if (reducedMotion) {
      setCapWarning(true);
      flashTimers.current.push(setTimeout(() => setCapWarning(false), CAP_FLASH_STILL_MS));
      return;
    }

    CAP_FLASH_STEPS.forEach((on, index) => {
      flashTimers.current.push(
        setTimeout(() => setCapWarning(on), (index + 1) * CAP_FLASH_INTERVAL_MS),
      );
    });
  }, [clearFlash, reducedMotion]);

  const handleToggleMember = useCallback(
    (userId: string) => {
      setState((current) => {
        if (isGroupSelectionFull(current) && !current.selectedUserIds.includes(userId)) {
          flashCeiling();
          return current;
        }

        return toggleGroupMember(current, userId);
      });
    },
    [flashCeiling],
  );

  const handleBack = useCallback(() => {
    // 2c §E2: step two always walks back to step one — the picking is the
    // expensive part of the flow, and leaving the route would drop it.
    if (isIdentityStep) {
      setState((current) => ({ ...current, step: "members" }));
      return;
    }

    if (hasGroupCreateProgress(state)) {
      setConfirmingCancel(true);
      return;
    }

    onCancel();
  }, [isIdentityStep, onCancel, state]);

  const submit = useCallback(async () => {
    if (!canSubmitGroup(state) || busy) {
      return;
    }

    setIsSubmitting(true);
    try {
      const conversation = await onSubmit(toGroupCreateRequest(state, iconUrl));
      onCreated(conversation.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [busy, iconUrl, onCreated, onSubmit, state]);

  const pickPhoto = useCallback(async () => {
    if (!onPickPhoto) {
      return;
    }

    // The tile goes busy for the whole call. The picker covers it while the
    // reader is choosing; what the flag is really for is the upload behind it,
    // which is the part that used to leave the screen looking untouched.
    setIsUploadingPhoto(true);
    try {
      const picked = await onPickPhoto();
      if (picked) {
        setIconUrl(picked);
      }
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [onPickPhoto]);

  return (
    <View style={styles.screen} testID="mobile-group-create-screen">
      <View style={styles.stepHeader}>
        <View style={styles.stepHeaderRow}>
          <Pressable
            accessibilityLabel={copy.dmBackAction}
            accessibilityRole="button"
            onPress={handleBack}
            style={styles.stepHeaderBack}
            testID={isIdentityStep ? "mobile-group-create-back" : "mobile-group-create-cancel"}
          >
            <MobileLineIcon
              color={groupTokens.stepHeader.backIconColor}
              name="back-arrow"
              size={groupTokens.stepHeader.backIcon}
            />
          </Pressable>
          <View style={styles.stepHeaderText}>
            <Text style={styles.stepHeaderTitle}>
              {isIdentityStep
                ? copy.groupCreateIdentityStepTitle
                : copy.groupCreateMembersStepTitle}
            </Text>
            <Text style={styles.stepHeaderSubtitle}>
              {isIdentityStep
                ? copy.groupCreateStep2Subtitle.replace(
                    "{count}",
                    String(getGroupSelectionCount(state)),
                  )
                : copy.groupCreateStep1Subtitle.replace("{max}", String(GROUP_DM_MAX_PARTICIPANTS))}
            </Text>
          </View>
          {isIdentityStep ? null : (
            <Text
              style={[styles.stepHeaderCounter, capWarning ? styles.stepHeaderCounterOver : null]}
              testID="mobile-group-create-counter"
            >
              {getGroupSelectionCount(state)}
              <Text
                style={capWarning ? styles.stepHeaderCounterOver : styles.stepHeaderCounterTotal}
              >
                {`/${GROUP_DM_MAX_PARTICIPANTS}`}
              </Text>
            </Text>
          )}
        </View>
        <View style={styles.stepBarRow}>
          <View style={[styles.stepBar, styles.stepBarFilled]} testID="mobile-group-step-bar-1" />
          <View
            style={[styles.stepBar, isIdentityStep ? styles.stepBarFilled : null]}
            testID="mobile-group-step-bar-2"
          />
        </View>
      </View>

      {isIdentityStep ? (
        <>
          <MobileGroupIdentityStep
            iconUrl={iconUrl}
            isUploadingPhoto={isUploadingPhoto}
            onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
            onEditMembers={() => setState((current) => ({ ...current, step: "members" }))}
            {...(onPickPhoto ? { onPickPhoto: () => void pickPhoto() } : {})}
            onRemovePhoto={() => setIconUrl(null)}
            selectedFriends={selectedFriends}
            state={state}
            viewerLabel={viewerLabel}
          />
          <MobileGroupIdentityStepFooter busy={busy} onSubmit={() => void submit()} state={state} />
        </>
      ) : (
        <>
          <MobileGroupMemberStep
            conversations={conversations}
            friends={friends}
            friendsById={friendsById}
            {...(now ? { now } : {})}
            onToggleMember={handleToggleMember}
            state={state}
          />
          <MobileGroupMemberStepFooter
            onAdvance={() => setState((current) => ({ ...current, step: "identity" }))}
            state={state}
          />
        </>
      )}

      <DestructiveConfirmationSheet
        body={copy.groupCreateMinimumHint}
        busy={false}
        confirmLabel={copy.groupCreateCancelConfirm}
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={() => {
          setConfirmingCancel(false);
          onCancel();
        }}
        open={confirmingCancel}
        testID="mobile-group-create-cancel-confirm"
        title={copy.groupCreateCancelTitle}
      />
    </View>
  );
}
