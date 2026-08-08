import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import {
  formatServerProfileCount,
  type ServerDiscoveryCard,
  type ServerDiscoveryPage,
} from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { MOBILE_ABOUT_SEARCH_DEBOUNCE_MS, useDebouncedValue } from "../about/mobile-about-queries";
import { Avatar, Button, EmptyState, Skeleton } from "../app/components/kit";
import { AboutVerifiedIcon } from "../app/screens/about/about-icons";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileServerDiscovery } from "./mobile-server-discovery-client";
import { createMobileServerDiscoveryStyles } from "./mobile-server-discovery-screen.styles";

export interface MobileServerDiscoveryScreenProps {
  onBack(): void;
  onOpenServer(serverId: string): void;
}

type MobileDiscoveryLabels = (typeof mobileCopy)[keyof typeof mobileCopy];

/**
 * Memoised row (S3 Section D list-performance requirement). Props are the raw
 * `ServerDiscoveryCard` plus primitives — never a value re-wrapped on every
 * render — so an unrelated screen state change (typing in the search box)
 * does not force every visible card to re-render.
 */
const MobileServerDiscoveryCard = memo(function MobileServerDiscoveryCard({
  item,
  labels,
  locale,
  onPress,
}: {
  readonly item: ServerDiscoveryCard;
  readonly labels: MobileDiscoveryLabels;
  readonly locale: "en" | "tr";
  onPress(serverId: string): void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerDiscoveryStyles);

  return (
    <Pressable
      accessibilityLabel={item.name}
      accessibilityRole="button"
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`mobile-discover-card-${item.id}`}
    >
      <View style={styles.cardTop}>
        <Avatar imageUrl={item.iconUrl} label={item.shortName ?? item.name} />
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.name}>
              {item.name}
            </Text>
            {item.verified ? (
              <AboutVerifiedIcon
                color={theme.accent.default}
                size={14}
                testID={`mobile-discover-card-${item.id}-verified`}
              />
            ) : null}
          </View>
          <View style={styles.countsRow}>
            <Text maxFontSizeMultiplier={2} style={styles.countText}>
              {labels.discoverMembersCount.replace(
                "{count}",
                formatServerProfileCount(item.memberCount, locale),
              )}
            </Text>
            <View style={styles.countDot} />
            <View style={styles.onlineDot} />
            <Text maxFontSizeMultiplier={2} style={styles.countText}>
              {labels.discoverOnlineCount.replace(
                "{count}",
                formatServerProfileCount(item.onlineCount, locale),
              )}
            </Text>
          </View>
        </View>
      </View>
      {item.description ? (
        <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.description}>
          {item.description}
        </Text>
      ) : null}
    </Pressable>
  );
});

/**
 * S3 Section D. Ordering is whatever the discovery endpoint returns
 * (`memberCount desc`, S3 binding decision 3) — this screen never re-sorts
 * or re-filters client-side. The card payload has no channel/friend/joined
 * data (S3 Section A is a strict subset of the profile schema), so a tap
 * only opens the S2 `ServerProfile` screen, which owns the actual join
 * action.
 */
export function MobileServerDiscoveryScreen({
  onBack,
  onOpenServer,
}: MobileServerDiscoveryScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerDiscoveryStyles);
  const [queryText, setQueryText] = useState("");
  const debouncedQuery = useDebouncedValue(queryText.trim(), MOBILE_ABOUT_SEARCH_DEBOUNCE_MS);

  const discovery = useInfiniteQuery<
    ServerDiscoveryPage,
    Error,
    InfiniteData<ServerDiscoveryPage>,
    ReturnType<typeof mobileQueryKeys.serverDiscovery>,
    string | null
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      fetchMobileServerDiscovery(apiClient, { cursor: pageParam, query: debouncedQuery, signal }),
    queryKey: mobileQueryKeys.serverDiscovery(debouncedQuery),
  });

  // `.pages` keeps react-query's own item identity (structural sharing) --
  // flatMap does not re-wrap the server objects, so the memoised card above
  // still skips re-rendering rows a refetch left unchanged. Mapping/spreading
  // here would allocate a new object per item on every fetch and quietly
  // defeat that memo -- the trap this repo was burned by before.
  const rows = useMemo(
    () => discovery.data?.pages.flatMap((page) => page.servers) ?? [],
    [discovery.data?.pages],
  );

  const renderCard = useCallback(
    ({ item }: { item: ServerDiscoveryCard }) => (
      <MobileServerDiscoveryCard
        item={item}
        labels={labels}
        locale={locale}
        onPress={onOpenServer}
      />
    ),
    [labels, locale, onOpenServer],
  );

  const isSearching = debouncedQuery.length > 0;

  return (
    <View style={styles.root} testID="mobile-discover-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={labels.discoverBack}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.backButton}
          testID="mobile-discover-back"
        >
          <MobileLineIcon
            color={theme.text.primary}
            name="back-arrow"
            size={18}
            strokeWidth={2.2}
          />
        </Pressable>
        <View style={styles.headerBody}>
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
            {labels.discoverTitle}
          </Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <MobileLineIcon color={theme.text.visualPlaceholder} name="search" size={16} />
          <TextInput
            accessibilityLabel={labels.discoverSearchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQueryText}
            placeholder={labels.discoverSearchPlaceholder}
            placeholderTextColor={theme.text.visualPlaceholder}
            returnKeyType="search"
            style={styles.searchInput}
            testID="mobile-discover-search-input"
            value={queryText}
          />
        </View>
      </View>

      {discovery.isPending ? (
        <View testID="mobile-discover-loading">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={styles.skeletonCard}>
              <Skeleton height={44} />
              <Skeleton height={12} width="60%" />
            </View>
          ))}
        </View>
      ) : discovery.isError ? (
        <View style={styles.stateActions} testID="mobile-discover-error">
          <Text accessibilityRole="alert" style={styles.error}>
            {labels.discoverLoadError}
          </Text>
          <Button
            label={labels.retryAction}
            onPress={() => void discovery.refetch()}
            variant="secondary"
          />
        </View>
      ) : (
        <FlashList
          contentContainerStyle={styles.listContent}
          data={rows}
          // One row shape, so recycling never has to switch layouts.
          getItemType={() => "server-card"}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState
              description={
                isSearching
                  ? labels.discoverSearchEmptyDescription.replace("{query}", debouncedQuery)
                  : labels.discoverEmptyDescription
              }
              icon="compass-outline"
              style={styles.state}
              testID="mobile-discover-empty"
              title={isSearching ? labels.discoverSearchEmptyTitle : labels.discoverEmptyTitle}
            />
          }
          onEndReached={() => {
            if (discovery.hasNextPage && !discovery.isFetchingNextPage) {
              void discovery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={renderCard}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          testID="mobile-discover-list"
        />
      )}
      {discovery.isFetchNextPageError ? (
        <View style={styles.stateActions}>
          <Text
            accessibilityRole="alert"
            style={styles.error}
            testID="mobile-discover-load-more-error"
          >
            {labels.discoverLoadError}
          </Text>
          <Button
            label={labels.retryAction}
            onPress={() => void discovery.fetchNextPage()}
            variant="secondary"
          />
        </View>
      ) : null}
    </View>
  );
}
