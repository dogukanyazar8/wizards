import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import type { MobileFeedbackSubmitRequest } from "@wizards/types";

import type { MobileApiClient } from "../../../api/mobile-api-client";
import {
  buildMobileRatingFeedbackRequest,
  calculateMobileRatingUsageDays,
  getMobileRatingLabel,
  getMobileRatingSnoozedUntil,
  resolveMobileRatingStoreUrl,
  type MobileRating,
  type MobileRatingStoreIdentity,
  type MobileRatingTopic,
} from "../../../about/mobile-rating-model";
import { writeMobileAboutPreference } from "../../../about/mobile-about-preferences";
import { submitMobileFeedback } from "../../../feedback/mobile-feedback-client";
import { mobileCopy } from "../../../locale/mobile-copy";
import { WHISPR_MOBILE_APP_IDENTITY } from "../../../release/mobile-store-contract";
import { BottomSheet, type BottomSheetPresentation } from "../../components/kit/bottom-sheet";
import { MOBILE_ABOUT_RATING_OVERLAY_ID } from "../../components/kit/overlay-registry";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutStarIcon } from "./about-icons";
import { AboutBrandLogo, AboutConsentSheetShell } from "./about-primitives";
import { useAboutRatingSheetStyles } from "./about-rating-sheet.styles";

type SubmitRatingFeedback = (
  client: MobileApiClient,
  input: MobileFeedbackSubmitRequest,
) => Promise<unknown>;

export interface AboutRatingSheetProps {
  readonly apiClient: MobileApiClient;
  readonly appVersion: string;
  /** Unknown until a real first-session source exists; never synthesized. */
  readonly firstSessionAt?: string | null;
  readonly now?: () => Date;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly openStoreUrl?: (url: string) => Promise<unknown>;
  readonly platform?: string;
  readonly storeIdentity?: MobileRatingStoreIdentity;
  readonly submitFeedback?: SubmitRatingFeedback;
}

const RATING_VALUES = [1, 2, 3, 4, 5] as const satisfies readonly MobileRating[];
const RATING_LOGO_WAVEFORM_HEIGHTS = [13, 19, 26, 18, 14] as const;

