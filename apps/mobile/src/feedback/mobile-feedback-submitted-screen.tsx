import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  formatFeedbackPublicNumber,
  type MobileFeedbackSummary,
  type MobileRoadmapItem,
} from "@wizards/types";

import { Skeleton, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { MobileFeedbackStatusChip, MobileRoadmapRow } from "./mobile-feedback-roadmap-card";
import { useMobileFeedbackQuery, useMobileRoadmapVoteMutation } from "./mobile-feedback-query";
import { formatMobileFeedbackRelativeTime } from "./mobile-feedback-model";
import { useMobileFeedbackStyles } from "./mobile-feedback-screen.styles";

export const MOBILE_FEEDBACK_SUBMITTED_SCREEN_TEST_ID = "mobile-feedback-submitted-screen";

export interface MobileFeedbackSubmittedScreenProps {
  /** Present when the screen is opened straight from a submission. */
  readonly feedback?: MobileFeedbackSummary;
  /** Present when the screen is opened from a FEEDBACK notification. */
  readonly feedbackId?: string;
  onBack(): void;
  onOpenRoadmap(): void;
  onStartNewFeedback(): void;
  readonly roadmap?: readonly MobileRoadmapItem[];
}

/**
 * Handoff 4b, in two modes.
 *
 * Straight after sending it is a receipt: thank-you, tracking number, roadmap.
 * Opened later from a FEEDBACK notification it is a status page for the same
 * record — same card, same chip, different heading — because a user who taps
 * "WSP-1284 · Planlandı" is asking about that number, not being thanked again.
 */
export function MobileFeedbackSubmittedScreen({
  feedback,
  feedbackId,
  onBack,
  onOpenRoadmap,
  onStartNewFeedback,
  roadmap,
}: MobileFeedbackSubmittedScreenProps) {
  const styles = useMobileFeedbackStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();
  const isTrackingMode = feedback === undefined;

  const feedbackQuery = useMobileFeedbackQuery(apiClient, feedbackId ?? null, isTrackingMode);
  const voteMutation = useMobileRoadmapVoteMutation(apiClient);

  const resolvedFeedback = feedback ?? feedbackQuery.data?.feedback ?? null;
  const resolvedRoadmap = roadmap ?? feedbackQuery.data?.roadmap ?? [];

  const toggleVote = useCallback(
    (item: MobileRoadmapItem) => {
      voteMutation.mutate(
        { roadmapItemId: item.id, voted: !item.votedByViewer },
        {
          onError: () => showToast({ title: copy.feedbackVoteFailedTitle, variant: "error" }),
        },
      );
    },
    [copy.feedbackVoteFailedTitle, showToast, voteMutation],
  );

  return (
    <View style={styles.root} testID={MOBILE_FEEDBACK_SUBMITTED_SCREEN_TEST_ID}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sentHero}>
          <View style={styles.sentBadge}>
            <MobileLineIcon
              color={theme.status.successText}
              name="check"
              size={38}
              strokeWidth={2.4}
            />
            <View style={styles.sentBadgeStar}>
              <MobileLineIcon color={theme.accent.default} name="star" size={11} />
            </View>
          </View>
          <Text style={styles.sentTitle} testID="mobile-feedback-sent-title">
            {isTrackingMode ? copy.feedbackTrackingTitle : copy.feedbackSentTitle}
          </Text>
          <Text style={styles.sentDescription}>
            {isTrackingMode ? copy.feedbackTrackingDescription : copy.feedbackSentDescription}
          </Text>
        </View>

        {resolvedFeedback === null ? (
          <View style={styles.card} testID="mobile-feedback-tracking-loading">
            {feedbackQuery.isError ? (
              <Text style={styles.stateText}>{copy.feedbackTrackingLoadError}</Text>
            ) : (
              <Skeleton height={64} />
            )}
          </View>
        ) : (
          <View style={styles.card} testID="mobile-feedback-tracking-card">
            <View style={styles.trackingHeader}>
              <View style={styles.trackingIcon}>
                <MobileLineIcon color={theme.accent.default} name="message-square" size={16} />
              </View>
              <View style={styles.trackingText}>
                <Text style={styles.trackingNumber} testID="mobile-feedback-tracking-number">
                  {copy.feedbackTrackingNumberLabel.split("{number}")[0]}
                  <Text style={styles.trackingNumberAccent}>
                    {formatFeedbackPublicNumber(resolvedFeedback.publicNumber)}
                  </Text>
                  {copy.feedbackTrackingNumberLabel.split("{number}")[1]}
                </Text>
                <Text style={styles.trackingHint}>{copy.feedbackTrackingHint}</Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <MobileFeedbackStatusChip
                status={resolvedFeedback.status}
                styles={styles}
                testID="mobile-feedback-status-chip"
              />
              <Text style={styles.statusTime}>
                {formatMobileFeedbackRelativeTime(
                  resolvedFeedback.statusChangedAt ?? resolvedFeedback.createdAt,
                  new Date(),
                  {
                    daysAgo: copy.feedbackDaysAgo,
                    hoursAgo: copy.feedbackHoursAgo,
                    justNow: copy.feedbackJustNow,
                    minutesAgo: copy.feedbackMinutesAgo,
                  },
                )}
              </Text>
            </View>
          </View>
        )}

        {resolvedRoadmap.length > 0 ? (
          <View style={styles.card} testID="mobile-feedback-roadmap-card">
            <View style={styles.roadmapHeader}>
              <Text style={styles.sectionLabel}>{copy.feedbackRoadmapLabel}</Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={onOpenRoadmap}
                testID="mobile-feedback-roadmap-see-all"
              >
                <Text style={styles.roadmapSeeAll}>{copy.feedbackRoadmapSeeAll}</Text>
              </Pressable>
            </View>
            {resolvedRoadmap.map((item, index) => (
              <MobileRoadmapRow
                isFirst={index === 0}
                item={item}
                key={item.id}
                onToggleVote={toggleVote}
                styles={styles}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.footerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            testID="mobile-feedback-done"
          >
            <Text style={styles.primaryActionLabel}>{copy.feedbackDoneAction}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onStartNewFeedback}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
            testID="mobile-feedback-new"
          >
            <Text style={styles.secondaryActionLabel}>{copy.feedbackNewAction}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
