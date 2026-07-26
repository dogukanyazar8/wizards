import { useCallback, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { FeedbackRating, FeedbackTopic, MobileFeedbackSubmitResponse } from "@wizards/types";

import { Toggle, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import {
  useMobileFeedbackAttachmentUpload,
  type MobileFeedbackPickedImage,
} from "./use-mobile-feedback-attachment-upload";
import { submitMobileFeedback } from "./mobile-feedback-client";
import { buildMobileFeedbackDiagnostics } from "./mobile-feedback-diagnostics";
import { MobileFeedbackDiagnosticsSheet } from "./mobile-feedback-diagnostics-sheet";
import {
  MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH,
  MOBILE_FEEDBACK_RATINGS,
  MOBILE_FEEDBACK_RATING_ICONS,
  MOBILE_FEEDBACK_TOPICS,
  MOBILE_FEEDBACK_TOPIC_ICONS,
  addMobileFeedbackAttachment,
  canAddMobileFeedbackAttachment,
  canSubmitMobileFeedback,
  collectMobileFeedbackAttachmentClaimIds,
  createMobileFeedbackAttachmentDraft,
  formatMobileFeedbackCounter,
  removeMobileFeedbackAttachment,
  resolveMobileFeedbackDiagnostics,
  settleMobileFeedbackAttachment,
  type MobileFeedbackAttachmentDraft,
  type MobileFeedbackUploadFailureReason,
} from "./mobile-feedback-model";
import { useMobileFeedbackStyles } from "./mobile-feedback-screen.styles";

export const MOBILE_FEEDBACK_SCREEN_TEST_ID = "mobile-feedback-screen";

export interface MobileFeedbackScreenProps {
  readonly appVersion: string;
  onBack(): void;
  onSubmitted(response: MobileFeedbackSubmitResponse): void;
}

type FeedbackCopy = (typeof mobileCopy)[keyof typeof mobileCopy];

function getRatingLabel(copy: FeedbackCopy, rating: FeedbackRating): string {
  switch (rating) {
    case "BAD":
      return copy.feedbackRatingBad;
    case "GOOD":
      return copy.feedbackRatingGood;
    case "GREAT":
      return copy.feedbackRatingGreat;
    default:
      return copy.feedbackRatingOkay;
  }
}

function getUploadFailureLabel(
  copy: FeedbackCopy,
  reason: MobileFeedbackUploadFailureReason,
): string {
  switch (reason) {
    case "network":
      return copy.feedbackUploadFailedNetwork;
    case "rejected":
      return copy.feedbackUploadFailedRejected;
    case "signed-out":
      return copy.feedbackUploadFailedSignedOut;
    case "timeout":
      return copy.feedbackUploadFailedTimeout;
    default:
      return copy.feedbackUploadFailedUnknown;
  }
}

export function getMobileFeedbackTopicLabel(copy: FeedbackCopy, topic: FeedbackTopic): string {
  switch (topic) {
    case "BUG":
      return copy.feedbackTopicBug;
    case "PERFORMANCE":
      return copy.feedbackTopicPerformance;
    case "SUGGESTION":
      return copy.feedbackTopicSuggestion;
    case "VOICE":
      return copy.feedbackTopicVoice;
    default:
      return copy.feedbackTopicOther;
  }
}

/**
 * Handoff 4a. Four cards, one send.
 *
 * The diagnostics toggle is the only part with memory: it follows the topic's
 * default until the user answers it themselves, after which their answer stands
 * — switching from "Hata bildirimi" to "Özellik önerisi" must not quietly
 * revoke a consent the user gave, and must not quietly grant one they refused.
 */
export function MobileFeedbackScreen({
  appVersion,
  onBack,
  onSubmitted,
}: MobileFeedbackScreenProps) {
  const styles = useMobileFeedbackStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();
  const { pickImage, uploadImage } = useMobileFeedbackAttachmentUpload();

  const [rating, setRating] = useState<FeedbackRating>("GOOD");
  const [topic, setTopic] = useState<FeedbackTopic>("SUGGESTION");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<readonly MobileFeedbackAttachmentDraft[]>([]);
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
  const [diagnosticsOverridden, setDiagnosticsOverridden] = useState(false);
  const [isDiagnosticsSheetOpen, setDiagnosticsSheetOpen] = useState(false);
  const [isMessageFocused, setMessageFocused] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const nextAttachmentId = useRef(1);
  /**
   * The picked file, kept beside the draft so "Tekrar dene" can re-upload the
   * same bytes without sending the user back to the gallery.
   */
  const attachmentFilesRef = useRef(new Map<string, File>());

  const canSubmit = canSubmitMobileFeedback({ attachments, isSubmitting, message });
  const counter = useMemo(() => formatMobileFeedbackCounter(message.length), [message.length]);

  const selectTopic = useCallback(
    (next: FeedbackTopic) => {
      setTopic(next);
      setDiagnosticsEnabled((current) =>
        resolveMobileFeedbackDiagnostics({
          current,
          topic: next,
          userOverridden: diagnosticsOverridden,
        }),
      );
    },
    [diagnosticsOverridden],
  );

  const toggleDiagnostics = useCallback((next: boolean) => {
    setDiagnosticsOverridden(true);
    setDiagnosticsEnabled(next);
  }, []);

  /**
   * Uploads one already-picked file and settles its tile. Kept separate from the
   * picker so "Tekrar dene" on a failed tile is the same code path as the first
   * attempt, and so several tiles can be in flight at once.
   */
  const runUpload = useCallback(
    async (draftId: string, file: File) => {
      const result = await uploadImage(file);

      if (result.status === "uploaded") {
        setAttachments((current) =>
          settleMobileFeedbackAttachment(current, draftId, result.claimId),
        );
        return;
      }

      setAttachments((current) => settleMobileFeedbackAttachment(current, draftId, null));
      showToast({
        subtitle: getUploadFailureLabel(copy, result.reason),
        title: copy.feedbackAttachmentFailedTitle,
        variant: "error",
      });
    },
    [copy, showToast, uploadImage],
  );

  const addAttachment = useCallback(async () => {
    if (!canAddMobileFeedbackAttachment(attachments)) {
      return;
    }

    let picked: MobileFeedbackPickedImage | null;
    try {
      // The picker runs before any toast: a full-screen gallery with a
      // "yükleniyor" card behind it announced an upload that had not started.
      picked = await pickImage();
    } catch {
      showToast({ title: copy.feedbackAttachmentFailedTitle, variant: "error" });
      return;
    }

    if (!picked) {
      return;
    }

    // The thumbnail is on screen from here on, whatever the network does.
    const draftId = `attachment-${nextAttachmentId.current}`;
    nextAttachmentId.current += 1;
    const chosen = picked;
    attachmentFilesRef.current.set(draftId, chosen.file);
    setAttachments((current) =>
      addMobileFeedbackAttachment(
        current,
        createMobileFeedbackAttachmentDraft(draftId, chosen.localUri),
      ),
    );
    void runUpload(draftId, chosen.file);
  }, [attachments, copy.feedbackAttachmentFailedTitle, pickImage, runUpload, showToast]);

  const retryAttachment = useCallback(
    (draft: MobileFeedbackAttachmentDraft) => {
      const file = attachmentFilesRef.current.get(draft.id);
      if (!file || draft.status !== "failed") {
        return;
      }

      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === draft.id
            ? { ...attachment, claimId: null, status: "uploading" as const }
            : attachment,
        ),
      );
      void runUpload(draft.id, file);
    },
    [runUpload],
  );

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    const pending = showToast({
      subtitle: copy.toastMediaUploadingSubtitle,
      title: copy.feedbackSubmittingTitle,
      variant: "loading",
    });

    try {
      const response = await submitMobileFeedback(apiClient, {
        attachmentClaimIds: collectMobileFeedbackAttachmentClaimIds(attachments),
        diagnostics: diagnosticsEnabled
          ? buildMobileFeedbackDiagnostics({ appVersion, locale, theme: theme.id })
          : null,
        message: message.trim(),
        rating,
        topic,
      });

      pending.dismiss();
      onSubmitted(response);
    } catch {
      // The form is left exactly as it was: a failed send must not cost the
      // user the message they just wrote.
      pending.resolve({
        subtitle: copy.feedbackSubmitFailedSubtitle,
        title: copy.feedbackSubmitFailedTitle,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    apiClient,
    appVersion,
    attachments,
    canSubmit,
    copy.feedbackSubmitFailedSubtitle,
    copy.feedbackSubmitFailedTitle,
    copy.feedbackSubmittingTitle,
    copy.toastMediaUploadingSubtitle,
    diagnosticsEnabled,
    locale,
    message,
    onSubmitted,
    rating,
    showToast,
    theme.id,
    topic,
  ]);

  return (
    <View style={styles.root} testID={MOBILE_FEEDBACK_SCREEN_TEST_ID}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.backAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          testID="mobile-feedback-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={15} />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {copy.feedbackTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {copy.feedbackSubtitle}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{copy.feedbackRatingTitle}</Text>
          <Text style={styles.cardHint}>{copy.feedbackRatingHint}</Text>
          <View style={styles.ratingRow}>
            {MOBILE_FEEDBACK_RATINGS.map((option) => {
              const isSelected = option === rating;
              return (
                <Pressable
                  accessibilityLabel={getRatingLabel(copy, option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  key={option}
                  onPress={() => setRating(option)}
                  style={({ pressed }) => [
                    styles.ratingCell,
                    isSelected && styles.ratingCellSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`mobile-feedback-rating-${option}`}
                >
                  <MobileLineIcon
                    color={isSelected ? theme.accent.default : theme.text.visualPlaceholder}
                    name={MOBILE_FEEDBACK_RATING_ICONS[option]}
                    size={22}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.ratingLabel, isSelected && styles.ratingLabelSelected]}
                  >
                    {getRatingLabel(copy, option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.cardCompact}>
          <Text style={styles.sectionLabel}>{copy.feedbackTopicLabel}</Text>
          <View style={styles.topicRow}>
            {MOBILE_FEEDBACK_TOPICS.map((option) => {
              const isSelected = option === topic;
              return (
                <Pressable
                  accessibilityLabel={getMobileFeedbackTopicLabel(copy, option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  key={option}
                  onPress={() => selectTopic(option)}
                  style={({ pressed }) => [
                    styles.topicChip,
                    isSelected && styles.topicChipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`mobile-feedback-topic-${option}`}
                >
                  <MobileLineIcon
                    color={isSelected ? theme.accent.default : theme.text.visualSecondary}
                    name={MOBILE_FEEDBACK_TOPIC_ICONS[option]}
                    size={12}
                  />
                  <Text style={[styles.topicLabel, isSelected && styles.topicLabelSelected]}>
                    {getMobileFeedbackTopicLabel(copy, option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.cardCompact}>
          <View style={styles.messageHeader}>
            <Text style={styles.sectionLabel}>{copy.feedbackMessageLabel}</Text>
            <Text style={styles.counter} testID="mobile-feedback-counter">
              {counter}
            </Text>
          </View>
          <View style={[styles.messageField, isMessageFocused && styles.messageFieldFocused]}>
            <TextInput
              accessibilityLabel={copy.feedbackMessageLabel}
              maxLength={MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH}
              multiline
              onBlur={() => setMessageFocused(false)}
              onChangeText={setMessage}
              onFocus={() => setMessageFocused(true)}
              placeholder={copy.feedbackMessagePlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={styles.messageInput}
              testID="mobile-feedback-message"
              value={message}
            />
          </View>
          <View style={styles.attachmentRow}>
            {attachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachmentTile}>
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: attachment.localUri }}
                  style={styles.attachmentImage}
                />
                {/* The thumbnail is always visible; the veil only says what the
                    upload is doing on top of it. */}
                {attachment.status === "uploading" ? (
                  <View
                    style={styles.attachmentVeil}
                    testID={`mobile-feedback-attachment-uploading-${attachment.id}`}
                  >
                    <MobileLineIcon color={theme.text.onInverse} name="loader-arc" size={16} />
                  </View>
                ) : null}
                {attachment.status === "failed" ? (
                  <Pressable
                    accessibilityLabel={copy.feedbackAttachmentRetry}
                    accessibilityRole="button"
                    onPress={() => retryAttachment(attachment)}
                    style={({ pressed }) => [
                      styles.attachmentVeil,
                      styles.attachmentVeilFailed,
                      pressed && styles.pressed,
                    ]}
                    testID={`mobile-feedback-attachment-retry-${attachment.id}`}
                  >
                    <MobileLineIcon color={theme.text.onInverse} name="alert-triangle" size={15} />
                    <Text style={styles.attachmentVeilLabel}>{copy.feedbackAttachmentRetry}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel={copy.feedbackAttachmentRemove}
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => {
                    attachmentFilesRef.current.delete(attachment.id);
                    setAttachments((current) =>
                      removeMobileFeedbackAttachment(current, attachment.id),
                    );
                  }}
                  style={({ pressed }) => [styles.attachmentRemove, pressed && styles.pressed]}
                  testID={`mobile-feedback-attachment-remove-${attachment.id}`}
                >
                  <MobileLineIcon
                    color={theme.text.onInverse}
                    name="close"
                    size={9}
                    strokeWidth={3}
                  />
                </Pressable>
              </View>
            ))}
            {canAddMobileFeedbackAttachment(attachments) ? (
              <Pressable
                accessibilityLabel={copy.feedbackAttachmentAdd}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void addAttachment()}
                style={({ pressed }) => [styles.attachmentAdd, pressed && styles.pressed]}
                testID="mobile-feedback-attachment-add"
              >
                <MobileLineIcon color={theme.text.visualSecondary} name="image" size={16} />
                <Text style={styles.attachmentAddLabel}>{copy.feedbackAttachmentAdd}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.diagnosticsRow}>
          <View style={styles.diagnosticsIcon}>
            <MobileLineIcon color={theme.text.visualSecondary} name="activity" size={15} />
          </View>
          <View style={styles.diagnosticsText}>
            <Text style={styles.diagnosticsTitle}>{copy.feedbackDiagnosticsTitle}</Text>
            <Text style={styles.diagnosticsDescription}>
              {`${copy.feedbackDiagnosticsDescription} · `}
              <Text
                accessibilityRole="button"
                onPress={() => setDiagnosticsSheetOpen(true)}
                style={styles.diagnosticsLink}
                testID="mobile-feedback-diagnostics-link"
              >
                {copy.feedbackDiagnosticsLink}
              </Text>
            </Text>
          </View>
          <Toggle
            accessibilityLabel={copy.feedbackDiagnosticsTitle}
            onValueChange={toggleDiagnostics}
            testID="mobile-feedback-diagnostics-toggle"
            value={diagnosticsEnabled}
          />
        </View>

        <Pressable
          accessibilityLabel={copy.feedbackSubmitAction}
          accessibilityRole="button"
          accessibilityState={{ busy: isSubmitting, disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primaryAction,
            !canSubmit && styles.primaryActionDisabled,
            pressed && canSubmit && styles.pressed,
          ]}
          testID="mobile-feedback-submit"
        >
          <MobileLineIcon color={theme.text.onPrimary} name="send" size={15} />
          <Text style={styles.primaryActionLabel}>{copy.feedbackSubmitAction}</Text>
        </Pressable>

        <View style={styles.privacyNote}>
          <MobileLineIcon color={theme.text.visualPlaceholder} name="lock" size={12} />
          <Text style={styles.privacyNoteText}>{copy.feedbackPrivacyNote}</Text>
        </View>
      </ScrollView>

      <MobileFeedbackDiagnosticsSheet
        appVersion={appVersion}
        onClose={() => setDiagnosticsSheetOpen(false)}
        open={isDiagnosticsSheetOpen}
      />
    </View>
  );
}