const getNow = () => new Date();
const openUrl = (url: string) => Linking.openURL(url);
const sendFeedback: SubmitRatingFeedback = (client, input) => submitMobileFeedback(client, input);

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function AboutRatingSheet({
  apiClient,
  appVersion,
  firstSessionAt = null,
  now = getNow,
  onClose,
  open,
  openStoreUrl = openUrl,
  platform = Platform.OS,
  storeIdentity = WHISPR_MOBILE_APP_IDENTITY,
  submitFeedback = sendFeedback,
}: AboutRatingSheetProps) {
  const theme = useTheme();
  const styles = useAboutRatingSheetStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const titleFocusRef = useRef<View | null>(null);
  const [rating, setRating] = useState<MobileRating | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<readonly MobileRatingTopic[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(null);
      setSelectedTopics([]);
      setBusy(false);
    }
  }, [open]);

  const presentation = useMemo<BottomSheetPresentation>(
    () => ({
      backdropStyle: styles.backdrop,
      contentStyle: styles.content,
      handleAreaStyle: styles.hiddenHandleArea,
      handleStyle: styles.hiddenHandle,
      panelStyle: styles.panel,
    }),
    [styles],
  );
  const usageDays = calculateMobileRatingUsageDays(firstSessionAt, now());
  const reason =
    usageDays === null
      ? copy.rateReasonUnknown
      : fill(copy.rateReason, { days: String(usageDays) });
  const selectionLabel =
    rating === null
      ? ""
      : fill(copy.rateSelection, {
          label: getMobileRatingLabel(rating, copy),
          stars: String(rating),
        });
  const storeUrl = rating === 5 ? resolveMobileRatingStoreUrl(platform, storeIdentity) : null;
  const usesStore = rating === 5 && storeUrl !== null;
  const topics = [
    { id: "notifications", label: copy.rateTopicNotifications },
    { id: "audio", label: copy.rateTopicAudio },
    { id: "speed", label: copy.rateTopicSpeed },
    { id: "design", label: copy.rateTopicDesign },
  ] as const satisfies readonly { readonly id: MobileRatingTopic; readonly label: string }[];
  const primaryLabel = usesStore
    ? platform === "android"
      ? copy.ratePlayStoreAction
      : copy.rateStoreAction
    : copy.rateSubmit;

  const selectRating = (next: MobileRating) => {
    selection();
    setRating(next);
  };

  const toggleTopic = (topic: MobileRatingTopic) => {
    selection();
    setSelectedTopics((current) =>
      current.includes(topic)
        ? current.filter((candidate) => candidate !== topic)
        : [...current, topic],
    );
  };

  const dismiss = () => {
    if (!busy) {
      onClose();
    }
  };

  const submit = async () => {
    if (rating === null || busy) {
      return;
    }

    setBusy(true);
    try {
      if (usesStore && storeUrl !== null) {
        await openStoreUrl(storeUrl);
      } else {
        await submitFeedback(apiClient, buildMobileRatingFeedbackRequest(rating, selectedTopics));
      }
      await writeMobileAboutPreference(AsyncStorage, "rateSubmittedVersion", appVersion);
      onClose();
    } catch (error) {
      // The sheet stays open and retryable. The URL/API/storage cause remains in
      // development logs without exposing internals or credentials to the user.
      console.warn("[AboutRatingSheet] Rating action could not be completed.", error);
    } finally {
      setBusy(false);
    }
  };

  const snooze = async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await writeMobileAboutPreference(
        AsyncStorage,
        "rateSnoozedUntil",
        getMobileRatingSnoozedUntil(now()),
      );
      onClose();
    } catch (error) {
      console.warn("[AboutRatingSheet] Rating snooze could not be persisted.", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      accessibilityLabel={copy.rateTitle}
      initialFocusRef={titleFocusRef}
      onClose={dismiss}
      open={open}
      overlayId={MOBILE_ABOUT_RATING_OVERLAY_ID}
      panEnabled={!busy}
      presentation={presentation}
      sizing="content"
      testID="mobile-about-rating-sheet"
    >
      <AboutConsentSheetShell testID="mobile-about-rating-shell">
        <View style={styles.centered}>
          <View style={styles.logo}>
            <AboutBrandLogo
              accessibilityLabel="Whispr"
              size={52}
              testID="mobile-about-rating-logo"
              waveformHeights={RATING_LOGO_WAVEFORM_HEIGHTS}
            />
          </View>

          <View accessible accessibilityRole="header" ref={titleFocusRef} style={styles.titleFocus}>
            <Text maxFontSizeMultiplier={2} style={styles.title}>
              {copy.rateTitle}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.reason}>
            {reason}
          </Text>

          <View accessibilityRole="radiogroup" style={styles.stars}>
            {RATING_VALUES.map((value) => {
              const filled = rating !== null && value <= rating;
              return (
                <Pressable
                  accessibilityLabel={fill(copy.rateStarAccessibility, {
                    stars: String(value),
                  })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: value === rating }}
                  hitSlop={{ bottom: 1, left: 1, right: 1, top: 1 }}
                  key={value}
                  onPress={() => selectRating(value)}
                  style={({ pressed }) => [styles.starTarget, pressed && styles.pressed]}
                  testID={`mobile-about-rating-star-${value}`}
                >
                  <AboutStarIcon
                    color={filled ? theme.about.star : theme.about.starEmpty}
                    filled={filled}
                    size={42}
                    testID={`mobile-about-rating-star-icon-${value}`}
                  />
                </Pressable>
              );
            })}
          </View>
          <Text
            accessibilityElementsHidden={rating === null}
            importantForAccessibility={rating === null ? "no-hide-descendants" : "auto"}
            maxFontSizeMultiplier={2}
            style={styles.selectionLabel}
            testID="mobile-about-rating-selection-label"
          >
            {selectionLabel}
          </Text>
        </View>

        {usesStore ? (
          <Text maxFontSizeMultiplier={2} style={styles.storeHint}>
            {copy.rateStoreHint}
          </Text>
        ) : (
          <View style={styles.feedback} testID="mobile-about-rating-feedback">
            <Text maxFontSizeMultiplier={2} style={styles.feedbackTitle}>
              {copy.rateFeedbackTitle}
            </Text>
            <Text maxFontSizeMultiplier={2} style={styles.feedbackDescription}>
              {copy.rateFeedbackSub}
            </Text>
            <View style={styles.topics}>
              {topics.map((topic) => {
                const selected = selectedTopics.includes(topic.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    key={topic.id}
                    onPress={() => toggleTopic(topic.id)}
                    style={({ pressed }) => [
                      styles.topic,
                      selected && styles.topicSelected,
                      pressed && styles.pressed,
                    ]}
                    testID={`mobile-about-rating-topic-${topic.id}`}
                  >
                    <Text
                      maxFontSizeMultiplier={2}
                      style={[styles.topicLabel, selected && styles.topicLabelSelected]}
                    >
                      {topic.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Pressable
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: rating === null || busy }}
          disabled={rating === null || busy}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primary,
            (rating === null || busy) && styles.primaryDisabled,
            pressed && rating !== null && !busy && styles.pressed,
          ]}
          testID="mobile-about-rating-primary"
        >
          <Text maxFontSizeMultiplier={2} style={styles.primaryLabel}>
            {primaryLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void snooze()}
          style={({ pressed }) => [styles.later, pressed && styles.pressed]}
          testID="mobile-about-rating-later"
        >
          <Text maxFontSizeMultiplier={2} style={styles.laterLabel}>
            {copy.rateLater}
          </Text>
        </Pressable>
      </AboutConsentSheetShell>
    </BottomSheet>
  );
}
