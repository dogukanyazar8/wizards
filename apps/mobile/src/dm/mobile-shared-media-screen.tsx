import { memo, useCallback, useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import type { MobileDMAttachmentItem, MobileDMAttachmentsTab } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Button, EmptyState, Icon, Skeleton } from "../app/components/kit";
import { MobileCachedImage } from "../app/components/mobile-cached-image";
import { MessageImageLightbox } from "../app/components/message-image-lightbox";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { getMobileIntlLocale, type MobileLocale } from "../locale/mobile-locale-preferences";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileDMAttachments } from "./mobile-dm-attachments-client";
import {
  buildMobileSharedMediaRows,
  collectMobileSharedMediaViewerSources,
  formatMobileSharedMediaSize,
  getMobileSharedMediaLinkHost,
  type MobileSharedMediaCell,
  type MobileSharedMediaFileItem,
  type MobileSharedMediaLinkItem,
  type MobileSharedMediaRow,
} from "./mobile-shared-media-model";
import { createMobileSharedMediaStyles } from "./mobile-shared-media-screen.styles";

type Styles = ReturnType<typeof createMobileSharedMediaStyles>;
type Copy = (typeof mobileCopy)[MobileLocale];

const TABS: readonly MobileDMAttachmentsTab[] = ["media", "files", "links"];
const PAGE_LIMIT = 30;
/** One skeleton screen's worth of tiles, sized like the real grid. */
const SKELETON_ROWS = [0, 1, 2];

export interface MobileSharedMediaScreenProps {
  readonly conversationId: string;
  /** Display name of the other participant, resolved by the container. */
  readonly participantName: string | null;
  onBack(): void;
}

function getTabLabel(tab: MobileDMAttachmentsTab, copy: Copy): string {
  switch (tab) {
    case "files":
      return copy.sharedMediaTabFiles;
    case "links":
      return copy.sharedMediaTabLinks;
    default:
      return copy.sharedMediaTabMedia;
  }
}

function getEmptyDescription(tab: MobileDMAttachmentsTab, copy: Copy): string {
  switch (tab) {
    case "files":
      return copy.sharedMediaEmptyFiles;
    case "links":
      return copy.sharedMediaEmptyLinks;
    default:
      return copy.sharedMediaEmptyMedia;
  }
}

/**
 * Cells are memoised because a media page is chunked into rows: without this,
 * appending a page re-renders every tile above it and the grid drops frames
 * mid-scroll. `MobileCachedImage` keeps the bytes, this keeps the elements.
 */
