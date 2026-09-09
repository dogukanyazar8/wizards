"use client";

import React, { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  PROFILE_MEDIA_PREVIEW_COUNT,
  type SharedFileDTO,
  type SharedLinkDTO,
  type SharedMediaItemDTO,
  type SharedMediaKind,
  type SharedMediaPage,
} from "@wizards/types";

import { ProfileFileRow, ProfileLinkRow } from "@/components/messages/profile-file-row";
import {
  ProfileMediaGrid,
  ProfileMediaGridSkeleton,
} from "@/components/messages/profile-media-grid";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { dmSharedMediaQueryKeys, fetchDmSharedItems } from "@/lib/dm/shared-media-client";
import { jumpToMessageInDocument } from "@/lib/messages/jump-to-message";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import type { ProfileTabProps } from "@/components/messages/profile-tab-members";

/**
 * SPEC-MESAJLAR §15.5 — the `Medya` tab. `Mesajlar.dc.html` `L1129–L1187`.
 *
 * Three sections, three queries, one endpoint (`?kind=media|file|link`). The queries are
 * three separate `useInfiniteQuery` calls rather than one chained fetch, so a slow link
 * scan never holds the media grid hostage — kural 7's "her bölüm kendi `Skeleton`'unu
 * gösterir ve sorgular paralel koşar", enforced by construction rather than by care.
 *
 * 1:1 and group use the same endpoint (Ş3 §7): membership is checked inside the service,
 * so `variant` does not reach this file at all.
 */

const { profilePanel } = MESSAGES_METRICS;

const FILE_SKELETON_ROWS = 2;

/**
 * A ceiling on the media grid's self-filling (see `shouldAutoFillMediaGrid`). Five pages
 * of 30 messages is 150 messages deep; past that the grid stops asking and lets the `+N`
 * overlay carry the truth. Without a ceiling a conversation whose visible attachments all
 * sit behind a cleared history floor would page to its own beginning to draw six squares.
 */
export const MEDIA_AUTO_FILL_PAGE_MAX = 5;

export type ProfileTabMediaProps = ProfileTabProps & {
  /** Injected so `Dün 17:04` is decidable in a test. */
  now?: Date | undefined;
  /** Overridable for tests; defaults to the same jump the search panel uses. */
  onOpenMessage?: ((messageId: string) => void) | undefined;
};

export type { ProfileTabProps };

/**
 * Whether the grid should pull another page before it settles.
 *
 * Ş3's report §7.4 is the reason this exists: a page can legitimately come back with zero
 * items and a **non-null** cursor, because the SQL filter is deliberately wider than the
 * extraction and because attachments the viewer may not open are dropped after the page
 * was selected. A grid that treated "short page" as "end of list" would show two tiles and
 * a `+16` overlay on a conversation that has sixteen more, one page down.
 *
 * Pure and exported because an effect is the one thing this harness cannot render.
 */
export function shouldAutoFillMediaGrid(input: {
  hasNextPage: boolean;
  isFetching: boolean;
  loaded: number;
  pagesLoaded: number;
}): boolean {
  return (
    input.hasNextPage &&
    !input.isFetching &&
    input.loaded < PROFILE_MEDIA_PREVIEW_COUNT &&
    input.pagesLoaded < MEDIA_AUTO_FILL_PAGE_MAX
  );
}

function useSharedItems(conversationId: string, kind: SharedMediaKind) {
  return useInfiniteQuery({
    getNextPageParam: (last: SharedMediaPage) => last.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchDmSharedItems(conversationId, kind, ...(pageParam ? ([pageParam] as const) : [])),
    queryKey: [...dmSharedMediaQueryKeys.page(conversationId, kind)],
  });
}

