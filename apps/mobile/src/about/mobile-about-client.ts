import {
  MobileAppChannelResponseSchema,
  MobileAppUpdateResponseSchema,
  MobileBugReportResponseSchema,
  MobileHelpArticleListResponseSchema,
  MobileHelpArticleViewResponseSchema,
  MobileReleaseDetailSchema,
  MobileReleaseListResponseSchema,
  MobileServiceStatusResponseSchema,
  MOBILE_RELEASE_PAGE_SIZE,
  type MobileAppChannelRequest,
  type MobileAppChannelResponse,
  type MobileAppUpdateResponse,
  type MobileBugReportRequest,
  type MobileBugReportResponse,
  type MobileHelpArticleListResponse,
  type MobileHelpCategory,
  type MobileReleaseChannel,
  type MobileReleaseDetail,
  type MobileReleaseListResponse,
  type MobileServiceStatusResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

const ABOUT_API_ROOT = "/api/v1/mobile";

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export interface MobileReleaseListParams {
  readonly cursor?: string | undefined;
  /** The version this build runs, so the server can mark its own row `installed`. */
  readonly installed?: string | undefined;
  readonly limit?: number | undefined;
}

export function buildMobileReleaseListPath(params: MobileReleaseListParams = {}): string {
  return withQuery(`${ABOUT_API_ROOT}/app/releases`, {
    cursor: params.cursor,
    installed: params.installed,
    limit: params.limit ?? MOBILE_RELEASE_PAGE_SIZE,
  });
}

export function buildMobileReleaseDetailPath(version: string): string {
  return `${ABOUT_API_ROOT}/app/releases/${encodeURIComponent(version)}`;
}

export interface MobileAppUpdateParams {
  readonly channel?: MobileReleaseChannel | undefined;
  readonly installed?: string | undefined;
}

export function buildMobileAppUpdatePath(params: MobileAppUpdateParams = {}): string {
  return withQuery(`${ABOUT_API_ROOT}/app/update`, {
    channel: params.channel,
    installed: params.installed,
  });
}

export function buildMobileAppChannelPath(): string {
  return `${ABOUT_API_ROOT}/app/channel`;
}

export function buildMobileServiceStatusPath(): string {
  return `${ABOUT_API_ROOT}/app/status`;
}

export interface MobileHelpArticleListParams {
  readonly category?: MobileHelpCategory | undefined;
  /** 2e's "EN ÇOK OKUNANLAR" list rather than a category page. */
  readonly popular?: boolean | undefined;
}

export function buildMobileHelpArticleListPath(params: MobileHelpArticleListParams = {}): string {
  return withQuery(`${ABOUT_API_ROOT}/help/articles`, {
    category: params.category,
    popular: params.popular === undefined ? undefined : params.popular ? "1" : "0",
  });
}

export function buildMobileHelpSearchPath(query: string): string {
  return withQuery(`${ABOUT_API_ROOT}/help/search`, { q: query.trim() });
}

export function buildMobileHelpArticleViewPath(slug: string): string {
  return `${ABOUT_API_ROOT}/help/articles/${encodeURIComponent(slug)}/view`;
}

export function buildMobileBugReportPath(): string {
  return `${ABOUT_API_ROOT}/support/report`;
}

export async function fetchMobileReleaseList(
  client: MobileApiClient,
  params: MobileReleaseListParams = {},
): Promise<MobileReleaseListResponse> {
  const payload = await client.requestJson<unknown>(buildMobileReleaseListPath(params), {
    method: "GET",
  });

  return MobileReleaseListResponseSchema.parse(payload);
}

export async function fetchMobileReleaseDetail(
  client: MobileApiClient,
  version: string,
): Promise<MobileReleaseDetail> {
  const payload = await client.requestJson<unknown>(buildMobileReleaseDetailPath(version), {
    method: "GET",
  });

  return MobileReleaseDetailSchema.parse(payload);
}

export async function fetchMobileAppUpdate(
  client: MobileApiClient,
  params: MobileAppUpdateParams = {},
): Promise<MobileAppUpdateResponse> {
  const payload = await client.requestJson<unknown>(buildMobileAppUpdatePath(params), {
    method: "GET",
  });

  return MobileAppUpdateResponseSchema.parse(payload);
}

export async function saveMobileAppChannel(
  client: MobileApiClient,
  body: MobileAppChannelRequest,
): Promise<MobileAppChannelResponse> {
  const payload = await client.requestJson<unknown>(buildMobileAppChannelPath(), {
    body,
    method: "POST",
  });

  return MobileAppChannelResponseSchema.parse(payload);
}

export async function fetchMobileServiceStatus(
  client: MobileApiClient,
): Promise<MobileServiceStatusResponse> {
  const payload = await client.requestJson<unknown>(buildMobileServiceStatusPath(), {
    method: "GET",
  });

  return MobileServiceStatusResponseSchema.parse(payload);
}

export async function fetchMobileHelpArticles(
  client: MobileApiClient,
  params: MobileHelpArticleListParams = {},
): Promise<MobileHelpArticleListResponse> {
  const payload = await client.requestJson<unknown>(buildMobileHelpArticleListPath(params), {
    method: "GET",
  });

  return MobileHelpArticleListResponseSchema.parse(payload);
}

export async function searchMobileHelpArticles(
  client: MobileApiClient,
  query: string,
): Promise<MobileHelpArticleListResponse> {
  const payload = await client.requestJson<unknown>(buildMobileHelpSearchPath(query), {
    method: "GET",
  });

  return MobileHelpArticleListResponseSchema.parse(payload);
}

/**
 * The view counter is bodyless on purpose — it is registered as such in the web
 * `route-contract.test.ts`, so sending a body here would be rejected.
 */
export async function recordMobileHelpArticleView(
  client: MobileApiClient,
  slug: string,
): Promise<void> {
  const payload = await client.requestJson<unknown>(buildMobileHelpArticleViewPath(slug), {
    method: "POST",
  });

  MobileHelpArticleViewResponseSchema.parse(payload);
}

export async function submitMobileBugReport(
  client: MobileApiClient,
  body: MobileBugReportRequest,
): Promise<MobileBugReportResponse> {
  const payload = await client.requestJson<unknown>(buildMobileBugReportPath(), {
    body,
    method: "POST",
  });

  return MobileBugReportResponseSchema.parse(payload);
}
