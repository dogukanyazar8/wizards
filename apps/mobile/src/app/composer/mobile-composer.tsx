import {
  Ionicons,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  getMobileAttachmentDraftSendGuard,
  getMobileAttachmentUploadReadiness,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MobileBootstrapFeature,
  type MobileMediaRuntimeState,
} from "../mobile-root-screen-shared";
import {
  PanResponder,
  ScrollView,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { ReactNode } from "react";
import type { MessageAttachment, UploadedAttachmentInput } from "@wizards/types";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { formatMobileMediaAssetMeta } from "../components/media-primitives";
import { formatMobileAttachmentSize } from "../components/message-primitives";
import {
  formatMobileVoiceDuration,
  getMobileVoiceWaveformHeights,
  getMobileVoiceWaveformPath,
} from "../components/message-voice-attachment";
import { resolveMobileVoiceRecordGesture } from "../../media/mobile-voice-record-gesture";
import { MobileCachedImage } from "../components/mobile-cached-image";
import { ActionSheet, Avatar, Icon } from "../components/kit";
import { useMobileComposerStyles } from "./mobile-composer.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { MobileGifPicker } from "../../media/mobile-gif-picker";
import { MessageEmojiPicker } from "../components/message-emoji-picker";
import {
  type MobileMessageAttachmentDraft,
  type MobilePickedMessageAttachment,
} from "../../media/mobile-message-attachment-contract";
import {
  pickMobileMessageAttachmentFromDocument,
  pickMobileMessageAttachmentFromPhotoLibrary,
} from "../../media/mobile-message-attachment-picker";
import {
  executeMobileMessageAttachmentUpload,
  type MobileMessageAttachmentUploadFailureCode,
} from "../../media/mobile-message-attachment-upload-service";
import { uploadMobileMessageAttachmentToUploadThing } from "../../media/mobile-message-attachment-upload";
import { useMobileVoiceMessageRecorder } from "../../media/mobile-voice-message-recorder";
import {
  applyMobileMentionSelection,
  filterMobileMentionCandidates,
  resolveMobileCaretAfterChange,
  resolveMobileMentionQuery,
  type MobileMentionCandidate,
} from "../mobile-mention";

export type MobileComposerIntent = {
  readonly authorLabel?: string;
  readonly content: string;
  readonly messageId: string;
  readonly mode: "edit" | "reply";
};

/** §2 "1d": the mic crossfades to the plane in 150ms once the field has text. */
const DM_PRIMARY_MORPH_DURATION_MS = 150;

export function DMComposer({
  attachmentsFeature,
  getAccessToken,
  mediaState,
  intent = null,
  mentionCandidates,
  onCancelIntent,
  onClearSelectedMediaAsset,
  onDraftChange,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSend,
  onSendGif,
  placeholder = copy.dmComposerPlaceholder,
  sendActionLabel = copy.dmSendAction,
  topAccessory,
  variant = "default",
}: {
  attachmentsFeature?: MobileBootstrapFeature | null;
  getAccessToken?: () => Promise<string | null>;
  mediaState?: MobileMediaRuntimeState;
  intent?: MobileComposerIntent | null;
  /**
   * 10a: server members the `@` autocomplete may offer. Only channel and thread
   * composers pass it; a DM has no roster, so the panel never opens there.
   */
  mentionCandidates?: readonly MobileMentionCandidate[];
  onCancelIntent?: () => void;
  onClearSelectedMediaAsset?: () => void;
  onDraftChange?: (content: string) => void;
  onRequestDocumentPicker?: () => Promise<void>;
  onRequestPhotoLibraryPicker?: () => Promise<void>;
  /**
   * `attachmentPreviews` mirrors `attachments` with the uploaded metadata so the
   * optimistic bubble can render its cards before the server echo lands.
   */
  onSend(
    content: string,
    attachments?: readonly UploadedAttachmentInput[],
    attachmentPreviews?: readonly MessageAttachment[],
  ): Promise<boolean>;
  onSendGif?: (gifId: string) => Promise<boolean>;
  placeholder?: string;
  sendActionLabel?: string;
  /**
   * §2 "1f".5: a row that belongs inside the composer block, above the input —
   * the thread's "also send to the channel" confirmation. It sits here rather
   * than above the composer so the block keeps one top rule and one padding.
   */
  topAccessory?: ReactNode;
  variant?: "channel" | "default" | "dm";
}) {
  const theme = useTheme();
  const styles = useMobileComposerStyles();
  const [draft, setDraft] = useState("");
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [channelAttachmentDrafts, setChannelAttachmentDrafts] = useState<
    readonly MobileMessageAttachmentDraft[]
  >([]);
  const [channelAttachmentUploadError, setChannelAttachmentUploadError] = useState<string | null>(
    null,
  );
  const [isChannelAttachmentUploading, setChannelAttachmentUploading] = useState(false);
  const voiceMessageRecorder = useMobileVoiceMessageRecorder();
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  // §2 "1h".3: once locked the finger is free — releasing the button must not
  // end the recording, so the flag is read from a ref inside the touch handlers.
  const [isRecordingLocked, setRecordingLocked] = useState(false);
  const isRecordingLockedRef = useRef(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  // 10a: the caret position drives `@` detection. `onChangeText` fires before
  // `onSelectionChange`, so the caret is derived from the edit itself and the
  // selection event only confirms it — a mid-text edit never reads the end of
  // the draft for a frame.
  const [caret, setCaret] = useState(0);
  const draftRef = useRef("");
  const caretRef = useRef(0);
  const [pendingSelection, setPendingSelection] = useState<{
    end: number;
    start: number;
  } | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const isEditing = intent?.mode === "edit";
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  // `onChangeText` needs the text and caret it is replacing, and it fires
  // before the render that would give it fresh props.
  draftRef.current = draft;
  caretRef.current = caret;
  const trimmedDraft = draft.trim();
  const selectedAsset = mediaState?.selectedAsset ?? null;
  const isPickingDocument = mediaState?.status === "checking-document-picker";
  const isPickingPhoto = mediaState?.status === "checking-photo-library";
  const attachmentUploadReadiness = getMobileAttachmentUploadReadiness({
    attachmentsFeature: attachmentsFeature ?? null,
    selectedAsset,
  });
  const sendGuard = getMobileAttachmentDraftSendGuard({
    content: trimmedDraft,
    selectedAsset,
  });
  const channelAttachments = channelAttachmentDrafts.map((draft) => draft.input);
  const hasCompletedAttachmentEditConflict = isEditing && channelAttachments.length > 0;
  const channelCanSend = trimmedDraft.length > 0 || channelAttachments.length > 0;
  const usesUploadedAttachments = variant === "channel" || variant === "dm";
  const isAttachmentCapabilityAvailable = attachmentsFeature?.status === "available";
  const attachmentCapabilityHint = getAttachmentCapabilityHint(attachmentsFeature, isEditing);
  const dmHasSendableContent = trimmedDraft.length > 0 || channelAttachments.length > 0;
  const reducedMotion = useReducedMotion() === true;
  const dmPrimaryProgress = useSharedValue(dmHasSendableContent ? 1 : 0);
  const dmMicIconStyle = useAnimatedStyle(() => ({ opacity: 1 - dmPrimaryProgress.value }));
  const dmSendIconStyle = useAnimatedStyle(() => ({ opacity: dmPrimaryProgress.value }));
  const isDisabled =
    hasCompletedAttachmentEditConflict ||
    (usesUploadedAttachments
      ? isChannelAttachmentUploading || !channelCanSend
      : !sendGuard.canSend);
  const sendBlockText = getAttachmentDraftBlockText(sendGuard.reason, sendGuard.canSend, {
    reason: attachmentUploadReadiness.reason,
  });

  useEffect(() => {
    if (intent?.mode === "edit") {
      if (channelAttachmentDrafts.length > 0) return;
      setDraft(intent.content);
    }
  }, [channelAttachmentDrafts.length, intent]);

  useEffect(() => {
    const target = dmHasSendableContent ? 1 : 0;
    // §2 "1d": the mic becomes the plane in 150ms as soon as there is text.
    dmPrimaryProgress.value = reducedMotion
      ? target
      : withTiming(target, { duration: DM_PRIMARY_MORPH_DURATION_MS });
  }, [dmHasSendableContent, dmPrimaryProgress, reducedMotion]);

  useEffect(() => {
    if (isEditing) {
      uploadAbortControllerRef.current?.abort();
      setAttachmentPickerOpen(false);
      if (channelAttachmentDrafts.length > 0) {
        setChannelAttachmentUploadError(copy.composerAttachmentEditBlocked);
        onCancelIntent?.();
      }
    }
  }, [channelAttachmentDrafts.length, isEditing, onCancelIntent]);

  useEffect(
    () => () => {
      uploadAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!voiceMessageRecorder.isRecording) {
      setVoiceRecordingSeconds(0);
      isRecordingLockedRef.current = false;
      setRecordingLocked(false);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setVoiceRecordingSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => clearInterval(timer);
  }, [voiceMessageRecorder.isRecording]);

  const handleSend = useCallback(() => {
    if (isDisabled) {
      return;
    }

    const content = trimmedDraft;
    const attachments =
      usesUploadedAttachments && channelAttachments.length > 0 ? channelAttachments : undefined;
    const attachmentPreviews = attachments
      ? channelAttachmentDrafts.map((attachmentDraft) => attachmentDraft.attachment)
      : undefined;
    const clearComposer = () => {
      setDraft("");
      setCaret(0);
      setPendingSelection(null);
      setChannelAttachmentDrafts([]);
      setChannelAttachmentUploadError(null);
      onDraftChange?.("");
      onCancelIntent?.();
    };

    // Edits have no failed-message bubble to recover from, so the draft only
    // clears once the server accepts them.
    if (isEditing) {
      void onSend(content, attachments, attachmentPreviews).then((didSend) => {
        if (didSend) {
          clearComposer();
        }
      });
      return;
    }

    clearComposer();
    void onSend(content, attachments, attachmentPreviews);
  }, [
    channelAttachmentDrafts,
    channelAttachments,
    isDisabled,
    isEditing,
    onCancelIntent,
    onDraftChange,
    onSend,
    trimmedDraft,
    usesUploadedAttachments,
  ]);

  // 8b active reply bar: soft card with a 3px accent stripe, reply icon,
  // "<name> kişisine yanıt" title and a single-line quote.
  const intentBanner = intent ? (
    <View style={styles.composerIntentBar} testID={`mobile-message-${intent.mode}-preview`}>
      <View style={styles.composerIntentText}>
        <Text style={styles.composerIntentTitle} numberOfLines={1}>
          {intent.mode === "edit"
            ? copy.messageEditingLabel
            : intent.authorLabel
              ? copy.messageReplyToUserTemplate.replace("{name}", intent.authorLabel)
              : copy.messageReplyingToLabel}
        </Text>
        <Text style={styles.composerIntentQuote} numberOfLines={1}>
          {intent.content}
        </Text>
      </View>
      {onCancelIntent ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.messageComposerCancelAction}
          hitSlop={6}
          onPress={onCancelIntent}
          style={({ pressed }) => [
            styles.composerIntentClose,
            pressed && styles.actionButtonPressed,
          ]}
          testID="mobile-message-intent-cancel"
        >
          <MobileLineIcon
            color={theme.messaging.textSecondary}
            name="close"
            size={13}
            strokeWidth={2.4}
          />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const handleDraftChange = useCallback(
    (content: string) => {
      setDraft(content);
      setCaret(content.length);
      onDraftChange?.(content);
    },
    [onDraftChange],
  );

  const handleSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setCaret(event.nativeEvent.selection.end);
      setPendingSelection(null);
    },
    [],
  );

  const activeMentionQuery = useMemo(() => {
    if (!mentionCandidates || mentionCandidates.length === 0 || isEditing) {
      return null;
    }

    return resolveMobileMentionQuery(draft, caret);
  }, [caret, draft, isEditing, mentionCandidates]);
  const mentionSuggestions = useMemo(
    () =>
      activeMentionQuery && mentionCandidates
        ? filterMobileMentionCandidates(mentionCandidates, activeMentionQuery.query)
        : [],
    [activeMentionQuery, mentionCandidates],
  );

  const handleSelectMention = useCallback(
    (username: string) => {
      if (!activeMentionQuery) {
        return;
      }

      const next = applyMobileMentionSelection(draft, activeMentionQuery, username);
      setDraft(next.text);
      setCaret(next.cursor);
      setPendingSelection({ end: next.cursor, start: next.cursor });
      onDraftChange?.(next.text);
    },
    [activeMentionQuery, draft, onDraftChange],
  );

  const mentionPanel =
    mentionSuggestions.length > 0 ? (
      <View
        accessibilityLabel={copy.messageMentionSuggestionsLabel}
        style={styles.mentionSuggestionPanel}
        testID="mobile-composer-mention-suggestions"
      >
        <ScrollView
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          style={styles.mentionSuggestionList}
        >
          {mentionSuggestions.map((candidate) => (
            <Pressable
              accessibilityLabel={copy.messageMentionSuggestionActionTemplate.replace(
                "{name}",
                candidate.displayName,
              )}
              accessibilityRole="button"
              key={candidate.userId}
              onPress={() => handleSelectMention(candidate.username)}
              style={({ pressed }) => [
                styles.mentionSuggestionRow,
                pressed && styles.actionButtonPressed,
              ]}
              testID={`mobile-composer-mention-suggestion-${candidate.username}`}
            >
              <Avatar
                dimension={28}
                identityId={candidate.userId}
                imageUrl={candidate.avatarUrl}
                label={candidate.displayName}
                size="sm"
              />
              <View style={styles.mentionSuggestionText}>
                <Text numberOfLines={1} style={styles.mentionSuggestionName}>
                  {candidate.displayName}
                </Text>
                <Text numberOfLines={1} style={styles.mentionSuggestionHandle}>
                  {`@${candidate.username}`}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ) : null;

  const uploadChannelAttachment = useCallback(
    async (pickAttachment: () => Promise<MobilePickedMessageAttachment | null>) => {
      if (
        !getAccessToken ||
        isChannelAttachmentUploading ||
        isEditingRef.current ||
        (variant === "dm" && !isAttachmentCapabilityAvailable)
      ) {
        return;
      }

      if (channelAttachmentDrafts.length >= 5) {
        setChannelAttachmentUploadError(copy.composerAttachmentTooMany);
        return;
      }

      setChannelAttachmentUploading(true);
      setChannelAttachmentUploadError(null);
      const abortController = new AbortController();
      uploadAbortControllerRef.current = abortController;
      const outcome = await executeMobileMessageAttachmentUpload({
        dependencies: {
          getAccessToken,
          pickAttachment,
          uploadAttachment: uploadMobileMessageAttachmentToUploadThing,
        },
        signal: abortController.signal,
      });
      if (uploadAbortControllerRef.current !== abortController) {
        return;
      }
      uploadAbortControllerRef.current = null;
      setChannelAttachmentUploading(false);

      if (outcome.status === "ready" && !isEditingRef.current) {
        setChannelAttachmentDrafts((current) => [...current, outcome.draft]);
      } else if (outcome.status === "error") {
        setChannelAttachmentUploadError(getAttachmentUploadFailureText(outcome.code));
      }
    },
    [
      channelAttachmentDrafts.length,
      getAccessToken,
      isAttachmentCapabilityAvailable,
      isChannelAttachmentUploading,
      variant,
    ],
  );

  const handleSelectDocument = useCallback(async () => {
    setAttachmentPickerOpen(false);
    if (usesUploadedAttachments) {
      await uploadChannelAttachment(pickMobileMessageAttachmentFromDocument);
      return;
    }
    await onRequestDocumentPicker?.();
  }, [onRequestDocumentPicker, uploadChannelAttachment, usesUploadedAttachments]);

  const handleSelectPhoto = useCallback(async () => {
    setAttachmentPickerOpen(false);
    if (usesUploadedAttachments) {
      await uploadChannelAttachment(pickMobileMessageAttachmentFromPhotoLibrary);
      return;
    }
    await onRequestPhotoLibraryPicker?.();
  }, [onRequestPhotoLibraryPicker, uploadChannelAttachment, usesUploadedAttachments]);

  const handleVoiceRecord = useCallback(async () => {
    if (voiceMessageRecorder.isRecording) {
      try {
        const picked = await voiceMessageRecorder.stop();
        if (picked) {
          await uploadChannelAttachment(async () => picked);
        }
      } catch {
        setChannelAttachmentUploadError(copy.composerVoiceRecordFailed);
      }
      return;
    }

    const result = await voiceMessageRecorder.start();
    if (result === "denied") {
      setChannelAttachmentUploadError(copy.composerVoicePermissionDenied);
    } else if (result === "error") {
      setChannelAttachmentUploadError(copy.composerVoiceRecordFailed);
    }
  }, [uploadChannelAttachment, voiceMessageRecorder]);

  // 8b press-and-hold voice flow: release stops the recording, uploads it and
  // sends the voice message immediately; sub-second recordings are dropped.
  const handleVoiceStopAndSend = useCallback(async () => {
    if (!voiceMessageRecorder.isRecording) return;
    try {
      const picked = await voiceMessageRecorder.stop();
      if (!picked) {
        setChannelAttachmentUploadError(copy.composerVoiceTooShortNotice);
        return;
      }
      if (!getAccessToken) {
        setChannelAttachmentUploadError(copy.composerVoiceRecordFailed);
        return;
      }
      setChannelAttachmentUploading(true);
      const outcome = await executeMobileMessageAttachmentUpload({
        dependencies: {
          getAccessToken,
          pickAttachment: async () => picked,
          uploadAttachment: uploadMobileMessageAttachmentToUploadThing,
        },
      });
      setChannelAttachmentUploading(false);
      if (outcome.status === "ready") {
        setChannelAttachmentUploadError(null);
        void onSend("", [outcome.draft.input], [outcome.draft.attachment]);
      } else if (outcome.status === "error") {
        setChannelAttachmentUploadError(copy.composerVoiceRecordFailed);
      }
    } catch {
      setChannelAttachmentUploading(false);
      setChannelAttachmentUploadError(copy.composerVoiceRecordFailed);
    }
  }, [getAccessToken, onSend, voiceMessageRecorder]);

  const handleCancelVoiceRecord = useCallback(async () => {
    if (!voiceMessageRecorder.isRecording) return;
    try {
      await voiceMessageRecorder.discard();
      setChannelAttachmentUploadError(copy.dmChatVoiceRecordCancelledNotice);
    } catch {
      setChannelAttachmentUploadError(copy.composerVoiceRecordFailed);
    }
  }, [voiceMessageRecorder]);

  /**
   * §2 "1h".3: the drag that starts on the mic decides what happens on release —
   * left cancels, up locks, anything else sends. The thresholds and the choice
   * are `resolveMobileVoiceRecordGesture`; this only performs the outcome.
   */
  const voiceCancelResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          voiceMessageRecorder.isRecording &&
          !isRecordingLockedRef.current &&
          (gesture.dx < -12 || gesture.dy < -12),
        onPanResponderRelease: (_event, gesture) => {
          if (!voiceMessageRecorder.isRecording) return;
          const outcome = resolveMobileVoiceRecordGesture({ dx: gesture.dx, dy: gesture.dy });
          if (outcome === "cancel") {
            void handleCancelVoiceRecord();
            return;
          }
          if (outcome === "lock") {
            isRecordingLockedRef.current = true;
            setRecordingLocked(true);
            return;
          }
          void handleVoiceStopAndSend();
        },
      }),
    [handleCancelVoiceRecord, handleVoiceStopAndSend, voiceMessageRecorder.isRecording],
  );

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      handleDraftChange(`${draft}${emoji}`);
    },
    [draft, handleDraftChange],
  );

  if (variant === "dm") {
    const hasSendableContent = dmHasSendableContent;
    // Same gate as the channel composer: no session token means no upload
    // endpoint, so the control fails closed instead of no-opping on tap.
    const isDMAttachUnavailable =
      isChannelAttachmentUploading ||
      voiceMessageRecorder.isRecording ||
      !isAttachmentCapabilityAvailable ||
      !getAccessToken ||
      isEditing;
    const primaryActionUnavailable =
      isChannelAttachmentUploading ||
      voiceMessageRecorder.phase === "preparing" ||
      voiceMessageRecorder.phase === "stopping" ||
      (!hasSendableContent && (!isAttachmentCapabilityAvailable || isEditing));
    const handlePrimaryAction = () => {
      if (primaryActionUnavailable) return;
      if (hasSendableContent) {
        void handleSend();
        return;
      }
      // Tap fallback for the mic: toggles recording so accessibility switch
      // access still works; press-and-hold is handled by pressIn/pressOut.
      if (voiceMessageRecorder.isRecording) {
        void handleVoiceStopAndSend();
      }
    };
    const handlePrimaryPressIn = () => {
      if (primaryActionUnavailable || hasSendableContent || voiceMessageRecorder.isRecording) {
        return;
      }
      void handleVoiceRecord();
    };
    const handlePrimaryPressOut = () => {
      if (hasSendableContent || !voiceMessageRecorder.isRecording) return;
      // §2 "1h".3: a locked recording keeps going once the finger lifts; only a
      // tap on this button (handled above) or the delete button ends it.
      if (isRecordingLockedRef.current) return;
      void handleVoiceStopAndSend();
    };
    const primaryTestId = hasSendableContent
      ? "mobile-dm-send-button"
      : "mobile-dm-voice-record-button";

    return (
      <View style={[styles.dmComposer, styles.dmChatComposer]} testID="mobile-dm-composer">
        {topAccessory ? <View style={styles.composerTopAccessory}>{topAccessory}</View> : null}
        {intentBanner}
        {channelAttachmentDrafts.map((attachmentDraft) => (
          <ComposerAttachmentDraftChip
            draft={attachmentDraft}
            key={attachmentDraft.attachment.id}
            onRemove={() =>
              setChannelAttachmentDrafts((current) =>
                current.filter((item) => item.attachment.id !== attachmentDraft.attachment.id),
              )
            }
            testIDPrefix="mobile-dm-attachment"
          />
        ))}
        {mentionPanel}
        <View style={styles.dmChatComposerRow}>
          {voiceMessageRecorder.isRecording ? (
            // §2 "1h".2: the recording state swaps the first two slots and keeps
            // the third, so the held button survives the switch.
            <Pressable
              accessibilityLabel={copy.dmChatVoiceRecordCancelAction}
              accessibilityRole="button"
              onPress={() => void handleCancelVoiceRecord()}
              style={({ pressed }) => [
                styles.dmChatRecordingDelete,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-dm-voice-record-cancel"
            >
              <MobileLineIcon color={theme.messaging.recordDeleteIcon} name="trash" size={18} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={copy.dmChatAttachAction}
              accessibilityHint={attachmentCapabilityHint}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDMAttachUnavailable }}
              disabled={isDMAttachUnavailable}
              onPress={() => setAttachmentPickerOpen(true)}
              style={({ pressed }) => [
                styles.dmChatComposerControl,
                isDMAttachUnavailable && styles.dmChatComposerControlDisabled,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-dm-attach-button"
            >
              <MobileLineIcon
                color={theme.messaging.textSecondary}
                name={isChannelAttachmentUploading ? "clock" : "plus"}
                size={19}
              />
            </Pressable>
          )}
          {voiceMessageRecorder.isRecording ? (
            <ComposerVoiceRecordingField
              levels={voiceMessageRecorder.levels}
              locked={isRecordingLocked}
              seconds={voiceRecordingSeconds}
            />
          ) : (
            <View style={styles.dmChatComposerInputShell}>
              <TextInput
                accessibilityLabel={placeholder}
                maxLength={2000}
                multiline
                onChangeText={handleDraftChange}
                onSelectionChange={handleSelectionChange}
                placeholder={placeholder}
                placeholderTextColor={theme.messaging.groupLabel}
                {...(pendingSelection ? { selection: pendingSelection } : {})}
                style={[styles.dmComposerInput, styles.dmChatComposerInput]}
                testID="mobile-dm-composer-input"
                value={draft}
              />
              <Pressable
                accessibilityLabel={copy.dmChatEmojiAction}
                accessibilityRole="button"
                // §2 "1d" draws a 19px glyph; slop carries it past the 38px floor.
                hitSlop={10}
                onPress={() => setEmojiPickerOpen(true)}
                style={({ pressed }) => [
                  styles.dmChatEmojiButton,
                  pressed && styles.actionButtonPressed,
                ]}
                testID="mobile-dm-emoji-button"
              >
                <MobileLineIcon color={theme.messaging.groupLabel} name="emoji" size={19} />
              </Pressable>
            </View>
          )}
          <View {...voiceCancelResponder.panHandlers}>
            <Pressable
              accessibilityLabel={
                voiceMessageRecorder.isRecording
                  ? copy.composerVoiceStopAction
                  : hasSendableContent
                    ? copy.dmChatSendAction
                    : copy.dmChatVoiceRecordAction
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: primaryActionUnavailable }}
              disabled={primaryActionUnavailable}
              onPress={handlePrimaryAction}
              onPressIn={handlePrimaryPressIn}
              onPressOut={handlePrimaryPressOut}
              style={({ pressed }) => [
                styles.dmChatPrimaryButton,
                primaryActionUnavailable && styles.dmChatComposerControlDisabled,
                pressed && styles.actionButtonPressed,
              ]}
              testID={primaryTestId}
            >
              {voiceMessageRecorder.isRecording ? (
                <MobileLineIcon color={theme.messaging.bubbleOutText} name="send-plane" size={19} />
              ) : (
                <>
                  <Animated.View style={[styles.dmChatPrimaryIcon, dmMicIconStyle]}>
                    <MobileLineIcon color={theme.messaging.bubbleOutText} name="mic" size={19} />
                  </Animated.View>
                  <Animated.View style={[styles.dmChatPrimaryIcon, dmSendIconStyle]}>
                    <MobileLineIcon
                      color={theme.messaging.bubbleOutText}
                      name="send-plane"
                      size={19}
                    />
                  </Animated.View>
                </>
              )}
            </Pressable>
          </View>
        </View>
        {channelAttachmentUploadError ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.dmSendErrorText}
          >
            {channelAttachmentUploadError}
          </Text>
        ) : null}
        <ActionSheet
          actions={[
            {
              icon: "image-outline",
              id: "photo",
              label: copy.dmChatAttachPhotoAction,
              onPress: () => void handleSelectPhoto(),
              testID: "mobile-dm-photo-library-picker",
              tone: "accent",
            },
            {
              icon: "document-attach-outline",
              id: "document",
              label: copy.dmChatAttachFileAction,
              onPress: () => void handleSelectDocument(),
              testID: "mobile-dm-document-picker",
              tone: "warning",
            },
            ...(onSendGif
              ? [
                  {
                    icon: "film-outline" as const,
                    id: "gif",
                    label: copy.dmChatAttachGifAction,
                    onPress: () => setGifPickerOpen(true),
                    testID: "mobile-dm-gif-button",
                    tone: "success" as const,
                  },
                ]
              : []),
          ]}
          closeAccessibilityLabel={copy.sheetCloseAction}
          icon="attach-outline"
          onClose={() => setAttachmentPickerOpen(false)}
          open={attachmentPickerOpen}
          testID="mobile-dm-attachment-picker"
          title={copy.dmChatAttachAction}
        />
        <MessageEmojiPicker
          isOpen={emojiPickerOpen}
          onClose={() => setEmojiPickerOpen(false)}
          onSelect={handleSelectEmoji}
        />
        {onSendGif ? (
          <MobileGifPicker
            open={gifPickerOpen}
            onClose={() => setGifPickerOpen(false)}
            onSelect={onSendGif}
          />
        ) : null}
      </View>
    );
  }

  if (variant === "channel") {
    const isChannelVoiceUnavailable =
      !getAccessToken ||
      isChannelAttachmentUploading ||
      isEditing ||
      voiceMessageRecorder.phase === "preparing" ||
      voiceMessageRecorder.phase === "stopping";
    const isChannelAttachUnavailable =
      isChannelAttachmentUploading || voiceMessageRecorder.isRecording || !getAccessToken;

    return (
      <View style={[styles.dmComposer, styles.channelComposer]} testID="mobile-channel-composer">
        {topAccessory ? <View style={styles.composerTopAccessory}>{topAccessory}</View> : null}
        {intentBanner}
        {channelAttachmentDrafts.map((attachmentDraft) => (
          <ComposerAttachmentDraftChip
            draft={attachmentDraft}
            key={attachmentDraft.attachment.id}
            onRemove={() =>
              setChannelAttachmentDrafts((current) =>
                current.filter((item) => item.attachment.id !== attachmentDraft.attachment.id),
              )
            }
            testIDPrefix="mobile-channel-attachment"
          />
        ))}

        {mentionPanel}
        {/* §2 "1e".14: the 1d composer, with only the placeholder changed. */}
        <View style={styles.dmChatComposerRow}>
          {voiceMessageRecorder.isRecording ? (
            // §2 "1h".2: a channel records exactly like a DM — delete, live
            // waveform, send — so the two composers cannot drift apart.
            <Pressable
              accessibilityLabel={copy.dmChatVoiceRecordCancelAction}
              accessibilityRole="button"
              onPress={() => void handleCancelVoiceRecord()}
              style={({ pressed }) => [
                styles.dmChatRecordingDelete,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-voice-record-cancel"
            >
              <MobileLineIcon color={theme.messaging.recordDeleteIcon} name="trash" size={18} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerAttachAction}
              accessibilityState={{ disabled: isChannelAttachUnavailable }}
              disabled={isChannelAttachUnavailable}
              onPress={() => setAttachmentPickerOpen(true)}
              style={({ pressed }) => [
                styles.dmChatComposerControl,
                isChannelAttachUnavailable && styles.dmChatComposerControlDisabled,
                pressed && !isChannelAttachUnavailable && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-attach-button"
            >
              <MobileLineIcon
                color={theme.messaging.textSecondary}
                name={isChannelAttachmentUploading ? "clock" : "plus"}
                size={19}
              />
            </Pressable>
          )}
          {voiceMessageRecorder.isRecording ? (
            <ComposerVoiceRecordingField
              levels={voiceMessageRecorder.levels}
              locked={isRecordingLocked}
              seconds={voiceRecordingSeconds}
            />
          ) : (
            <View style={styles.dmChatComposerInputShell}>
              <TextInput
                accessibilityLabel={placeholder}
                maxLength={2000}
                multiline
                onChangeText={handleDraftChange}
                onSelectionChange={handleSelectionChange}
                placeholder={placeholder}
                placeholderTextColor={theme.messaging.groupLabel}
                {...(pendingSelection ? { selection: pendingSelection } : {})}
                style={[styles.dmComposerInput, styles.dmChatComposerInput]}
                testID="mobile-channel-composer-input"
                value={draft}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.messageEmojiPickerTitle}
                accessibilityState={{ disabled: false }}
                hitSlop={10}
                onPress={() => setEmojiPickerOpen(true)}
                style={({ pressed }) => [
                  styles.dmChatEmojiButton,
                  pressed && styles.actionButtonPressed,
                ]}
                testID="mobile-channel-emoji-button"
              >
                <MobileLineIcon color={theme.messaging.groupLabel} name="emoji" size={19} />
              </Pressable>
            </View>
          )}
          {channelCanSend ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sendActionLabel}
              accessibilityState={{ disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => void handleSend()}
              style={({ pressed }) => [
                styles.dmChatPrimaryButton,
                isDisabled && styles.dmChatComposerControlDisabled,
                pressed && !isDisabled && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-send-button"
            >
              <Animated.View style={[styles.dmChatPrimaryIcon, dmSendIconStyle]}>
                <MobileLineIcon color={theme.messaging.bubbleOutText} name="send" size={19} />
              </Animated.View>
            </Pressable>
          ) : (
            // §2 "1d".11: with an empty draft the primary action is the mic,
            // press-and-hold; it morphs into the plane as soon as there is text.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                voiceMessageRecorder.isRecording
                  ? copy.composerVoiceStopAction
                  : copy.composerVoiceRecordAction
              }
              accessibilityState={{ disabled: isChannelVoiceUnavailable }}
              disabled={isChannelVoiceUnavailable}
              onPress={() => {
                if (voiceMessageRecorder.isRecording) void handleVoiceStopAndSend();
              }}
              onPressIn={() => {
                if (!voiceMessageRecorder.isRecording && !isChannelVoiceUnavailable) {
                  void handleVoiceRecord();
                }
              }}
              onPressOut={() => {
                if (voiceMessageRecorder.isRecording) void handleVoiceStopAndSend();
              }}
              style={({ pressed }) => [
                styles.dmChatPrimaryButton,
                isChannelVoiceUnavailable && styles.dmChatComposerControlDisabled,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-voice-record-button"
            >
              <Animated.View style={[styles.dmChatPrimaryIcon, dmMicIconStyle]}>
                <MobileLineIcon
                  color={theme.messaging.bubbleOutText}
                  name={voiceMessageRecorder.isRecording ? "close" : "mic"}
                  size={19}
                />
              </Animated.View>
            </Pressable>
          )}
        </View>

        {sendBlockText ? (
          <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text>
        ) : null}
        <ActionSheet
          actions={[
            {
              disabled: !getAccessToken || isChannelAttachmentUploading,
              icon: "document-attach-outline",
              id: "document",
              label: copy.composerAttachAction,
              onPress: () => void handleSelectDocument(),
              testID: "mobile-channel-document-picker",
              tone: "warning",
            },
            {
              disabled: !getAccessToken || isChannelAttachmentUploading,
              icon: "image-outline",
              id: "photo",
              label: copy.composerPhotoLibraryAction,
              onPress: () => void handleSelectPhoto(),
              testID: "mobile-channel-photo-library-picker",
              tone: "accent",
            },
          ]}
          closeAccessibilityLabel={copy.sheetCloseAction}
          icon="attach-outline"
          onClose={() => setAttachmentPickerOpen(false)}
          open={attachmentPickerOpen}
          testID="mobile-channel-attachment-picker"
          title={copy.composerAttachAction}
        />
        <MessageEmojiPicker
          isOpen={emojiPickerOpen}
          onClose={() => setEmojiPickerOpen(false)}
          onSelect={handleSelectEmoji}
        />
      </View>
    );
  }

  return (
    <View style={styles.dmComposer}>
      {intentBanner}
      <View style={styles.dmComposerToolbar}>
        {onRequestDocumentPicker ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.composerAttachAction}
            accessibilityState={{ disabled: isPickingDocument }}
            disabled={isPickingDocument}
            onPress={() => void onRequestDocumentPicker()}
            style={({ pressed }) => [
              styles.dmAttachButton,
              isPickingDocument && styles.dmAttachButtonDisabled,
              pressed && !isPickingDocument && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.dmAttachButtonText}>
              {isPickingDocument ? copy.composerAttachmentChecking : "+"}
            </Text>
          </Pressable>
        ) : null}
        {onRequestPhotoLibraryPicker ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.composerPhotoLibraryAction}
            accessibilityState={{ disabled: isPickingPhoto }}
            disabled={isPickingPhoto}
            onPress={() => void onRequestPhotoLibraryPicker()}
            style={({ pressed }) => [
              styles.dmAttachButton,
              isPickingPhoto && styles.dmAttachButtonDisabled,
              pressed && !isPickingPhoto && styles.actionButtonPressed,
            ]}
          >
            <Ionicons
              name={isPickingPhoto ? "hourglass-outline" : "image-outline"}
              size={18}
              color={theme.accent.strong}
            />
          </Pressable>
        ) : null}
        {onSendGif ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="GIF"
            onPress={() => setGifPickerOpen(true)}
            style={({ pressed }) => [styles.dmAttachButton, pressed && styles.actionButtonPressed]}
            testID="mobile-dm-gif-button"
          >
            <Text style={styles.dmAttachButtonText}>GIF</Text>
          </Pressable>
        ) : null}
        <Text style={styles.dmComposerToolbarText} numberOfLines={1}>
          {selectedAsset ? copy.composerAttachmentDraftLabel : placeholder}
        </Text>
      </View>
      {selectedAsset ? (
        <View style={styles.dmComposerAttachmentCard}>
          <View style={styles.dmComposerAttachmentText}>
            <Text style={styles.dmComposerAttachmentTitle} numberOfLines={1}>
              {selectedAsset.name}
            </Text>
            <Text style={styles.dmComposerAttachmentMeta} numberOfLines={1}>
              {formatMobileMediaAssetMeta(selectedAsset)}
            </Text>
          </View>
          {onClearSelectedMediaAsset ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerAttachmentClearAction}
              onPress={onClearSelectedMediaAsset}
              style={({ pressed }) => [
                styles.dmComposerAttachmentClear,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Icon name="close" size={16} tone="accent" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={placeholder}
        maxLength={2000}
        multiline
        onChangeText={handleDraftChange}
        placeholder={placeholder}
        placeholderTextColor={theme.text.soft}
        style={styles.dmComposerInput}
        testID="mobile-dm-composer-input"
        value={draft}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sendActionLabel}
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={() => void handleSend()}
        style={({ pressed }) => [
          styles.dmSendButton,
          isDisabled && styles.dmSendButtonDisabled,
          pressed && !isDisabled && styles.actionButtonPressed,
        ]}
        testID="mobile-dm-send-button"
      >
        <Text style={styles.dmSendButtonText}>{sendActionLabel}</Text>
      </Pressable>
      {sendBlockText ? (
        <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text>
      ) : null}
      {channelAttachmentUploadError ? (
        <Text style={styles.dmSendErrorText}>{channelAttachmentUploadError}</Text>
      ) : null}
      {onSendGif ? (
        <MobileGifPicker
          open={gifPickerOpen}
          onClose={() => setGifPickerOpen(false)}
          onSelect={onSendGif}
        />
      ) : null}
    </View>
  );
}

/**
 * One draft chip for both composer variants — image drafts get a thumbnail,
 * everything else the document mark; only the testID prefix differs.
 */
function ComposerAttachmentDraftChip({
  draft,
  onRemove,
  testIDPrefix,
}: {
  readonly draft: MobileMessageAttachmentDraft;
  readonly onRemove: () => void;
  readonly testIDPrefix: "mobile-channel-attachment" | "mobile-dm-attachment";
}) {
  const styles = useMobileComposerStyles();
  const theme = useTheme();
  const previewUri = draft.kind === "image" ? (draft.attachment.url ?? draft.localUri) : null;
  const sizeLabel = formatMobileAttachmentSize(draft.attachment.size);

  return (
    <View
      style={styles.dmComposerAttachmentCard}
      testID={`${testIDPrefix}-draft-${draft.attachment.id}`}
    >
      {previewUri ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
          source={{ uri: previewUri }}
          style={styles.dmComposerAttachmentThumbnail}
          testID={`${testIDPrefix}-thumbnail-${draft.attachment.id}`}
        />
      ) : (
        <View style={styles.dmComposerAttachmentIcon}>
          <Icon name="document-attach-outline" size={18} tone="accent" />
        </View>
      )}
      <View style={styles.dmComposerAttachmentText}>
        <Text style={styles.dmComposerAttachmentTitle} numberOfLines={1}>
          {draft.attachment.filename}
        </Text>
        <Text style={styles.dmComposerAttachmentMeta} numberOfLines={1}>
          {[draft.attachment.contentType, sizeLabel].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={copy.composerAttachmentClearAction}
        accessibilityRole="button"
        hitSlop={14}
        onPress={onRemove}
        style={({ pressed }) => [
          styles.dmComposerAttachmentClear,
          pressed && styles.actionButtonPressed,
        ]}
        testID={`${testIDPrefix}-clear-${draft.attachment.id}`}
      >
        <Ionicons name="close" size={16} color={theme.accent.strong} />
      </Pressable>
    </View>
  );
}

function getAttachmentUploadFailureText(code: MobileMessageAttachmentUploadFailureCode): string {
  switch (code) {
    case "selected-file-too-large":
      return copy.composerAttachmentTooLarge;
    case "unsupported-content-type":
      return copy.composerAttachmentUnsupported;
    case "missing-file-metadata":
      return copy.composerAttachmentMetadataMissing;
    case "invalid-local-uri":
      return copy.composerAttachmentMetadataMissing;
    case "missing-access-token":
      return copy.composerAttachmentServerPending;
    case "invalid-upload-completion":
    case "upload-failed":
      return copy.composerAttachmentUploadFailed;
    default:
      return copy.composerAttachmentUploadFailed;
  }
}

function getAttachmentDraftBlockText(
  guardReason: ReturnType<typeof getMobileAttachmentDraftSendGuard>["reason"],
  canSend: boolean,
  uploadReadiness: Pick<ReturnType<typeof getMobileAttachmentUploadReadiness>, "reason">,
) {
  if (canSend || guardReason === null || guardReason === "empty-message") {
    return null;
  }

  switch (uploadReadiness.reason) {
    case "disabled":
      return copy.composerAttachmentDisabled;
    case "file-size-unavailable":
    case "missing-mime-type":
      return copy.composerAttachmentMetadataMissing;
    case "file-too-large":
      return copy.composerAttachmentTooLarge;
    case "missing-feature":
      return copy.composerAttachmentUnknown;
    case "native-permission-required":
      return copy.composerAttachmentNativePermissionPending;
    case "server-contract-required":
      return copy.composerAttachmentServerPending;
    case "unsupported-content-type":
      return copy.composerAttachmentUnsupported;
    case "no-selected-asset":
    case "ready":
      return copy.composerAttachmentUploadPending;
    default:
      return copy.composerAttachmentUploadPending;
  }
}

function getAttachmentCapabilityHint(
  feature: MobileBootstrapFeature | null | undefined,
  isEditing: boolean,
): string | undefined {
  if (isEditing) return copy.messageEditingLabel;
  if (feature?.status === "available") return undefined;
  if (feature?.reason) return feature.reason;

  switch (feature?.status) {
    case "disabled":
      return copy.composerAttachmentDisabled;
    case "requires-native-permission":
      return copy.composerAttachmentNativePermissionPending;
    case "requires-server-contract":
      return copy.composerAttachmentServerPending;
    default:
      return copy.composerAttachmentUnknown;
  }
}

/** §2 "1h".2: 112x20, 6px pitch, drawn from the microphone's own loudness. */
const VOICE_RECORDING_WAVE_BARS = 18;
const VOICE_RECORDING_WAVE_WIDTH = 112;
const VOICE_RECORDING_WAVE_HEIGHT = 20;
const VOICE_RECORDING_WAVE_MIN_BAR = 3;
const VOICE_RECORDING_WAVE_MAX_BAR = 13;
const VOICE_RECORDING_WAVE_GEOMETRY = {
  height: VOICE_RECORDING_WAVE_HEIGHT,
  originX: 3,
  pitch: 6,
} as const;

/**
 * §2 "1h".2: 0…1 loudness to the bar heights the design draws. Newest sample on
 * the right, and a window that is not full yet is padded on the left with the
 * resting height, so the bar starts as a flat line and grows into the voice
 * rather than jumping in from nowhere.
 */
export function getMobileVoiceRecordingBarHeights(
  levels: readonly number[] = [],
  barCount = VOICE_RECORDING_WAVE_BARS,
): readonly number[] {
  const visible = levels.slice(Math.max(0, levels.length - barCount));
  const padding = Array.from({ length: Math.max(0, barCount - visible.length) }, () => 0);
  return [...padding, ...visible].map((level) => {
    const clamped = Math.min(1, Math.max(0, level));
    return (
      VOICE_RECORDING_WAVE_MIN_BAR +
      Math.round(clamped * (VOICE_RECORDING_WAVE_MAX_BAR - VOICE_RECORDING_WAVE_MIN_BAR))
    );
  });
}

function ComposerVoiceRecordingField({
  levels = [],
  locked,
  seconds,
}: {
  /** Newest-last loudness samples, 0…1, straight off the recorder. */
  readonly levels?: readonly number[] | undefined;
  readonly locked: boolean;
  readonly seconds: number;
}) {
  const styles = useMobileComposerStyles();
  const theme = useTheme();
  const reducedMotion = useReducedMotion() === true;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    // §2 "1h".2: the record dot pulses once a second.
    pulse.value = withRepeat(withTiming(0.35, { duration: 500 }), -1, true);
  }, [pulse, reducedMotion]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const heights = useMemo(() => getMobileVoiceRecordingBarHeights(levels), [levels]);
  // Bars that already carry a sample are drawn solid; the ones still waiting for
  // one stay at the faint resting opacity the design uses.
  const recordedBars = Math.min(VOICE_RECORDING_WAVE_BARS, levels.length);
  const recordedFrom = VOICE_RECORDING_WAVE_BARS - recordedBars;
  const recordedPath = getMobileVoiceWaveformPath(
    heights,
    recordedFrom,
    VOICE_RECORDING_WAVE_BARS,
    VOICE_RECORDING_WAVE_GEOMETRY,
  );
  const upcomingPath = getMobileVoiceWaveformPath(
    heights,
    0,
    recordedFrom,
    VOICE_RECORDING_WAVE_GEOMETRY,
  );

  return (
    <View
      accessibilityLabel={`${copy.dmChatVoiceRecordingLabel} ${formatMobileVoiceDuration(seconds)}`}
      accessibilityRole="text"
      accessibilityState={{ selected: locked }}
      style={styles.dmChatRecordingField}
      testID="mobile-dm-voice-recording"
    >
      <Animated.View style={[styles.dmChatRecordingDot, dotStyle]} />
      <Text style={styles.dmChatRecordingDuration} testID="mobile-dm-voice-recording-duration">
        {formatMobileVoiceDuration(seconds)}
      </Text>
      <View style={styles.dmChatRecordingWave}>
        <Svg
          height={VOICE_RECORDING_WAVE_HEIGHT}
          testID="mobile-dm-voice-recording-wave"
          viewBox={`0 0 ${VOICE_RECORDING_WAVE_WIDTH} ${VOICE_RECORDING_WAVE_HEIGHT}`}
          width={VOICE_RECORDING_WAVE_WIDTH}
        >
          {recordedPath ? (
            <Path
              d={recordedPath}
              opacity={0.9}
              stroke={theme.messaging.textPrimary}
              strokeLinecap="round"
              strokeWidth={2.4}
            />
          ) : null}
          {upcomingPath ? (
            <Path
              d={upcomingPath}
              opacity={0.22}
              stroke={theme.messaging.textPrimary}
              strokeLinecap="round"
              strokeWidth={2.4}
            />
          ) : null}
        </Svg>
      </View>
      {locked ? (
        <Text numberOfLines={1} style={styles.dmChatRecordingLockedHint}>
          {copy.dmChatVoiceRecordLockedLabel}
        </Text>
      ) : null}
    </View>
  );
}
