"use client";

/* eslint-disable @next/next/no-img-element */

import React from "react";
import { ImageIcon, Play } from "lucide-react";
import { PROFILE_MEDIA_PREVIEW_COUNT, type SharedMediaItemDTO } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { formatSharedTimestamp } from "@/components/messages/profile-file-row";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { getSharedMediaOverlayCount } from "@/lib/dm/shared-media-client";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * SPEC-MESAJLAR §15.5 — `PAYLAŞILAN MEDYA`. Three columns, square tiles, `+N` on the
 * last one. `Mesajlar.dc.html` `L1130–L1145`.
 *
 * The grid is a **preview**, not a gallery: it never draws more than
 * `PROFILE_MEDIA_PREVIEW_COUNT` tiles no matter how large a page the endpoint returned.
 * Everything past that is the business of the `+N` overlay, and the overlay's number comes
 * from `total` — the endpoint's real count — through Ş3's `getSharedMediaOverlayCount`.
 * Deriving it from the loaded page is the exact bug K11 removed: a conversation with a
 * hundred images used to print `+0` because the cache happened to hold six.
 *
 * No virtualisation, no `IntersectionObserver`: six tiles is six tiles. `loading="lazy"`
 * is still set, because the panel can be opened on a conversation whose thumbnails are
 * cold and the six requests should not race the member list.
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfileMediaGridProps = {
  items: readonly SharedMediaItemDTO[];
  /** Injected so the tile's accessible name is decidable in a test. */
  now?: Date | undefined;
  onOpen: (item: SharedMediaItemDTO) => void;
  /** `SharedMediaPage.total` — never `items.length`. */
  total: number;
};

/**
 * Which tiles to draw, and how many the overlay must account for.
 *
 * Pure, and separated from the component because the honest `+N` is the one thing on this
 * surface that is easy to get quietly wrong. `previewCount` is passed as the number of
 * tiles actually drawn rather than left at its default: a page that came back short (Ş3:
 * an attachment the viewer may not open is dropped from the page **and** the total) would
 * otherwise draw two tiles and promise `+12` when it owes `+16`.
 */
export function selectMediaPreview(
  items: readonly SharedMediaItemDTO[],
  total: number,
): { overlayCount: number; tiles: readonly SharedMediaItemDTO[] } {
  const tiles = items.slice(0, PROFILE_MEDIA_PREVIEW_COUNT);

  return { overlayCount: getSharedMediaOverlayCount(total, tiles.length), tiles };
}

export function ProfileMediaGrid({ items, now, onOpen, total }: ProfileMediaGridProps) {
  const { locale, t } = useI18n();
  const { overlayCount, tiles } = selectMediaPreview(items, total);
  const at = now ?? new Date();

  return (
    <div
      className="grid"
      data-testid="profile-media-grid"
      style={{
        gap: pxToRem(profilePanel.mediaGap),
        gridTemplateColumns: `repeat(${profilePanel.mediaColumns}, minmax(0, 1fr))`,
        marginTop: pxToRem(profilePanel.mediaMarginTop),
      }}
    >
      {tiles.map((item, index) => {
        const isVideo = item.kind === "video";
        const preview = item.thumbnailUrl ?? (isVideo ? null : item.url);
        const when = formatSharedTimestamp(item.createdAt, at, locale, {
          today: t("chat.date.today"),
          yesterday: t("chat.date.yesterday"),
        });
        const kindLabel = t(isVideo ? "chat.attachments.video" : "chat.attachments.image");
        // The overlay rides the **last drawn** tile, which is the sixth whenever six
        // exist — `mediaOverlayIndex` in the sheet. Pinning it to index 6 unconditionally
        // would hide the count on any conversation with fewer than six visible items.
        const carriesOverlay = overlayCount > 0 && index === tiles.length - 1;

        return (
          <button
            aria-label={when ? `${kindLabel} · ${when}` : kindLabel}
            className="relative grid aspect-square place-items-center overflow-hidden border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-tertiary)/0.7)] text-[hsl(var(--text-muted))] outline-hidden transition-colors hover:border-[hsl(var(--primary)/0.45)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="profile-media-tile"
            key={item.attachmentId}
            onClick={() => onOpen(item)}
            style={{
              borderRadius: pxToRem(profilePanel.mediaTileRadius),
              borderWidth: hairline(),
            }}
            type="button"
          >
            {preview ? (
              <img
                // The button already carries the accessible name; a second one here would
                // make the screen reader read the tile twice.
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                src={preview}
              />
            ) : (
              <ImageIcon
                aria-hidden="true"
                style={{
                  height: pxToRem(profilePanel.mediaTileIconSize),
                  width: pxToRem(profilePanel.mediaTileIconSize),
                }}
              />
            )}

            {/*
              A video badge, not a duration badge: `SharedMediaItemDTO` carries no
              duration (Ş3 opened no such field), and a fabricated `0:00` would be a
              number the product does not know.
            */}
            {isVideo ? (
              <span
                aria-hidden="true"
                className="absolute grid place-items-center bg-[hsl(var(--backdrop)/0.55)] text-white"
                data-testid="profile-media-tile-video"
                style={{
                  borderRadius: pxToRem(profilePanel.mediaTileRadius),
                  bottom: pxToRem(profilePanel.mediaGap),
                  height: pxToRem(profilePanel.mediaTileIconSize),
                  left: pxToRem(profilePanel.mediaGap),
                  width: pxToRem(profilePanel.mediaTileIconSize),
                }}
              >
                <Play
                  style={{
                    height: pxToRem(profilePanel.mediaOverlayFontSize),
                    width: pxToRem(profilePanel.mediaOverlayFontSize),
                  }}
                />
              </span>
            ) : null}

            {carriesOverlay ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 grid place-items-center bg-[hsl(var(--backdrop)/0.55)] text-white",
                  DISPLAY_FONT,
                )}
                data-testid="profile-media-overflow"
                style={{
                  fontSize: pxToRem(profilePanel.mediaOverlayFontSize),
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {t("messages.profile.media.overflow", { count: overlayCount })}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Six placeholder tiles, so the section reserves its height before the page lands and the
 * two sections under it do not jump when it does (kural 7 — every section skeletons
 * itself, none of them waits for a sibling).
 */
export function ProfileMediaGridSkeleton() {
  return (
    <div
      className="grid"
      data-testid="profile-media-grid-skeleton"
      style={{
        gap: pxToRem(profilePanel.mediaGap),
        gridTemplateColumns: `repeat(${profilePanel.mediaColumns}, minmax(0, 1fr))`,
        marginTop: pxToRem(profilePanel.mediaMarginTop),
      }}
    >
      {Array.from({ length: PROFILE_MEDIA_PREVIEW_COUNT }, (_unused, index) => (
        <Skeleton
          className="aspect-square w-full"
          key={index}
          style={{ borderRadius: pxToRem(profilePanel.mediaTileRadius) }}
        />
      ))}
    </div>
  );
}
