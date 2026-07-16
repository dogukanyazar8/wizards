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
  useState,
  type MobileBootstrapFeature,
  type MobileChannelSendViewState,
  type MobileDMSendViewState,
  type MobileMediaRuntimeState,
} from "../mobile-root-screen-shared";
import type { UploadedAttachmentInput } from "@wizards/types";
import { formatMobileMediaAssetMeta } from "../components/media-primitives";
import { BottomSheet, Icon } from "../components/kit";
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
import { executeMobileMessageAttachmentUpload } from "../../media/mobile-message-attachment-upload-service";
import { uploadMobileMessageAttachmentToUploadThing } from "../../media/mobile-message-attachment-upload";
import { useMobileVoiceMessageRecorder } from "../../media/mobile-voice-message-recorder";

export type MobileComposerIntent = {
  readonly content: string;
  readonly messageId: string;
  readonly mode: "edit" | "reply";
};

export function DMComposer({
  attachmentsFeature,
  getAccessToken,
  mediaState,
  intent = null,
  onCancelIntent,
  onClearSelectedMediaAsset,
  onDraftChange,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSend,
  onSendGif,
  placeholder = copy.dmComposerPlaceholder,
  sendActionLabel = copy.dmSendAction,
  sendState,
  sendingActionLabel = copy.dmSendingAction,
  variant = "default",
}: {
  attachmentsFeature?: MobileBootstrapFeature | null;
  getAccessToken?: () => Promise<string | null>;
  mediaState?: MobileMediaRuntimeState;
  intent?: MobileComposerIntent | null;
  onCancelIntent?: () => void;
  onClearSelectedMediaAsset?: () => void;
  onDraftChange?: (content: string) => void;
  onRequestDocumentPicker?: () => Promise<void>;
  onRequestPhotoLibraryPicker?: () => Promise<void>;
  onSend(content: string, attachments?: readonly UploadedAttachmentInput[]): Promise<boolean>;
  onSendGif?: (gifId: string) => Promise<boolean>;
  placeholder?: string;
  sendActionLabel?: string;
  sendState: MobileChannelSendViewState | MobileDMSendViewState;
  sendingActionLabel?: string;
  variant?: "channel" | "default";
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
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
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
  const isSending = sendState.status === "sending";
  const channelAttachments = channelAttachmentDrafts.map((draft) => draft.input);
  const channelCanSend = trimmedDraft.length > 0 || channelAttachments.length > 0;
  const isDisabled =
    isSending ||
    (variant === "channel"
      ? isChannelAttachmentUploading || !channelCanSend
      : !sendGuard.canSend);
  const sendBlockText = getAttachmentDraftBlockText(sendGuard.reason, sendGuard.canSend, {
    reason: attachmentUploadReadiness.reason,
  });

  useEffect(() => {
    if (intent?.mode === "edit") {
      setDraft(intent.content);
    }
  }, [intent]);

  const handleSend = useCallback(async () => {
    if (isDisabled) {
      return;
    }

    const didSend = await onSend(
      trimmedDraft,
      variant === "channel" && channelAttachments.length > 0 ? channelAttachments : undefined,
    );
    if (didSend) {
      setDraft("");
      setChannelAttachmentDrafts([]);
      setChannelAttachmentUploadError(null);
      onDraftChange?.("");
      onCancelIntent?.();
    }
  }, [
    channelAttachments,
    isDisabled,
    onCancelIntent,
    onDraftChange,
    onSend,
    trimmedDraft,
    variant,
  ]);

  const intentBanner = intent ? (
    <View style={styles.dmComposerAttachmentCard} testID={`mobile-message-${intent.mode}-preview`}>
      <View style={styles.dmComposerAttachmentText}>
        <Text style={styles.dmComposerAttachmentTitle} numberOfLines={1}>
          {intent.mode === "edit" ? copy.messageEditingLabel : copy.messageReplyingToLabel}
        </Text>
        <Text style={styles.dmComposerAttachmentMeta} numberOfLines={1}>
          {intent.content}
        </Text>
      </View>
      {onCancelIntent ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.messageComposerCancelAction}
          onPress={onCancelIntent}
          style={({ pressed }) => [
            styles.dmComposerAttachmentClear,
            pressed && styles.actionButtonPressed,
          ]}
          testID="mobile-message-intent-cancel"
        >
          <Icon name="close" size={16} tone="accent" />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const handleDraftChange = useCallback(
    (content: string) => {
      setDraft(content);
      onDraftChange?.(content);
    },
    [onDraftChange],
  );

  const uploadChannelAttachment = useCallback(
    async (pickAttachment: () => Promise<MobilePickedMessageAttachment | null>) => {
      if (!getAccessToken || isChannelAttachmentUploading) {
        return;
      }

      if (channelAttachmentDrafts.length >= 5) {
        setChannelAttachmentUploadError(copy.composerAttachmentTooMany);
        return;
      }

      setChannelAttachmentUploading(true);
      setChannelAttachmentUploadError(null);
      const outcome = await executeMobileMessageAttachmentUpload({
        dependencies: {
          getAccessToken,
          pickAttachment,
          uploadAttachment: uploadMobileMessageAttachmentToUploadThing,
        },
      });
      setChannelAttachmentUploading(false);

      if (outcome.status === "ready") {
        setChannelAttachmentDrafts((current) => [...current, outcome.draft]);
      } else if (outcome.status === "error") {
        setChannelAttachmentUploadError(copy.composerAttachmentUploadFailed);
      }
    },
    [channelAttachmentDrafts.length, getAccessToken, isChannelAttachmentUploading],
  );

  const handleSelectDocument = useCallback(async () => {
    setAttachmentPickerOpen(false);
    if (variant === "channel") {
      await uploadChannelAttachment(pickMobileMessageAttachmentFromDocument);
      return;
    }
    await onRequestDocumentPicker?.();
  }, [onRequestDocumentPicker, uploadChannelAttachment, variant]);

  const handleSelectPhoto = useCallback(async () => {
    setAttachmentPickerOpen(false);
    if (variant === "channel") {
      await uploadChannelAttachment(pickMobileMessageAttachmentFromPhotoLibrary);
      return;
    }
    await onRequestPhotoLibraryPicker?.();
  }, [onRequestPhotoLibraryPicker, uploadChannelAttachment, variant]);

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

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      handleDraftChange(`${draft}${emoji}`);
    },
    [draft, handleDraftChange],
  );

  if (variant === "channel") {
    return (
      <View style={[styles.dmComposer, styles.channelComposer]} testID="mobile-channel-composer">
        {intentBanner}
        {channelAttachmentDrafts.map((draft) => (
          <View
            key={draft.attachment.id}
            style={styles.dmComposerAttachmentCard}
            testID={`mobile-channel-attachment-draft-${draft.attachment.id}`}
          >
            <View style={styles.dmComposerAttachmentText}>
              <Text style={styles.dmComposerAttachmentTitle} numberOfLines={1}>
                {draft.attachment.filename}
              </Text>
              <Text style={styles.dmComposerAttachmentMeta} numberOfLines={1}>
                {draft.attachment.contentType} · {draft.attachment.size} B
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerAttachmentClearAction}
              onPress={() =>
                setChannelAttachmentDrafts((current) =>
                  current.filter((currentDraft) => currentDraft.attachment.id !== draft.attachment.id),
                )
              }
              style={({ pressed }) => [
                styles.dmComposerAttachmentClear,
                pressed && styles.actionButtonPressed,
              ]}
              testID={`mobile-channel-attachment-clear-${draft.attachment.id}`}
            >
              <Ionicons name="close" size={16} color={theme.accent.strong} />
            </Pressable>
          </View>
        ))}

        <View style={styles.channelComposerControlRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.composerAttachAction}
            accessibilityState={{
              disabled:
                isChannelAttachmentUploading || voiceMessageRecorder.isRecording || !getAccessToken,
            }}
            disabled={
              isChannelAttachmentUploading || voiceMessageRecorder.isRecording || !getAccessToken
            }
            hitSlop={6}
            onPress={() => setAttachmentPickerOpen(true)}
            style={({ pressed }) => [
              styles.channelComposerIconButton,
              (isChannelAttachmentUploading || voiceMessageRecorder.isRecording || !getAccessToken) &&
                styles.channelComposerIconButtonDisabled,
              pressed &&
                !isChannelAttachmentUploading &&
                !voiceMessageRecorder.isRecording &&
                Boolean(getAccessToken) &&
                styles.actionButtonPressed,
            ]}
            testID="mobile-channel-attach-button"
          >
            <Ionicons
              name={isChannelAttachmentUploading ? "hourglass-outline" : "add"}
              size={22}
              color={theme.accent.strong}
            />
          </Pressable>
          <View style={styles.channelComposerInputShell}>
            <TextInput
              accessibilityLabel={placeholder}
              maxLength={2000}
              multiline
              onChangeText={handleDraftChange}
              placeholder={placeholder}
              placeholderTextColor={theme.text.soft}
              style={[styles.dmComposerInput, styles.channelComposerInput]}
              testID="mobile-channel-composer-input"
              value={draft}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.messageEmojiPickerTitle}
              accessibilityState={{ disabled: false }}
              hitSlop={6}
              onPress={() => setEmojiPickerOpen(true)}
              style={({ pressed }) => [
                styles.channelComposerVoiceButton,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-emoji-button"
            >
              <Ionicons name="happy-outline" size={20} color={theme.text.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                voiceMessageRecorder.isRecording
                  ? copy.composerVoiceStopAction
                  : copy.composerVoiceRecordAction
              }
              accessibilityState={{
                disabled:
                  isChannelAttachmentUploading ||
                  voiceMessageRecorder.phase === "preparing" ||
                  voiceMessageRecorder.phase === "stopping",
              }}
              disabled={
                isChannelAttachmentUploading ||
                voiceMessageRecorder.phase === "preparing" ||
                voiceMessageRecorder.phase === "stopping"
              }
              hitSlop={6}
              onPress={() => void handleVoiceRecord()}
              style={[
                styles.channelComposerVoiceButton,
                (isChannelAttachmentUploading ||
                  voiceMessageRecorder.phase === "preparing" ||
                  voiceMessageRecorder.phase === "stopping") &&
                  styles.channelComposerIconButtonUnavailable,
              ]}
              testID="mobile-channel-voice-record-button"
            >
              <Ionicons
                name={voiceMessageRecorder.isRecording ? "stop-circle-outline" : "mic-outline"}
                size={19}
                color={voiceMessageRecorder.isRecording ? theme.accent.strong : theme.text.muted}
              />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSending ? sendingActionLabel : sendActionLabel}
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            hitSlop={4}
            onPress={() => void handleSend()}
            style={({ pressed }) => [
              styles.channelComposerSendButton,
              isDisabled && styles.channelComposerSendButtonDisabled,
              pressed && !isDisabled && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-send-button"
          >
            <Ionicons
              name={isSending ? "hourglass-outline" : "paper-plane"}
              size={20}
              color={theme.text.onPrimary}
            />
          </Pressable>
        </View>

        {sendBlockText ? (
          <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text>
        ) : null}
        {sendState.status === "error" && sendState.error ? (
          <Text style={styles.dmSendErrorText}>{sendState.error}</Text>
        ) : null}
        <BottomSheet
          accessibilityLabel={copy.composerAttachAction}
          onClose={() => setAttachmentPickerOpen(false)}
          open={attachmentPickerOpen}
          snapPoint={280}
          testID="mobile-channel-attachment-picker"
        >
          <View style={styles.channelComposerAttachmentPicker}>
            <Text style={styles.channelComposerAttachmentPickerTitle}>
              {copy.composerAttachAction}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !getAccessToken || isChannelAttachmentUploading }}
              disabled={!getAccessToken || isChannelAttachmentUploading}
              onPress={() => void handleSelectDocument()}
              style={({ pressed }) => [
                styles.channelComposerAttachmentPickerAction,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-document-picker"
            >
              <Ionicons name="document-attach-outline" size={20} color={theme.accent.strong} />
              <Text style={styles.channelComposerAttachmentPickerActionText}>
                {copy.composerAttachAction}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !getAccessToken || isChannelAttachmentUploading }}
              disabled={!getAccessToken || isChannelAttachmentUploading}
              onPress={() => void handleSelectPhoto()}
              style={({ pressed }) => [
                styles.channelComposerAttachmentPickerAction,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-photo-library-picker"
            >
              <Ionicons name="image-outline" size={20} color={theme.accent.strong} />
              <Text style={styles.channelComposerAttachmentPickerActionText}>
                {copy.composerPhotoLibraryAction}
              </Text>
            </Pressable>
          </View>
        </BottomSheet>
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
        accessibilityLabel={isSending ? sendingActionLabel : sendActionLabel}
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
        <Text style={styles.dmSendButtonText}>
          {isSending ? sendingActionLabel : sendActionLabel}
        </Text>
      </Pressable>
        {sendBlockText ? (
        <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text>
        ) : null}
        {channelAttachmentUploadError ? (
          <Text style={styles.dmSendErrorText}>{channelAttachmentUploadError}</Text>
        ) : null}
      {sendState.status === "error" && sendState.error ? (
        <Text style={styles.dmSendErrorText}>{sendState.error}</Text>
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
