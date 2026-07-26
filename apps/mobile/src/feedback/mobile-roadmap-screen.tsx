import { useCallback, useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { MobileFeedbackListItem, MobileRoadmapItem } from "@wizards/types";

import { EmptyState, Skeleton, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { MobileMyFeedbackRow, MobileRoadmapRow } from "./mobile-feedback-roadmap-card";
import {
  MOBILE_ROADMAP_STATUS_FILTERS,
  countMobileRoadmapByStatus,
  filterMobileRoadmapItems,
  type MobileRoadmapStatusFilter,
} from "./mobile-feedback-model";
import {
  useMobileFeedbackListQuery,
  useMobileRoadmapQuery,
  useMobileRoadmapVoteMutation,
} from "./mobile-feedback-query";
import { useMobileFeedbackStyles } from "./mobile-feedback-screen.styles";

export const MOBILE_ROADMAP_SCREEN_TEST_ID = "mobile-roadmap-screen";

type RoadmapTab = "community" | "mine";
type FeedbackCopy = (typeof mobileCopy)[keyof typeof mobileCopy];

function getFilterLabel(copy: FeedbackCopy, filter: MobileRoadmapStatusFilter): string {
  switch (filter) {
    case "IN_PROGRESS":
      return copy.feedbackStatusInProgress;
    case "PLANNED":
      return copy.feedbackStatusPlanned;
    case "REVIEWING":
      return copy.feedbackStatusReviewing;
    case "SHIPPED":
      return copy.feedbackStatusShipped;
    default:
      return copy.roadmapFilterAll;
  }
}

export interface MobileRoadmapScreenProps {
  onBack(): void;
  /** Opens the 4b tracking view for one of the viewer's own reports. */
  onOpenFeedback(feedbackId: string): void;
  /** The way out of an empty "Bildirdiklerim": back to the form. */
  onStartFeedback(): void;
}

/**
 * The community roadmap, in two tabs.
 *
 * "Topluluk" is what everyone is voting on, filtered by the status band an item
 * sits in. "Bildirdiklerim" is the same story from the other end: the reports
 * this user sent, with the number a FEEDBACK notification quotes. Both read the
 * same status vocabulary, because a user who votes for an idea and a user who
 * reported a bug are asking the same question — where is it now?
 */
export function MobileRoadmapScreen({
  onBack,
  onOpenFeedback,
  onStartFeedback,
}: MobileRoadmapScreenProps) {
  const styles = useMobileFeedbackStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<RoadmapTab>("community");
  const [filter, setFilter] = useState<MobileRoadmapStatusFilter>("ALL");

  const roadmapQuery = useMobileRoadmapQuery(apiClient, true);
  // The second tab costs a request, so it is not paid for until it is opened.
  const feedbackListQuery = useMobileFeedbackListQuery(apiClient, tab === "mine");
  const voteMutation = useMobileRoadmapVoteMutation(apiClient);

  const items = useMemo(() => roadmapQuery.data?.items ?? [], [roadmapQuery.data]);
  const counts = useMemo(() => countMobileRoadmapByStatus(items), [items]);
  const visibleItems = useMemo(() => filterMobileRoadmapItems(items, filter), [filter, items]);

  const toggleVote = useCallback(
    (item: MobileRoadmapItem) => {
      voteMutation.mutate(
        { roadmapItemId: item.id, voted: !item.votedByViewer },
        { onError: () => showToast({ title: copy.feedbackVoteFailedTitle, variant: "error" }) },
      );
    },
    [copy.feedbackVoteFailedTitle, showToast, voteMutation],
  );

  const renderRoadmapItem = useCallback(
    ({ item }: { item: MobileRoadmapItem }) => (
      <View style={styles.cardCompact}>
        <MobileRoadmapRow detailed isFirst item={item} onToggleVote={toggleVote} styles={styles} />
      </View>
    ),
    [styles, toggleVote],
  );

  const renderFeedbackItem = useCallback(
    ({ item }: { item: MobileFeedbackListItem }) => (
      <MobileMyFeedbackRow item={item} onPress={onOpenFeedback} styles={styles} />
    ),
    [onOpenFeedback, styles],
  );

  return (
    <View style={styles.root} testID={MOBILE_ROADMAP_SCREEN_TEST_ID}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.backAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          testID="mobile-roadmap-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={15} />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {copy.roadmapTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {copy.roadmapSubtitle}
          </Text>
        </View>
      </View>

      <View style={styles.segmentShell}>
        {(["community", "mine"] as const).map((value) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            key={value}
            onPress={() => setTab(value)}
            style={[styles.segment, tab === value && styles.segmentActive]}
            testID={`mobile-roadmap-tab-${value}`}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentText, tab === value && styles.segmentTextActive]}
            >
              {value === "community" ? copy.roadmapTabCommunity : copy.roadmapTabMine}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "community" ? (
        <>
          <ScrollView
            contentContainerStyle={styles.filterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {MOBILE_ROADMAP_STATUS_FILTERS.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filter === option }}
                key={option}
                onPress={() => setFilter(option)}
                style={({ pressed }) => [
                  styles.filterChip,
                  filter === option && styles.filterChipSelected,
                  pressed && styles.pressed,
                ]}
                testID={`mobile-roadmap-filter-${option}`}
              >
                <Text style={[styles.filterLabel, filter === option && styles.filterLabelSelected]}>
                  {getFilterLabel(copy, option)}
                </Text>
                <Text
                  style={[styles.filterCount, filter === option && styles.filterCountSelected]}
                  testID={`mobile-roadmap-filter-count-${option}`}
                >
                  {counts[option]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {roadmapQuery.isPending ? (
            <View style={styles.content} testID="mobile-roadmap-loading">
              <View style={styles.card}>
                <Skeleton height={44} />
              </View>
            </View>
          ) : roadmapQuery.isError ? (
            <View style={styles.content}>
              <View style={styles.stateCard} testID="mobile-roadmap-error">
                <Text style={styles.stateText}>{copy.roadmapLoadError}</Text>
              </View>
            </View>
          ) : (
            <FlashList
              contentContainerStyle={styles.content}
              data={visibleItems}
              // One row shape, so recycling never has to switch layouts.
              getItemType={() => "roadmap-item"}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                // An empty chip is not an empty roadmap, and saying "henüz yol
                // haritası yok" under a filter the user just chose would be a lie.
                items.length === 0 ? (
                  <EmptyState
                    description={copy.roadmapEmptyDescription}
                    icon="bulb-outline"
                    testID="mobile-roadmap-empty"
                    title={copy.roadmapEmptyTitle}
                  />
                ) : (
                  <View style={styles.stateCard} testID="mobile-roadmap-filter-empty">
                    <Text style={styles.stateText}>{copy.roadmapFilterEmpty}</Text>
                  </View>
                )
              }
              onRefresh={() => void roadmapQuery.refetch()}
              refreshing={roadmapQuery.isRefetching}
              renderItem={renderRoadmapItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      ) : feedbackListQuery.isPending ? (
        <View style={styles.content} testID="mobile-my-feedback-loading">
          <View style={styles.card}>
            <Skeleton height={64} />
          </View>
        </View>
      ) : feedbackListQuery.isError ? (
        <View style={styles.content}>
          <View style={styles.stateCard} testID="mobile-my-feedback-error">
            <Text style={styles.stateText}>{copy.myFeedbackLoadError}</Text>
          </View>
        </View>
      ) : (
        <FlashList
          contentContainerStyle={styles.content}
          data={feedbackListQuery.data?.items ?? []}
          getItemType={() => "my-feedback-item"}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.content} testID="mobile-my-feedback-empty">
              <EmptyState
                description={copy.myFeedbackEmptyDescription}
                icon="chatbubble-ellipses-outline"
                title={copy.myFeedbackEmptyTitle}
              />
              <Pressable
                accessibilityRole="button"
                onPress={onStartFeedback}
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
                testID="mobile-my-feedback-start"
              >
                <Text style={styles.primaryActionLabel}>{copy.myFeedbackEmptyAction}</Text>
              </Pressable>
            </View>
          }
          onRefresh={() => void feedbackListQuery.refetch()}
          refreshing={feedbackListQuery.isRefetching}
          renderItem={renderFeedbackItem}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
