import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image, Linking, Pressable, Text, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Avatar, Button } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileDMDetails } from "./mobile-dm-details-client";
import { mobileCopy } from "../locale/mobile-copy";

type Details = Awaited<ReturnType<typeof fetchMobileDMDetails>>;
type Row =
  | { id: "participant"; kind: "participant"; value: Details["participant"] }
  | { id: string; kind: "server"; value: Details["mutualServers"][number] }
  | { id: string; kind: "attachment"; value: Details["sharedAttachments"]["media"][number] };

/** Presence reads the same here as it does in the friends list. */
function getPresenceLabel(status: string, copy: (typeof mobileCopy)[keyof typeof mobileCopy]): string {
  switch (status) {
    case "DND":
      return copy.friendsStatusDnd;
    case "IDLE":
      return copy.friendsStatusIdle;
    case "OFFLINE":
      return copy.friendsStatusOffline;
    case "ONLINE":
      return copy.friendsStatusOnline;
    default:
      return status;
  }
}

const createStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.base, flex: 1 },
  content: { gap: 10, padding: theme.spacing.page, paddingBottom: 48 },
  title: { ...theme.typography.headline, color: theme.text.primary },
  section: { ...theme.typography.label, color: theme.text.muted, marginTop: 12 },
  row: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    minHeight: 68,
    padding: 12,
  },
  body: { flex: 1 },
  name: { ...theme.typography.bodyStrong, color: theme.text.primary },
  meta: { ...theme.typography.caption, color: theme.text.muted },
  image: { borderRadius: theme.radii.control, height: 56, width: 72 },
  empty: { ...theme.typography.body, color: theme.text.muted, paddingVertical: 24 },
});

export function MobileDMDetailsScreen({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack(): void;
}) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createStyles);
  const copy = mobileCopy[locale];
  const query = useInfiniteQuery({
    initialPageParam: null as string | null,
    queryKey: mobileQueryKeys.dmDetails(conversationId),
    queryFn: ({ pageParam }) =>
      fetchMobileDMDetails(
        apiClient,
        conversationId,
        pageParam ? { cursor: pageParam, limit: 30 } : { limit: 30 },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60_000,
  });
  const pages = query.data?.pages ?? [];
  const firstPage = pages[0];
  const attachments = pages.flatMap((page) => [
    ...page.sharedAttachments.media,
    ...page.sharedAttachments.files,
  ]);
  const rows: Row[] = firstPage
    ? [
        { id: "participant", kind: "participant", value: firstPage.participant },
        ...firstPage.mutualServers.map((value) => ({
          id: `server-${value.id}`,
          kind: "server" as const,
          value,
        })),
        ...attachments.map((value) => ({
          id: `attachment-${value.attachment.id}`,
          kind: "attachment" as const,
          value,
        })),
      ]
    : [];
  return (
    <View style={styles.root} testID="mobile-dm-details-screen">
      <FlashList
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Button
              label={copy.dmDetailsBack}
              icon="arrow-back"
              variant="ghost"
              onPress={onBack}
              testID="mobile-dm-details-back"
            />
            <Text style={styles.title}>{copy.dmDetailsConversationDetails}</Text>
          </>
        }
        ListEmptyComponent={
          !query.isLoading ? (
            <Text style={styles.empty}>
              {query.isError
                ? copy.dmDetailsLoadFailed
                : copy.dmDetailsEmpty}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === "participant")
            return (
              <View style={styles.row} testID="mobile-dm-details-participant">
                <Avatar
                  label={item.value.displayName ?? item.value.username}
                  imageUrl={item.value.avatarUrl}
                />
                <View style={styles.body}>
                  <Text style={styles.name}>{item.value.displayName ?? item.value.username}</Text>
                  <Text style={styles.meta}>
                    @{item.value.username} · {getPresenceLabel(item.value.status, copy)}
                  </Text>
                  {item.value.customStatus ? (
                    <Text style={styles.meta}>{item.value.customStatus}</Text>
                  ) : null}
                </View>
              </View>
            );
          if (item.kind === "server")
            return (
              <View style={styles.row} testID={`mobile-dm-mutual-server-${item.value.id}`}>
                {item.value.iconUrl ? (
                  <Image source={{ uri: item.value.iconUrl }} style={styles.image} />
                ) : null}
                <View style={styles.body}>
                  <Text style={styles.section}>{copy.dmDetailsMutualServersHeading}</Text>
                  <Text style={styles.name}>{item.value.name}</Text>
                  <Text style={styles.meta}>
                    {item.value.memberCount} {copy.dmDetailsMembersSuffix}
                  </Text>
                </View>
              </View>
            );
          const attachment = item.value.attachment;
          return (
            <Pressable
              accessibilityRole="link"
              onPress={() => (attachment.url ? void Linking.openURL(attachment.url) : undefined)}
              style={styles.row}
              testID={`mobile-dm-shared-attachment-${attachment.id}`}
            >
              {attachment.url && attachment.contentType.startsWith("image/") ? (
                <Image source={{ uri: attachment.url }} style={styles.image} />
              ) : null}
              <View style={styles.body}>
                <Text style={styles.section}>{copy.dmDetailsSharedAttachmentsHeading}</Text>
                <Text numberOfLines={1} style={styles.name}>
                  {attachment.filename}
                </Text>
                <Text style={styles.meta}>{Math.ceil(attachment.size / 1024)} KB</Text>
              </View>
            </Pressable>
          );
        }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.35}
        testID="mobile-dm-details-list"
      />
    </View>
  );
}