export function ProfileTabMedia({
  conversationId,
  now,
  onOpenMessage,
}: ProfileTabMediaProps): React.JSX.Element {
  const { t } = useI18n();
  const at = now ?? new Date();
  const openMessage = onOpenMessage ?? jumpToMessageInDocument;

  const mediaQuery = useSharedItems(conversationId, "media");
  const fileQuery = useSharedItems(conversationId, "file");
  const linkQuery = useSharedItems(conversationId, "link");

  const mediaPages = mediaQuery.data?.pages ?? [];
  const filePages = fileQuery.data?.pages ?? [];
  const linkPages = linkQuery.data?.pages ?? [];

  const mediaItems = mediaPages.flatMap((page) => page.items as SharedMediaItemDTO[]);
  const fileItems = filePages.flatMap((page) => page.items as SharedFileDTO[]);
  const linkItems = linkPages.flatMap((page) => page.items as SharedLinkDTO[]);

  const mediaTotal = mediaPages[0]?.total ?? 0;

  const fetchNextMedia = mediaQuery.fetchNextPage;
  const autoFill = shouldAutoFillMediaGrid({
    hasNextPage: mediaQuery.hasNextPage,
    isFetching: mediaQuery.isFetching,
    loaded: mediaItems.length,
    pagesLoaded: mediaPages.length,
  });
  useEffect(() => {
    if (autoFill) {
      void fetchNextMedia();
    }
  }, [autoFill, fetchNextMedia]);

  return (
    <>
      <section data-testid="profile-media-section">
        {/*
          The counter waits for the page. Printing `0` beside `PAYLAŞILAN MEDYA` while the
          request is still out states a fact the tab does not have yet, and the number then
          jumps to 18 a moment later.
        */}
        <ProfileSectionLabel {...(mediaQuery.isPending ? {} : { count: String(mediaTotal) })}>
          {t("messages.profile.section.sharedMedia")}
        </ProfileSectionLabel>
        {mediaQuery.isPending ? (
          <ProfileMediaGridSkeleton />
        ) : mediaItems.length === 0 && !mediaQuery.hasNextPage ? (
          <EmptyLine testId="profile-media-empty">{t("messages.profile.empty.media")}</EmptyLine>
        ) : (
          <ProfileMediaGrid
            items={mediaItems}
            now={at}
            onOpen={(item) => openMessage(item.messageId)}
            total={mediaTotal}
          />
        )}
      </section>

      <section data-testid="profile-files-section">
        <ProfileSectionLabel>{t("messages.profile.section.sharedFiles")}</ProfileSectionLabel>
        {fileQuery.isPending ? (
          <RowSkeletons />
        ) : fileItems.length === 0 && !fileQuery.hasNextPage ? (
          <EmptyLine testId="profile-files-empty">{t("messages.profile.empty.files")}</EmptyLine>
        ) : (
          <div
            className="flex flex-col"
            style={{
              gap: pxToRem(profilePanel.fileListGap),
              marginTop: pxToRem(profilePanel.mediaMarginTop),
            }}
          >
            {fileItems.map((item) => (
              <ProfileFileRow
                item={item}
                key={item.attachmentId}
                now={at}
                onOpen={(file) => openMessage(file.messageId)}
              />
            ))}
            {fileQuery.hasNextPage ? (
              <MoreRow
                busy={fileQuery.isFetchingNextPage}
                label={t("messages.friends.action.more")}
                onClick={() => void fileQuery.fetchNextPage()}
                testId="profile-files-more"
              />
            ) : null}
          </div>
        )}
      </section>

      <section data-testid="profile-links-section">
        <ProfileSectionLabel>{t("messages.profile.section.sharedLinks")}</ProfileSectionLabel>
        {linkQuery.isPending ? (
          <RowSkeletons />
        ) : linkItems.length === 0 && !linkQuery.hasNextPage ? (
          <EmptyLine testId="profile-links-empty">{t("messages.profile.empty.links")}</EmptyLine>
        ) : (
          <div
            className="flex flex-col"
            style={{
              gap: pxToRem(profilePanel.fileListGap),
              marginTop: pxToRem(profilePanel.mediaMarginTop),
            }}
          >
            {linkItems.map((item) => (
              <ProfileLinkRow item={item} key={`${item.messageId}:${item.url}`} />
            ))}
            {linkQuery.hasNextPage ? (
              <MoreRow
                busy={linkQuery.isFetchingNextPage}
                label={t("messages.friends.action.more")}
                onClick={() => void linkQuery.fetchNextPage()}
                testId="profile-links-more"
              />
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

/** §10's empty variant: one muted line where the list would be, never a blank section. */
function EmptyLine({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p
      className="text-center text-[hsl(var(--text-muted))]"
      data-testid={testId}
      style={{
        fontSize: pxToRem(profilePanel.fileMetaFontSize),
        marginTop: pxToRem(profilePanel.mediaMarginTop),
      }}
    >
      {children}
    </p>
  );
}

function RowSkeletons() {
  return (
    <div
      className="flex flex-col"
      data-testid="profile-file-skeleton"
      style={{
        gap: pxToRem(profilePanel.fileListGap),
        marginTop: pxToRem(profilePanel.mediaMarginTop),
      }}
    >
      {Array.from({ length: FILE_SKELETON_ROWS }, (_unused, index) => (
        <Skeleton
          key={index}
          style={{
            borderRadius: pxToRem(profilePanel.fileRowRadius),
            height: pxToRem(profilePanel.memberAddButtonHeight),
          }}
        />
      ))}
    </div>
  );
}

function MoreRow({
  busy,
  label,
  onClick,
  testId,
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="text-[hsl(var(--primary))] outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
      data-testid={testId}
      disabled={busy}
      onClick={onClick}
      style={{
        borderRadius: pxToRem(profilePanel.fileRowRadius),
        fontSize: pxToRem(profilePanel.fileNameFontSize),
        fontWeight: 600,
        height: pxToRem(profilePanel.memberAddButtonHeight),
      }}
      type="button"
    >
      {label}
    </button>
  );
}
