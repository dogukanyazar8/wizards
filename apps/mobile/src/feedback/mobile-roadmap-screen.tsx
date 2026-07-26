import { useCallback } from "react";
import { FlashList } from "@shopify/flash-list";
import { Pressable, Text, View } from "react-native";
import type { MobileRoadmapItem } from "@wizards/types";

import { EmptyState, Skeleton, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { MobileRoadmapRow } from "./mobile-feedback-roadmap-card";
import { useMobileRoadmapQuery, useMobileRoadmapVoteMutation } from "./mobile-feedback-query";
import { useMobileFeedbackStyles } from "./mobile-feedback-screen.styles";

export const MOBILE_ROADMAP_SCREEN_TEST_ID = "mobile-roadmap-screen";

/**
 * "Tümünü gör" from 4b. Same rows, same vote button, no cap — the card shows
 * three so the receipt stays readable; this is where the rest lives.
 */
export function MobileRoadmapScreen({ onBack }: { onBack(): void }) {
  const styles = useMobileFeedbackStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();

  const roadmapQuery = useMobileRoadmapQuery(apiClient, true);
  const voteMutation = useMobileRoadmapVoteMutation(apiClient);
  const items = roadmapQuery.data?.items ?? [];

  const toggleVote = useCallback(
    (item: MobileRoadmapItem) => {
      voteMutation.mutate(
        { roadmapItemId: item.id, voted: !item.votedByViewer },
        { onError: () => showToast({ title: copy.feedbackVoteFailedTitle, variant: "error" }) },
      );
    },
    [copy.feedbackVoteFailedTitle, showToast, voteMutation],
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
          data={items}
          // One row shape, so recycling never has to switch layouts.
          getItemType={() => "roadmap-item"}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              description={copy.roadmapEmptyDescription}
              icon="bulb-outline"
              testID="mobile-roadmap-empty"
              title={copy.roadmapEmptyTitle}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.cardCompact}>
              <MobileRoadmapRow isFirst item={item} onToggleVote={toggleVote} styles={styles} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
