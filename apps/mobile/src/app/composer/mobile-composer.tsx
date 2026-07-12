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
import { formatMobileMediaAssetMeta } from "../components/media-primitives";
import { Icon } from "../components/kit";
import { useMobileComposerStyles } from "./mobile-composer.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { MobileGifPicker } from "../../media/mobile-gif-picker";

export type MobileComposerIntent = {
  readonly content: string;
  readonly messageId: string;
  readonly mode: "edit" | "reply";
};

export function DMComposer({
  attachmentsFeature,
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
  mediaState?: MobileMediaRuntimeState;
  intent?: MobileComposerIntent | null;
  onCancelIntent?: () => void;
  onClearSelectedMediaAsset?: () => void;
  onDraftChange?: (content: string) => void;
  onRequestDocumentPicker?: () => Promise<void>;
  onRequestPhotoLibraryPicker?: () => Promise<void>;
  onSend(content: string): Promise<boolean>;
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
  const isDisabled = isSending || !sendGuard.canSend;
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

    const didSend = await onSend(trimmedDraft);
    if (didSend) {
      setDraft("");
      onDraftChange?.("");
      onCancelIntent?.();
    }
  }, [isDisabled, onCancelIntent, onDraftChange, onSend, trimmedDraft]);

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

  if (variant === "channel") {
    return (
      <View style={[styles.dmComposer, styles.channelComposer]} testID="mobile-channel-composer">
        {intentBanner}
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
                <Ionicons name="close" size={16} color={theme.accent.strong} />
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
          style={[styles.dmComposerInput, styles.channelComposerInput]}
          testID="mobile-channel-composer-input"
          value={draft}
        />

        <View style={styles.channelComposerControlRow}>
          <View style={styles.mobileChannelComposerActions}>
            {onRequestDocumentPicker ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.composerAttachAction}
                accessibilityState={{ disabled: isPickingDocument }}
                disabled={isPickingDocument}
                hitSlop={6}
                onPress={() => void onRequestDocumentPicker()}
                style={({ pressed }) => [
                  styles.channelComposerIconButton,
                  isPickingDocument && styles.channelComposerIconButtonDisabled,
                  pressed && !isPickingDocument && styles.actionButtonPressed,
                ]}
                testID="mobile-channel-attach-button"
              >
                <Ionicons
                  name={isPickingDocument ? "hourglass-outline" : "add"}
                  size={22}
                  color={theme.accent.strong}
                />
              </Pressable>
            ) : null}
            {onRequestPhotoLibraryPicker ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.composerPhotoLibraryAction}
                accessibilityState={{ disabled: isPickingPhoto }}
                disabled={isPickingPhoto}
                hitSlop={6}
                onPress={() => void onRequestPhotoLibraryPicker()}
                style={({ pressed }) => [
                  styles.channelComposerIconButton,
                  isPickingPhoto && styles.channelComposerIconButtonDisabled,
                  pressed && !isPickingPhoto && styles.actionButtonPressed,
                ]}
                testID="mobile-channel-photo-library-button"
              >
                <Ionicons
                  name={isPickingPhoto ? "hourglass-outline" : "image-outline"}
                  size={20}
                  color={theme.accent.strong}
                />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerEmojiUnavailableAction}
              accessibilityState={{ disabled: true }}
              disabled
              hitSlop={6}
              style={[
                styles.channelComposerIconButton,
                styles.channelComposerIconButtonUnavailable,
              ]}
              testID="mobile-channel-emoji-button"
            >
              <Ionicons name="happy-outline" size={20} color={theme.text.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="GIF"
              accessibilityState={{ disabled: !onSendGif }}
              disabled={!onSendGif}
              hitSlop={6}
              onPress={() => setGifPickerOpen(true)}
              style={[
                styles.channelComposerGifButton,
                !onSendGif && styles.channelComposerIconButtonUnavailable,
              ]}
              testID="mobile-channel-gif-button"
            >
              <Text style={styles.channelComposerGifButtonText}>GIF</Text>
            </Pressable>
          </View>

          <View style={styles.channelComposerSubmitActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.composerVoiceRecordUnavailableAction}
              accessibilityState={{ disabled: true }}
              disabled
              hitSlop={6}
              style={[
                styles.channelComposerVoiceButton,
                styles.channelComposerIconButtonUnavailable,
              ]}
              testID="mobile-channel-voice-record-button"
            >
              <Ionicons name="mic-outline" size={22} color={theme.text.muted} />
            </Pressable>
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
        </View>

        {sendBlockText ? (
          <Text style={styles.dmComposerAttachmentNotice}>{sendBlockText}</Text>
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
