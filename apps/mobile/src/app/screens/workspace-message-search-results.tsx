import { queryOptions, useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import type { MessageSearchResult } from "@wizards/types";

import type { MobileApiClient } from "../../api/mobile-api-client";
import { useDebouncedValue } from "../../about/mobile-about-queries";
import { formatMobileChannelRowTimestamp } from "../../locale/mobile-date-separator";
import { mobileQueryKeys } from "../../query/mobile-query-keys";
import {
  MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  searchMobileServerMessages,
} from "../../search/mobile-message-search-client";
import { copy } from "../mobile-root-screen-shared";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useHomeScreenStyles } from "./home-screen.styles";

/** Same delay the help-centre search uses; a keystroke must not be a request. */
export const MOBILE_WORKSPACE_SEARCH_DEBOUNCE_MS = 320;

export function getMobileServerMessageSearchQueryOptions(
  client: MobileApiClient,
  serverId: string,
  query: string,
) {
  const trimmed = query.trim();

  return queryOptions({
    // The endpoint answers 400 under two characters, so nothing is sent until
    // the text is actually a search.
    enabled: serverId.length > 0 && trimmed.length >= MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
    queryFn: () => searchMobileServerMessages(client, { query: trimmed, serverId }),
    queryKey: mobileQueryKeys.serverMessageSearch(serverId, trimmed),
  });
}

export function useMobileServerMessageSearchQuery(
  client: MobileApiClient,
  serverId: string,
  query: string,
) {
  const debouncedQuery = useDebouncedValue(query, MOBILE_WORKSPACE_SEARCH_DEBOUNCE_MS);
  return useQuery(getMobileServerMessageSearchQueryOptions(client, serverId, debouncedQuery));
}

/**
 * 6b's MESAJLAR half. The channel-name matches above it are a local filter over
 * the workspace tree; these come from the server-wide search endpoint, which is
 * what lets the box say "Kanallarda ve mesajlarda ara" without lying.
 */
export function WorkspaceMessageSearchResults({
  isLoading,
  onOpenResult,
  results,
}: {
  isLoading: boolean;
  onOpenResult(result: MessageSearchResult): void;
  results: readonly MessageSearchResult[];
}) {
  const styles = useHomeScreenStyles();
  const { locale } = useMobileLocaleRuntime();

  return (
    <View testID="mobile-workspace-search-messages">
      <Text style={styles.mobileWorkspaceSearchSectionLabel}>
        {copy.workspaceSearchMessagesSection}
      </Text>
      {results.length === 0 ? (
        isLoading ? null : (
          <Text style={styles.mobileWorkspaceSearchEmpty}>{copy.workspaceSearchMessagesEmpty}</Text>
        )
      ) : (
        results.map((result) => (
          <Pressable
            accessibilityLabel={`${result.channelName ?? ""} ${result.author.displayName}`.trim()}
            accessibilityRole="button"
            key={result.id}
            onPress={() => onOpenResult(result)}
            style={({ pressed }) => [
              styles.mobileWorkspaceSearchMessageRow,
              pressed && styles.compactListRowPressed,
            ]}
            testID={`mobile-workspace-search-message-${result.id}`}
          >
            <View style={styles.mobileWorkspaceSearchMessageHeader}>
              <Text numberOfLines={1} style={styles.mobileWorkspaceSearchMessageChannel}>
                #{result.channelName ?? ""}
              </Text>
              <Text numberOfLines={1} style={styles.mobileWorkspaceSearchMessageAuthor}>
                {result.author.displayName}
              </Text>
              <Text style={styles.mobileWorkspaceSearchMessageTime}>
                {formatMobileChannelRowTimestamp(result.createdAt, locale)}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.mobileWorkspaceSearchMessagePreview}>
              {result.content}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