const SharedMediaTile = memo(function SharedMediaTile({
  cell,
  copy,
  onOpen,
  styles,
}: {
  readonly cell: MobileSharedMediaCell;
  readonly copy: Copy;
  readonly onOpen: (attachmentId: string) => void;
  readonly styles: Styles;
}) {
  const accessibilityLabel = cell.durationLabel
    ? copy.sharedMediaVideoLabelTemplate.replace("{duration}", cell.durationLabel)
    : copy.sharedMediaOpenMediaAction;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={() => onOpen(cell.item.attachment.id)}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      testID={`mobile-shared-media-tile-${cell.id}`}
    >
      {cell.uri ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
          source={{ uri: cell.uri }}
          style={styles.tileImage}
          testID={`mobile-shared-media-thumbnail-${cell.id}`}
        />
      ) : null}
      {/* A video reads as a video whether or not it produced a poster frame. */}
      {cell.isVideo || !cell.uri ? (
        <Icon
          name={cell.isVideo ? "play-circle" : "image-outline"}
          size={cell.uri ? 30 : 24}
          tone={cell.uri ? "inverse" : "accent"}
        />
      ) : null}
      {cell.durationLabel ? (
        <View style={styles.durationBadge} testID={`mobile-shared-media-duration-${cell.id}`}>
          <Text maxFontSizeMultiplier={2} style={styles.durationLabel}>
            {cell.durationLabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const SharedMediaFileRow = memo(function SharedMediaFileRow({
  copy,
  item,
  styles,
}: {
  readonly copy: Copy;
  readonly item: MobileSharedMediaFileItem;
  readonly styles: Styles;
}) {
  const theme = useTheme();
  const { attachment } = item;
  const url = attachment.url;

  return (
    <Pressable
      accessibilityLabel={`${copy.sharedMediaOpenFileAction}: ${attachment.filename}`}
      accessibilityRole="link"
      accessibilityState={{ disabled: !url }}
      disabled={!url}
      onPress={() => {
        if (url) {
          void Linking.openURL(url).catch(() => undefined);
        }
      }}
      style={({ pressed }) => [styles.row, pressed && styles.tilePressed]}
      testID={`mobile-shared-media-file-${attachment.id}`}
    >
      <View style={styles.rowIcon}>
        <MobileLineIcon color={theme.accent.strong} name="file" size={18} strokeWidth={1.9} />
      </View>
      <View style={styles.rowBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.rowTitle}>
          {attachment.filename}
        </Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.rowMeta}>
          {url ? formatMobileSharedMediaSize(attachment.size) : copy.sharedMediaFileUnavailable}
        </Text>
      </View>
      <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={16} />
    </Pressable>
  );
});

const SharedMediaLinkRow = memo(function SharedMediaLinkRow({
  copy,
  dateLabel,
  item,
  styles,
}: {
  readonly copy: Copy;
  readonly dateLabel: string;
  readonly item: MobileSharedMediaLinkItem;
  readonly styles: Styles;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={`${copy.sharedMediaOpenLinkAction}: ${item.url}`}
      accessibilityRole="link"
      onPress={() => void Linking.openURL(item.url).catch(() => undefined)}
      style={({ pressed }) => [styles.row, pressed && styles.tilePressed]}
      testID={`mobile-shared-media-link-${item.id}`}
    >
      <View style={styles.rowIcon}>
        <MobileLineIcon
          color={theme.accent.strong}
          name="external-link"
          size={18}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.rowBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.rowTitle}>
          {getMobileSharedMediaLinkHost(item.url)}
        </Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.rowMeta}>
          {item.url}
        </Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.rowMeta}>
          {dateLabel}
        </Text>
      </View>
    </Pressable>
  );
});

