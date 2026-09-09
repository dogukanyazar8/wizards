"use client";

import {
  PROFILE_MEDIA_PREVIEW_COUNT,
  SharedMediaPageSchema,
  type SharedFileDTO,
  type SharedLinkDTO,
  type SharedMediaItemDTO,
  type SharedMediaKind,
  type SharedMediaPage,
} from "@wizards/types";
import { DMClientError } from "@/lib/dm/client";

/**
 * The browser half of §15.5's Medya tab.
 *
 * It lives beside `client.ts` rather than inside it because the profile panel's
 * four API stripes were written in parallel; one file per stripe is what kept
 * them from editing the same lines.
 */

export const dmSharedMediaQueryKeys = {
  /** Everything the media tab holds for one conversation — invalidated on leave/clear. */
  conversation: (conversationId: string) => ["dm", "shared-media", conversationId] as const,
  page: (conversationId: string, kind: SharedMediaKind) =>
    ["dm", "shared-media", conversationId, kind] as const,
  root: ["dm", "shared-media"] as const,
};

export async function fetchDmSharedItems(
  conversationId: string,
  kind: SharedMediaKind,
  cursor?: string,
): Promise<SharedMediaPage> {
  const search = new URLSearchParams({ kind });

  if (cursor) {
    search.set("cursor", cursor);
  }

  const response = await fetch(
    `/api/v1/dm/${encodeURIComponent(conversationId)}/attachments?${search.toString()}`,
  );
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new DMClientError(payload?.error ?? "Request failed", response.status, payload?.code);
  }

  return SharedMediaPageSchema.parse(payload);
}

/**
 * §15.5's `+12` overlay.
 *
 * It is computed from the endpoint's `total`, never from the loaded page: the
 * grid draws six tiles no matter how many the page carried, and a page-derived
 * figure would print `+0` on a conversation with a hundred images. That was the
 * exact failure of the React Query derivation K11 removed.
 */
export function getSharedMediaOverlayCount(
  total: number,
  previewCount: number = PROFILE_MEDIA_PREVIEW_COUNT,
): number {
  return Math.max(0, total - previewCount);
}

/**
 * `1,2 MB` — §15.5's file row. The service ships raw bytes; the decimal
 * separator is a locale decision and only the browser knows the locale.
 */
export function formatSharedFileSize(sizeBytes: number, locale: string): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "";
  }

  if (sizeBytes < 1024) {
    return `${format(sizeBytes, locale, 0)} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${format(sizeBytes / 1024, locale, 0)} KB`;
  }

  return `${format(sizeBytes / (1024 * 1024), locale, 1)} MB`;
}

function format(value: number, locale: string, fractionDigits: number): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

export type { SharedFileDTO, SharedLinkDTO, SharedMediaItemDTO, SharedMediaPage };
