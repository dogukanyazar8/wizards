import { useEffect, useState } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  MOBILE_HELP_SEARCH_MIN_LENGTH,
  MOBILE_RELEASE_PAGE_SIZE,
  type MobileHelpCategory,
  type MobileReleaseChannel,
  type MobileReleaseListResponse,
  type MobileReleaseSummary,
} from "@wizards/types";
import type { InfiniteData } from "@tanstack/react-query";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { getBundledMobileRelease } from "./mobile-about-bundled-release";
import {
  fetchMobileAppUpdate,
  fetchMobileHelpArticles,
  fetchMobileReleaseDetail,
  fetchMobileReleaseList,
  fetchMobileServiceStatus,
  searchMobileHelpArticles,
  type MobileAppUpdateParams,
  type MobileHelpArticleListParams,
} from "./mobile-about-client";

/** §4.9: the 1b service row is live, so a minute-old answer is refreshed behind it. */
export const MOBILE_ABOUT_STATUS_STALE_TIME_MS = 60_000;
/** §4.14/§4.17: one request per pause in typing, not one per keystroke. */
export const MOBILE_ABOUT_SEARCH_DEBOUNCE_MS = 300;
export const MOBILE_HELP_SEARCH_DEBOUNCE_MS = MOBILE_ABOUT_SEARCH_DEBOUNCE_MS;

export function getMobileAboutUpdateQueryOptions(
  client: MobileApiClient,
  params: MobileAppUpdateParams = {},
  enabled = true,
) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileAppUpdate(client, params),
    queryKey: mobileQueryKeys.aboutUpdate(),
  });
}

export function useMobileAboutUpdateQuery(
  client: MobileApiClient,
  params: MobileAppUpdateParams = {},
  enabled = true,
) {
  return useQuery(getMobileAboutUpdateQueryOptions(client, params, enabled));
}

export function getMobileAboutStatusQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileServiceStatus(client),
    queryKey: mobileQueryKeys.aboutStatus(),
    staleTime: MOBILE_ABOUT_STATUS_STALE_TIME_MS,
  });
}

export function useMobileAboutStatusQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileAboutStatusQueryOptions(client, enabled));
}

export function getMobileAboutReleasesQueryOptions(
  client: MobileApiClient,
  installedVersion?: string,
  enabled = true,
  limit = MOBILE_RELEASE_PAGE_SIZE,
) {
  return infiniteQueryOptions({
    enabled,
    getNextPageParam: (page: MobileReleaseListResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMobileReleaseList(client, {
        ...(pageParam === null ? {} : { cursor: pageParam }),
        ...(installedVersion === undefined ? {} : { installed: installedVersion }),
        limit,
      }),
    queryKey: [
      ...mobileQueryKeys.aboutReleases(),
      { installedVersion: installedVersion ?? null, limit },
    ] as const,
  });
}

export function useMobileAboutReleasesQuery(
  client: MobileApiClient,
  installedVersion?: string,
  enabled = true,
  limit = MOBILE_RELEASE_PAGE_SIZE,
) {
  return useInfiniteQuery(
    getMobileAboutReleasesQueryOptions(client, installedVersion, enabled, limit),
  );
}

/**
 * 2b pages twenty at a time and every page can restate a row the previous one
 * already carried, so versions are de-duplicated on the way out.
 */
export function flattenMobileReleasePages(
  data: InfiniteData<MobileReleaseListResponse, unknown> | undefined,
): readonly MobileReleaseSummary[] {
  const releases = new Map<string, MobileReleaseSummary>();

  for (const page of data?.pages ?? []) {
    for (const release of page.releases) {
      if (!releases.has(release.version)) {
        releases.set(release.version, release);
      }
    }
  }

  return [...releases.values()];
}

export function getMobileReleaseTotal(
  data: InfiniteData<MobileReleaseListResponse, unknown> | undefined,
): number {
  return data?.pages[0]?.total ?? 0;
}

export function getMobileAboutReleaseQueryOptions(
  client: MobileApiClient,
  version: string,
  enabled = true,
) {
  return queryOptions({
    enabled: enabled && version.length > 0,
    initialData: getBundledMobileRelease(version),
    // The bundled note keeps About usable offline, but release management owns
    // the live content. Mark the fallback stale so it is replaced on open.
    initialDataUpdatedAt: 0,
    queryFn: () => fetchMobileReleaseDetail(client, version),
    queryKey: mobileQueryKeys.aboutRelease(version),
    staleTime: 0,
  });
}

export function useMobileAboutReleaseQuery(
  client: MobileApiClient,
  version: string,
  enabled = true,
) {
  return useQuery(getMobileAboutReleaseQueryOptions(client, version, enabled));
}

export function getMobileHelpArticlesQueryOptions(
  client: MobileApiClient,
  params: MobileHelpArticleListParams = {},
  enabled = true,
) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileHelpArticles(client, params),
    queryKey: mobileQueryKeys.helpArticles({
      ...(params.category === undefined ? {} : { category: params.category }),
      ...(params.popular === undefined ? {} : { popular: params.popular }),
    }),
  });
}

export function useMobileHelpArticlesQuery(
  client: MobileApiClient,
  params: MobileHelpArticleListParams = {},
  enabled = true,
) {
  return useQuery(getMobileHelpArticlesQueryOptions(client, params, enabled));
}

/**
 * The debounce lives here rather than on 2e: the screen's job is to hold the
 * text, and a second search surface (2b's version search) would otherwise have
 * to re-implement the same delay and drift from it.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

export function getMobileHelpSearchQueryOptions(
  client: MobileApiClient,
  query: string,
  enabled = true,
) {
  const trimmed = query.trim();

  return queryOptions({
    // The endpoint answers 400 below two characters, so the query does not run
    // at all until the text is long enough to be a search.
    enabled: enabled && trimmed.length >= MOBILE_HELP_SEARCH_MIN_LENGTH,
    queryFn: () => searchMobileHelpArticles(client, trimmed),
    queryKey: mobileQueryKeys.helpSearch(trimmed),
  });
}

export type { MobileHelpCategory, MobileReleaseChannel };
