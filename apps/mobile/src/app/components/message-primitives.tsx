import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  formatMobileDisplayTime,
  getMobileMessageBodyPreview,
  getMobileMessageStreamItems,
  memo,
  useCallback,
  useMemo,
  useState,
  type ChatMessage,
  type MessageSearchResult,
  type MobileDMMessagesResponse,
  type MobileMessageSearchViewState,
} from "../mobile-root-screen-shared";
import { FlashList } from "@shopify/flash-list";
import { AvatarMark } from "./ui-atoms";
import { MobileCachedImage } from "./mobile-cached-image";
import { Icon } from "./kit";
import { useMessagePrimitiveStyles } from "./message-primitives.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { formatMobileDateSeparator } from "../../locale/mobile-date-separator";

const MOBILE_SEARCH_RESULT_RENDER_LIMIT = 6;

export function isMessageSearchStateForContext(
  state: MobileMessageSearchViewState,
  scope: "channel" | "dm",
  conversationId: string,
) {
  return state.context?.scope === scope && state.context.conversationId === conversationId;
}

export function MessageSearchPanel({
  conversationId,
  onClear,
  onSearch,
  scope,
  state,
}: {
  conversationId: string;
  onClear(): void;
  onSearch(input: {
    conversationId: string;
    query: string;
    scope: "channel" | "dm";
  }): Promise<void>;
  scope: "channel" | "dm";
  state: MobileMessageSearchViewState;
}) {
  const theme = useTheme();
  const styles = useMessagePrimitiveStyles();
  const [draft, setDraft] = useState("");
  const normalizedDraft = draft.trim().replace(/\s+/g, " ");
  const isActiveContext = isMessageSearchStateForContext(state, scope, conversationId);
  const canSearch = normalizedDraft.length >= 2;

  const handleSearch = useCallback(() => {
    if (!canSearch) {
      return;
    }

    void onSearch({
      conversationId,
      query: normalizedDraft,
      scope,
    });
  }, [canSearch, conversationId, normalizedDraft, onSearch, scope]);

  const handleClear = useCallback(() => {
    setDraft("");
    onClear();
  }, [onClear]);

  return (
    <View style={styles.messageSearchCard}>
      <View style={styles.messageSearchInputShell}>
        <Text style={styles.messageSearchIcon}>{copy.directMessageSearchLabel}</Text>
        <TextInput
          accessibilityLabel={copy.messageSearchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setDraft}
          onSubmitEditing={handleSearch}
          placeholder={copy.messageSearchPlaceholder}
          placeholderTextColor={theme.text.soft}
          returnKeyType="search"
          style={styles.messageSearchInput}
          value={draft}
        />
        {draft.length > 0 || isActiveContext ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.messageSearchClearAction}
            onPress={handleClear}
            style={({ pressed }) => [
              styles.messageSearchClearButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Icon name="close" size={16} tone="accent" />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.messageSearchAction}
          accessibilityState={{ disabled: !canSearch }}
          disabled={!canSearch}
          onPress={handleSearch}
          style={({ pressed }) => [
            styles.messageSearchButton,
            !canSearch && styles.messageSearchButtonDisabled,
            pressed && canSearch && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.messageSearchButtonText}>{copy.messageSearchAction}</Text>
        </Pressable>
      </View>
      {!canSearch && draft.trim().length > 0 ? (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchHelper}</Text>
      ) : null}
      {isActiveContext ? <MessageSearchResults state={state} /> : null}
    </View>
  );
}

export function MessageSearchResults({ state }: { state: MobileMessageSearchViewState }) {
  const theme = useTheme();
  const styles = useMessagePrimitiveStyles();
  if (state.status === "loading" && !state.payload) {
    return (
      <View style={styles.messageSearchStatusRow}>
        <ActivityIndicator color={theme.accent.strong} size="small" />
        <Text style={styles.messageSearchStatusText}>{copy.messageSearchLoading}</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return <Text style={styles.messageSearchErrorText}>{state.error}</Text>;
  }

  if ((state.status !== "ready" && state.status !== "loading") || !state.payload) {
    return null;
  }

  const visibleResults = state.payload.results.slice(0, MOBILE_SEARCH_RESULT_RENDER_LIMIT);

  return (
    <View style={styles.messageSearchResults}>
      <View style={styles.messageSearchResultsHeader}>
        <Text style={styles.messageSearchResultsTitle}>{copy.messageSearchResultsTitle}</Text>
        <Text style={styles.messageSearchResultCount}>{state.payload.results.length}</Text>
      </View>
      {visibleResults.length > 0 ? (
        <View style={styles.messageSearchResultList}>
          {visibleResults.map((result) => (
            <MessageSearchResultRow key={result.id} result={result} />
          ))}
        </View>
      ) : (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchEmpty}</Text>
      )}
      {state.payload.nextCursor ? (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchMoreResults}</Text>
      ) : null}
    </View>
  );
}

