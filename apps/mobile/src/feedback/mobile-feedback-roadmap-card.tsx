import { Pressable, Text, View } from "react-native";
import {
  formatFeedbackPublicNumber,
  type FeedbackStatus,
  type FeedbackTopic,
  type MobileFeedbackListItem,
  type MobileRoadmapItem,
} from "@wizards/types";

import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import type { MobileTheme } from "../design/themes";
import { mobileCopy } from "../locale/mobile-copy";
import { formatMobileFeedbackRelativeTime } from "./mobile-feedback-model";
import type { MobileFeedbackStyles } from "./mobile-feedback-screen.styles";

type FeedbackCopy = (typeof mobileCopy)[keyof typeof mobileCopy];

export function getMobileFeedbackStatusLabel(copy: FeedbackCopy, status: FeedbackStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return copy.feedbackStatusInProgress;
    case "PLANNED":
      return copy.feedbackStatusPlanned;
    case "SHIPPED":
      return copy.feedbackStatusShipped;
    default:
      return copy.feedbackStatusReviewing;
  }
}

/**
 * Handoff 4b status chip colours. "Değerlendiriliyor" is amber because it is a
 * promise still owed and "Yayınlandı" is green because it is done; "Planlandı"
 * stays neutral on purpose — it is a queue position, not an achievement.
 */
export function getMobileFeedbackStatusTone(
  theme: MobileTheme,
  status: FeedbackStatus,
): { readonly surface: string; readonly text: string } {
  switch (status) {
    case "IN_PROGRESS":
      return { surface: theme.accent.soft, text: theme.accent.strong };
    case "PLANNED":
      return { surface: theme.surface.base, text: theme.text.visualSecondary };
    case "SHIPPED":
      return { surface: theme.status.successSoft, text: theme.status.successText };
    default:
      return { surface: theme.status.visualWarningSoft, text: theme.status.visualWarning };
  }
}

export function MobileFeedbackStatusChip({
  status,
  styles,
  testID,
}: {
  readonly status: FeedbackStatus;
  readonly styles: MobileFeedbackStyles;
  readonly testID?: string;
}) {
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const tone = getMobileFeedbackStatusTone(theme, status);

  return (
    <View
      style={[styles.statusChip, { backgroundColor: tone.surface }]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={[styles.statusDot, { backgroundColor: tone.text }]} />
      <Text style={[styles.statusLabel, { color: tone.text }]}>
        {getMobileFeedbackStatusLabel(mobileCopy[locale], status)}
      </Text>
    </View>
  );
}

export function MobileRoadmapRow({
  detailed = false,
  isFirst,
  item,
  onToggleVote,
  styles,
}: {
  /**
   * The roadmap screen has a whole page to spend, so it shows the description
   * and when the item last moved. The 4b receipt card gets the compact row: it
   * is three lines under a thank-you, not a reading surface.
   */
  readonly detailed?: boolean;
  readonly isFirst: boolean;
  readonly item: MobileRoadmapItem;
  onToggleVote(item: MobileRoadmapItem): void;
  readonly styles: MobileFeedbackStyles;
}) {
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const statusLabel = getMobileFeedbackStatusLabel(copy, item.status);
  const meta = item.isOwnSuggestion
    ? `${statusLabel} · ${copy.feedbackRoadmapOwnSuggestion}`
    : statusLabel;

  return (
    <View
      style={[
        styles.roadmapRow,
        detailed && styles.roadmapRowDetailed,
        !isFirst && styles.roadmapRowDivided,
      ]}
    >
      <View style={styles.roadmapRowText}>
        <Text numberOfLines={detailed ? 2 : 1} style={styles.roadmapTitle}>
          {item.title}
        </Text>
        {detailed ? (
          <>
            {item.description === null ? null : (
              <Text numberOfLines={2} style={styles.roadmapDescription}>
                {item.description}
              </Text>
            )}
            <View style={styles.roadmapStatusRow}>
              <MobileFeedbackStatusChip
                status={item.status}
                styles={styles}
                testID={`mobile-roadmap-status-${item.id}`}
              />
              {item.isOwnSuggestion ? (
                <Text style={styles.roadmapMeta}>{copy.feedbackRoadmapOwnSuggestion}</Text>
              ) : null}
              <Text style={styles.roadmapUpdated} testID={`mobile-roadmap-updated-${item.id}`}>
                {copy.roadmapUpdatedAgo.replace(
                  "{time}",
                  formatMobileFeedbackRelativeTime(item.updatedAt, new Date(), {
                    daysAgo: copy.feedbackDaysAgo,
                    hoursAgo: copy.feedbackHoursAgo,
                    justNow: copy.feedbackJustNow,
                    minutesAgo: copy.feedbackMinutesAgo,
                  }),
                )}
              </Text>
            </View>
          </>
        ) : (
          <Text
            numberOfLines={1}
            style={styles.roadmapMeta}
            testID={`mobile-roadmap-meta-${item.id}`}
          >
            {meta}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityLabel={
          item.votedByViewer ? copy.feedbackUpvoteRemoveAction : copy.feedbackUpvoteAction
        }
        accessibilityRole="button"
        accessibilityState={{ selected: item.votedByViewer }}
        hitSlop={8}
        onPress={() => onToggleVote(item)}
        style={({ pressed }) => [
          styles.voteButton,
          item.votedByViewer && styles.voteButtonActive,
          pressed && styles.pressed,
        ]}
        testID={`mobile-roadmap-vote-${item.id}`}
      >
        <MobileLineIcon
          color={item.votedByViewer ? theme.accent.default : theme.text.visualSecondary}
          name="arrow-up"
          size={11}
        />
        <Text style={[styles.voteCount, item.votedByViewer && styles.voteCountActive]}>
          {item.voteCount}
        </Text>
      </Pressable>
    </View>
  );
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
 * One row of "Bildirdiklerim". The tracking number leads because that is what a
 * FEEDBACK notification says, so the row the user is hunting for is the one
 * whose number they were shown.
 */
export function MobileMyFeedbackRow({
  item,
  onPress,
  styles,
}: {
  readonly item: MobileFeedbackListItem;
  onPress(feedbackId: string): void;
  readonly styles: MobileFeedbackStyles;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`mobile-my-feedback-row-${item.id}`}
    >
      <View style={styles.myFeedbackHeader}>
        <Text style={styles.myFeedbackNumber}>{formatFeedbackPublicNumber(item.publicNumber)}</Text>
        <Text numberOfLines={1} style={styles.myFeedbackTopic}>
          {getMobileFeedbackTopicLabel(copy, item.topic)}
        </Text>
      </View>
      <Text numberOfLines={2} style={styles.myFeedbackPreview}>
        {item.preview}
      </Text>
      <View style={styles.statusRow}>
        <MobileFeedbackStatusChip
          status={item.status}
          styles={styles}
          testID={`mobile-my-feedback-status-${item.id}`}
        />
        <Text style={styles.statusTime}>
          {formatMobileFeedbackRelativeTime(item.statusChangedAt ?? item.createdAt, new Date(), {
            daysAgo: copy.feedbackDaysAgo,
            hoursAgo: copy.feedbackHoursAgo,
            justNow: copy.feedbackJustNow,
            minutesAgo: copy.feedbackMinutesAgo,
          })}
        </Text>
      </View>
    </Pressable>
  );
}