export function MobileSharedMediaScreen({
  conversationId,
  onBack,
  participantName,
}: MobileSharedMediaScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileSharedMediaStyles);
  const [tab, setTab] = useState<MobileDMAttachmentsTab>("media");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const intlLocale = getMobileIntlLocale(locale);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }),
    [intlLocale],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", year: "numeric" }),
    [intlLocale],
  );

  // Each tab keeps its own page stack and cache entry, so switching back to a
  // scrolled tab does not refetch what it already holds.
  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: { nextCursor: string | null }) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMobileDMAttachments(apiClient, conversationId, {
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: PAGE_LIMIT,
        tab,
      }),
    queryKey: mobileQueryKeys.dmAttachments(conversationId, tab),
    staleTime: 60_000,
  });

  const items = useMemo<MobileDMAttachmentItem[]>(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data?.pages],
  );
  const rows = useMemo(
    () =>
      buildMobileSharedMediaRows(items, tab, {
        formatMonthLabel: (value) =>
          monthFormatter.format(new Date(value)).toLocaleUpperCase(intlLocale),
      }),
    [intlLocale, items, monthFormatter, tab],
  );
  const viewerSources = useMemo(() => collectMobileSharedMediaViewerSources(items), [items]);

  const openLightbox = useCallback(
    (attachmentId: string) => {
      const index = viewerSources.findIndex((source) => source.id === attachmentId);
      setLightboxIndex(index === -1 ? null : index);
    },
    [viewerSources],
  );
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderRow = useCallback(
    ({ index, item }: { readonly index: number; readonly item: MobileSharedMediaRow }) => {
      if (item.kind === "month") {
        return (
          <Text
            maxFontSizeMultiplier={2}
            style={[styles.monthLabel, index > 0 && styles.monthLabelSubsequent]}
            testID={`mobile-shared-media-month-${item.id}`}
          >
            {item.label}
          </Text>
        );
      }

      if (item.kind === "grid") {
        return (
          <View
            style={[styles.gridRow, rows[index - 1]?.kind === "month" && styles.gridRowFirst]}
            testID={`mobile-shared-media-grid-${item.id}`}
          >
            {item.cells.map((cell) => (
              <SharedMediaTile
                cell={cell}
                copy={copy}
                key={cell.id}
                onOpen={openLightbox}
                styles={styles}
              />
            ))}
            {Array.from({ length: 3 - item.cells.length }, (_value, spacerIndex) => (
              <View key={`spacer-${spacerIndex}`} style={styles.tileSpacer} />
            ))}
          </View>
        );
      }

      if (item.kind === "file") {
        return <SharedMediaFileRow copy={copy} item={item.item} styles={styles} />;
      }

      return (
        <SharedMediaLinkRow
          copy={copy}
          dateLabel={dateFormatter.format(new Date(item.item.messageCreatedAt))}
          item={item.item}
          styles={styles}
        />
      );
    },
    [copy, dateFormatter, openLightbox, rows, styles],
  );

  const headerNode = (
    <>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.dmDetailsBack}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.backButton}
          testID="mobile-shared-media-back"
        >
          <MobileLineIcon
            color={theme.text.primary}
            name="back-arrow"
            size={17}
            strokeWidth={2.1}
          />
        </Pressable>
        <View style={styles.headerBody}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={2}
            numberOfLines={1}
            style={styles.title}
          >
            {copy.sharedMediaTitle}
          </Text>
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.subtitle}>
            {/*
              The count is what the list currently holds, not a server total: a
              per-tab COUNT on every page would cost a second query, and the
              links tab has nothing to count without scanning message bodies.
            */}
            {participantName
              ? copy.sharedMediaSubtitleTemplate
                  .replace("{name}", participantName)
                  .replace("{count}", String(items.length))
              : copy.sharedMediaSubtitleCountTemplate.replace("{count}", String(items.length))}
          </Text>
        </View>
      </View>
      <View style={styles.tabRow} testID="mobile-shared-media-tabs">
        {TABS.map((candidate) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: candidate === tab }}
            hitSlop={6}
            key={candidate}
            onPress={() => setTab(candidate)}
            style={[styles.tab, candidate === tab && styles.tabActive]}
            testID={`mobile-shared-media-tab-${candidate}`}
          >
            <Text
              maxFontSizeMultiplier={2}
              style={[styles.tabLabel, candidate === tab && styles.tabLabelActive]}
            >
              {getTabLabel(candidate, copy)}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.root} testID="mobile-shared-media-screen">
      {headerNode}
      {query.isLoading ? (
        <View testID="mobile-shared-media-loading">
          <Skeleton height={13} style={styles.skeletonMonth} width="38%" />
          {SKELETON_ROWS.map((row) => (
            <View key={row} style={styles.skeletonRow}>
              {SKELETON_ROWS.map((column) => (
                <Skeleton
                  borderRadius={14}
                  height={112}
                  key={column}
                  style={styles.skeletonTile}
                  width="100%"
                />
              ))}
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <View style={styles.stateActions} testID="mobile-shared-media-error">
          <Text accessibilityRole="alert" style={styles.error}>
            {copy.sharedMediaLoadFailed}
          </Text>
          <Button label={copy.sharedMediaRetryAction} onPress={() => void query.refetch()} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          description={getEmptyDescription(tab, copy)}
          icon="images-outline"
          style={styles.state}
          testID="mobile-shared-media-empty"
          title={copy.sharedMediaTitle}
        />
      ) : (
        <FlashList
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(row) => row.id}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View style={styles.footer} testID="mobile-shared-media-loading-more">
                <ActivityIndicator color={theme.accent.default} />
                <Text maxFontSizeMultiplier={2} style={styles.footerLabel}>
                  {copy.sharedMediaLoadingMoreLabel}
                </Text>
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={renderRow}
          testID="mobile-shared-media-list"
        />
      )}
      {query.isFetchNextPageError ? (
        <View style={styles.stateActions}>
          <Text
            accessibilityRole="alert"
            style={styles.error}
            testID="mobile-shared-media-load-more-error"
          >
            {copy.sharedMediaLoadMoreFailed}
          </Text>
          <Button
            label={copy.sharedMediaRetryAction}
            onPress={() => void fetchNextPage()}
            variant="secondary"
          />
        </View>
      ) : null}
      <MessageImageLightbox
        onClose={closeLightbox}
        open={lightboxIndex !== null}
        {...(lightboxIndex !== null && viewerSources[lightboxIndex]
          ? {
              timeLabel: dateFormatter.format(
                new Date(viewerSources[lightboxIndex]!.createdAt),
              ),
            }
          : {})}
        uri={lightboxIndex === null ? null : (viewerSources[lightboxIndex]?.uri ?? null)}
      />
    </View>
  );
}
