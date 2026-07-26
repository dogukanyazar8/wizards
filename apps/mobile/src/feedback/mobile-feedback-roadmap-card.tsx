import { Pressable, Text, View } from "react-native";
import type { FeedbackStatus, MobileRoadmapItem } from "@wizards/types";

import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import type { MobileTheme } from "../design/themes";
import { mobileCopy } from "../locale/mobile-copy";
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
  isFirst,
  item,
  onToggleVote,
  styles,
}: {
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
    <View style={[styles.roadmapRow, !isFirst && styles.roadmapRowDivided]}>
      <View style={styles.roadmapRowText}>
        <Text numberOfLines={1} style={styles.roadmapTitle}>
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={styles.roadmapMeta}
          testID={`mobile-roadmap-meta-${item.id}`}
        >
          {meta}
        </Text>
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
