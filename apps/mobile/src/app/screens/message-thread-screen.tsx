import { Pressable, Text, View } from "react-native";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import type { MobileTheme } from "../../design/themes";
import {
  useMobileChannelMessageThreadQuery,
  useMobileDMMessageThreadQuery,
} from "../../query/mobile-message-thread-query";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { MessageListSkeleton, MessagePreviewRow, MessageStream } from "../components/message-primitives";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";

const copy = activeMobileCopy;
const createStyles = (theme: MobileTheme) => ({
  screen: { backgroundColor: theme.surface.base, flex: 1, padding: theme.spacing.section },
  header: { alignItems: "center" as const, flexDirection: "row" as const, gap: theme.spacing.row },
  back: { minHeight: theme.sizing.minTouchTarget, justifyContent: "center" as const },
  backText: { ...theme.typography.bodyStrong, color: theme.accent.strong },
  title: { ...theme.typography.title, color: theme.text.primary, flex: 1 },
  parent: { marginTop: theme.spacing.section },
  error: { ...theme.typography.body, color: theme.status.danger, marginTop: theme.spacing.section },
  empty: { ...theme.typography.body, color: theme.text.muted, marginTop: theme.spacing.section },
});

export function MobileMessageThreadScreen({
  contextId,
  messageId,
  onBack,
  scope,
}: {
  readonly contextId: string;
  readonly messageId: string;
  onBack(): void;
  readonly scope: "channel" | "dm";
}) {
  const styles = useThemedStyles(createStyles);
  const { apiClient, session } = useMobileAuth();
  const channelQuery = useMobileChannelMessageThreadQuery(
    apiClient,
    scope === "channel" ? contextId : "",
    scope === "channel" ? messageId : "",
  );
  const dmQuery = useMobileDMMessageThreadQuery(
    apiClient,
    scope === "dm" ? contextId : "",
    scope === "dm" ? messageId : "",
  );
  const query = scope === "channel" ? channelQuery : dmQuery;
  const payload = query.data;
  const currentUserId = session?.user.id ?? "";

  return (
    <View style={styles.screen} testID="mobile-message-thread-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.messageThreadBackAction}
          accessibilityRole="button"
          onPress={onBack}
          style={styles.back}
          testID="mobile-message-thread-back-button"
        >
          <Text style={styles.backText}>{copy.messageThreadBackAction}</Text>
        </Pressable>
        <Text style={styles.title}>{copy.messageThreadTitle}</Text>
      </View>
      {query.isLoading ? <MessageListSkeleton testID="mobile-thread-loading" /> : null}
      {query.isError ? (
        <Text style={styles.error}>{copy.messageThreadLoadFailed}</Text>
      ) : null}
      {payload ? (
        <>
          <View style={styles.parent}>
            <MessagePreviewRow currentUserId={currentUserId} message={payload.parent} />
          </View>
          {payload.messages.length > 0 ? (
            <MessageStream currentUserId={currentUserId} messages={payload.messages} />
          ) : (
            <Text style={styles.empty}>{copy.messageThreadEmpty}</Text>
          )}
        </>
      ) : null}
    </View>
  );
}