export function MessageSearchResultRow({ result }: { result: MessageSearchResult }) {
  const styles = useMessagePrimitiveStyles();
  const authorLabel = result.author.displayName ?? result.author.username;
  const body = result.content.trim() || copy.dmAttachmentOnlyMessage;

  return (
    <View style={styles.messageSearchResultRow}>
      <AvatarMark
        label={authorLabel}
        imageUrl={result.author.avatarUrl}
        size="small"
        status={result.author.status === "ONLINE" ? "active" : "idle"}
      />
      <View style={styles.messageSearchResultText}>
        <View style={styles.dmMessageHeader}>
          <Text style={styles.dmMessageAuthor} numberOfLines={1}>
            {authorLabel}
          </Text>
          <Text style={styles.dmMessageTime}>{formatMobileDisplayTime(result.createdAt)}</Text>
        </View>
        <Text style={styles.messageSearchResultBody} numberOfLines={3}>
          {body}
        </Text>
        {result.channelName ? (
          <Text style={styles.messageSearchResultMeta} numberOfLines={1}>
            # {result.channelName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type MobileRenderableMessage = ChatMessage | MobileDMMessagesResponse["messages"][number];

export type MobileRenderableAttachment = MobileRenderableMessage["attachments"][number];

function formatMobileAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function getMobileAttachmentPreviewUri(attachment: MobileRenderableAttachment): string | null {
  const contentType = attachment.contentType.toLowerCase();
  const previewUrl = attachment.thumbnailUrl || attachment.url;

  return contentType.startsWith("image/") && previewUrl ? previewUrl : null;
}

export function MessageDateSeparator({ createdAt }: { createdAt: string }) {
  const styles = useMessagePrimitiveStyles();
  const { locale } = useMobileLocaleRuntime();
  const label = formatMobileDateSeparator(createdAt, locale);
  if (!label) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="text"
      style={styles.messageDateSeparator}
    >
      <View style={styles.messageDateLine} />
      <Text style={styles.messageDateText}>{label}</Text>
      <View style={styles.messageDateLine} />
    </View>
  );
}

export function MessageAttachmentList({
  attachments,
}: {
  attachments: readonly MobileRenderableAttachment[];
}) {
  const styles = useMessagePrimitiveStyles();
  if (attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageAttachmentList}>
      {attachments.map((attachment) => {
        const previewUri = getMobileAttachmentPreviewUri(attachment);
        const sizeLabel = formatMobileAttachmentSize(attachment.size);

        return (
          <View
            key={attachment.id}
            accessible
            accessibilityLabel={[attachment.filename, attachment.contentType, sizeLabel]
              .filter(Boolean)
              .join(", ")}
            style={styles.messageAttachmentCard}
          >
            {previewUri ? (
              <MobileCachedImage
                accessibilityIgnoresInvertColors
                importantForAccessibility="no"
                source={{ uri: previewUri }}
                style={styles.messageAttachmentImage}
              />
            ) : (
              <View style={styles.messageAttachmentIcon}>
                <Icon name="document-attach-outline" size={22} tone="accent" />
              </View>
            )}
            <View style={styles.messageAttachmentMeta}>
              <Text style={styles.messageAttachmentName} numberOfLines={2}>
                {attachment.filename}
              </Text>
              <Text style={styles.messageAttachmentInfo} numberOfLines={1}>
                {[attachment.contentType, sizeLabel].filter(Boolean).join(" - ")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function MessageReactionList({
  reactions,
}: {
  reactions: MobileRenderableMessage["reactions"];
}) {
  const styles = useMessagePrimitiveStyles();
  if (reactions.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageReactionRow}>
      {reactions.map((reaction) => (
        <View key={reaction.emoji} style={styles.messageReactionChip}>
          <Text style={styles.messageReactionText}>
            {reaction.emoji} {reaction.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MessageStream({
  currentUserId,
  messages,
}: {
  currentUserId: string;
  messages: readonly MobileRenderableMessage[];
}) {
  const styles = useMessagePrimitiveStyles();
  const streamItems = useMemo(() => getMobileMessageStreamItems(messages), [messages]);

  return (
    <FlashList
      contentContainerStyle={styles.dmMessageListContent}
      data={streamItems}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.messageStreamItem}>
          {item.showDateSeparator ? (
            <MessageDateSeparator createdAt={item.message.createdAt} />
          ) : null}
          <MemoizedMessagePreviewRow
            message={item.message}
            own={item.message.author.id === currentUserId}
          />
        </View>
      )}
      showsVerticalScrollIndicator={false}
      style={styles.dmMessageList}
      testID="mobile-dm-message-list"
    />
  );
}

export function MessagePreviewRow({
  mode = "conversation",
  message,
  own = false,
}: {
  mode?: "channel" | "conversation";
  message: MobileRenderableMessage;
  own?: boolean;
}) {
  const styles = useMessagePrimitiveStyles();
  const isChannelMode = mode === "channel";
  const authorLabel = message.author.displayName ?? message.author.username;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });

  return (
    <View
      style={[
        styles.messagePreviewRow,
        isChannelMode && styles.messagePreviewRowChannel,
        !isChannelMode && own && styles.messagePreviewRowOwn,
      ]}
    >
      {isChannelMode || !own ? (
        <AvatarMark
          label={authorLabel}
          imageUrl={message.author.avatarUrl}
          size={isChannelMode ? "large" : "small"}
          status={message.author.status === "ONLINE" ? "active" : "idle"}
        />
      ) : null}
      <View
        style={[
          styles.messagePreviewBubble,
          isChannelMode && styles.messagePreviewBubbleChannel,
          !isChannelMode && own && styles.messagePreviewBubbleOwn,
        ]}
      >
        <View style={[styles.dmMessageHeader, isChannelMode && styles.messagePreviewHeaderChannel]}>
          <Text
            style={[styles.dmMessageAuthor, isChannelMode && styles.messagePreviewAuthorChannel]}
            numberOfLines={1}
          >
            {isChannelMode ? authorLabel : own ? copy.messageYouLabel : authorLabel}
          </Text>
          <Text style={styles.dmMessageTime}>{formatMobileDisplayTime(message.createdAt)}</Text>
        </View>
        <Text
          style={[styles.dmMessageBody, isChannelMode && styles.messagePreviewBodyChannel]}
          numberOfLines={isChannelMode ? undefined : 4}
        >
          {body}
        </Text>
        <MessageAttachmentList attachments={message.attachments} />
        <MessageReactionList reactions={message.reactions} />
      </View>
    </View>
  );
}

export const MemoizedMessagePreviewRow = memo(MessagePreviewRow);
