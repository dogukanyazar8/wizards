import { parsePublishedReleaseChannel } from "@/lib/build-release-channel";
import { prisma, type Prisma, type ReleaseChangeType, type ReleaseChannel } from "@wizards/db";
import {
  MOBILE_RELEASE_PAGE_MAX_SIZE,
  MOBILE_RELEASE_PAGE_SIZE,
  MobileAppUpdateLatestSchema,
  MobileReleaseDetailSchema,
  MobileReleaseListResponseSchema,
  type MobileAppUpdateLatest,
  type MobileReleaseChange,
  type MobileReleaseChannel,
  type MobileReleaseDetail,
  type MobileReleaseListResponse,
} from "@wizards/types";

/**
 * Everything 1c, 2a and 2b read.
 *
 * One rule runs through all of it: `publishedAt = NULL` is a draft and never
 * leaves this file. The filter lives in the query rather than in a `.filter()`
 * after it, so a future caller cannot forget it and leak an unannounced version
 * into the history list.
 */

const releaseSummarySelect = {
  _count: { select: { changes: true } },
  codename: true,
  highlight: true,
  id: true,
  releasedAt: true,
  version: true,
} satisfies Prisma.ReleaseSelect;

const releaseDetailSelect = {
  ...releaseSummarySelect,
  buildNumber: true,
  changes: { select: { detail: true, position: true, title: true, type: true } },
  mandatory: true,
  sizeBytes: true,
  summary: true,
} satisfies Prisma.ReleaseSelect;

type ReleaseSummaryRow = Prisma.ReleaseGetPayload<{ select: typeof releaseSummarySelect }>;
type ReleaseDetailRow = Prisma.ReleaseGetPayload<{ select: typeof releaseDetailSelect }>;

/** 2a prints the groups in this order, and an empty group is not rendered. */
const RELEASE_CHANGE_TYPE_ORDER: Record<ReleaseChangeType, number> = {
  NEW: 0,
  IMPROVED: 1,
  FIXED: 2,
};

const RELEASE_CHANGE_TYPE_TO_WIRE: Record<ReleaseChangeType, MobileReleaseChange["type"]> = {
  NEW: "new",
  IMPROVED: "improved",
  FIXED: "fixed",
};

const RELEASE_CHANNEL_FROM_WIRE: Record<MobileReleaseChannel, ReleaseChannel> = {
  stable: "STABLE",
  beta: "UAT",
};

export function toReleaseChannelColumn(channel: MobileReleaseChannel): ReleaseChannel {
  return RELEASE_CHANNEL_FROM_WIRE[channel];
}

/**
 * Sorts by group first and by the author's chosen order inside it. Exported
 * because the ordering, not the query, is what 2a depends on: the screen renders
 * whatever sequence arrives.
 */
export function sortMobileReleaseChanges<
  TChange extends { position: number; type: ReleaseChangeType },
>(changes: readonly TChange[]): TChange[] {
  return [...changes].sort(
    (left, right) =>
      RELEASE_CHANGE_TYPE_ORDER[left.type] - RELEASE_CHANGE_TYPE_ORDER[right.type] ||
      left.position - right.position,
  );
}

function optionalText(value: string | null) {
  return value === null || value.length === 0 ? {} : { value };
}

function toReleaseSummary(row: ReleaseSummaryRow, installedVersion?: string) {
  const codename = optionalText(row.codename);
  const highlight = optionalText(row.highlight);

  return {
    changeCount: row._count.changes,
    ...(codename.value === undefined ? {} : { codename: codename.value }),
    ...(highlight.value === undefined ? {} : { highlight: highlight.value }),
    ...(installedVersion !== undefined && installedVersion === row.version
      ? { installed: true }
      : {}),
    releasedAt: row.releasedAt.toISOString(),
    version: row.version,
  };
}

export function toMobileReleaseDetail(
  row: ReleaseDetailRow,
  installedVersion?: string,
): MobileReleaseDetail {
  const summary = optionalText(row.summary);

  return MobileReleaseDetailSchema.parse({
    ...toReleaseSummary(row, installedVersion),
    ...(row.buildNumber === null ? {} : { buildNumber: row.buildNumber }),
    // The column is a BigInt, which `JSON.stringify` throws on. The wire
    // contract is a plain number, so the conversion has to happen here.
    ...(row.sizeBytes === null ? {} : { sizeBytes: Number(row.sizeBytes) }),
    ...(summary.value === undefined ? {} : { summary: summary.value }),
    changes: sortMobileReleaseChanges(row.changes).map((change) => ({
      ...(change.detail === null || change.detail.length === 0 ? {} : { detail: change.detail }),
      title: change.title,
      type: RELEASE_CHANGE_TYPE_TO_WIRE[change.type],
    })),
  });
}

export function toMobileAppUpdateLatest(row: ReleaseDetailRow) {
  const codename = optionalText(row.codename);

  return {
    ...(codename.value === undefined ? {} : { codename: codename.value }),
    ...(row.sizeBytes === null ? {} : { sizeBytes: Number(row.sizeBytes) }),
    mandatory: row.mandatory,
    releasedAt: row.releasedAt.toISOString(),
    version: row.version,
  };
}

/**
 * Numeric-segment comparison, longest-wins on a tie (`0.9` < `0.9.1`). A
 * non-numeric suffix is ignored rather than guessed at: the installed version
 * only has to answer "am I behind the newest published one?", and inventing a
 * pre-release ordering here would make `0.9.0-rc1` silently newer than `0.9.0`.
 */
export function compareReleaseVersions(left: string, right: string) {
  const leftParts = parseVersionSegments(left);
  const rightParts = parseVersionSegments(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }

  return 0;
}

function parseVersionSegments(version: string) {
  return version
    .trim()
    .split(/[.+-]/)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));
}

/**
 * `releasedAt|id`. Two releases can share a date, so the id is the tiebreaker
 * that stops a page boundary from repeating or skipping a row.
 */
export function encodeReleaseCursor(row: { id: string; releasedAt: Date }) {
  return `${row.releasedAt.toISOString()}|${row.id}`;
}

export function decodeReleaseCursor(cursor: string) {
  const separator = cursor.indexOf("|");

  if (separator <= 0) {
    return null;
  }

  const releasedAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);

  return Number.isNaN(releasedAt.getTime()) || id.length === 0 ? null : { id, releasedAt };
}

export type ReleaseScope = { product: "DESKTOP" | "MOBILE"; channel: ReleaseChannel };
const defaultScope = (): ReleaseScope => ({
  product: "MOBILE",
  channel: parsePublishedReleaseChannel(process.env.WHISPR_RELEASE_CHANNEL) ?? "STABLE",
});

export type ListMobileReleasesInput = {
  scope?: ReleaseScope;
  cursor?: string;
  installedVersion?: string;
  limit?: number;
};

export type MobileReleaseServiceDependencies = {
  countReleases: (where: Prisma.ReleaseWhereInput) => Promise<number>;
  findReleases: (
    args: Prisma.ReleaseFindManyArgs & { select: typeof releaseSummarySelect },
  ) => Promise<ReleaseSummaryRow[]>;
  findRelease: (version: string, scope?: ReleaseScope) => Promise<ReleaseDetailRow | null>;
  findLatestRelease: (channel: ReleaseChannel) => Promise<ReleaseDetailRow | null>;
};

const defaultDependencies: MobileReleaseServiceDependencies = {
  countReleases: (where) => prisma.release.count({ where }),
  findReleases: (args) => prisma.release.findMany(args) as unknown as Promise<ReleaseSummaryRow[]>,
  findRelease: (version, scope = defaultScope()) =>
    prisma.release.findFirst({
      select: releaseDetailSelect,
      where: { ...scope, withdrawnAt: null, publishedAt: { not: null }, version },
    }),
  findLatestRelease: (channel) =>
    prisma.release.findFirst({
      orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
      select: releaseDetailSelect,
      where: {
        product: "MOBILE",
        active: true,
        withdrawnAt: null,
        channel,
        publishedAt: { not: null },
      },
    }),
};

export async function listMobileReleases(
  { cursor, installedVersion, limit, scope = defaultScope() }: ListMobileReleasesInput = {},
  dependencies: MobileReleaseServiceDependencies = defaultDependencies,
): Promise<MobileReleaseListResponse> {
  const PUBLISHED_ONLY = {
    ...scope,
    withdrawnAt: null,
    publishedAt: { not: null },
  } satisfies Prisma.ReleaseWhereInput;
  const pageSize = Math.min(
    Math.max(Math.trunc(limit ?? MOBILE_RELEASE_PAGE_SIZE), 1),
    MOBILE_RELEASE_PAGE_MAX_SIZE,
  );
  const decoded = cursor ? decodeReleaseCursor(cursor) : null;

  const where: Prisma.ReleaseWhereInput = decoded
    ? {
        ...PUBLISHED_ONLY,
        // Keyset rather than offset: 2b's list grows at the top, and an offset
        // page would shift under the reader every time a version ships.
        OR: [
          { releasedAt: { lt: decoded.releasedAt } },
          { id: { lt: decoded.id }, releasedAt: decoded.releasedAt },
        ],
      }
    : PUBLISHED_ONLY;

  const [rows, total] = await Promise.all([
    dependencies.findReleases({
      orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
      select: releaseSummarySelect,
      // One extra row answers "is there another page?" without a second count.
      take: pageSize + 1,
      where,
    }),
    dependencies.countReleases(PUBLISHED_ONLY),
  ]);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page.at(-1);

  return MobileReleaseListResponseSchema.parse({
    nextCursor: hasMore && last ? encodeReleaseCursor(last) : null,
    releases: page.map((row) => toReleaseSummary(row, installedVersion)),
    total,
  });
}

export async function getMobileRelease(
  version: string,
  installedVersion?: string,
  dependencies: MobileReleaseServiceDependencies = defaultDependencies,
  scope: ReleaseScope = defaultScope(),
): Promise<MobileReleaseDetail | null> {
  const row = await dependencies.findRelease(version, scope);

  return row ? toMobileReleaseDetail(row, installedVersion) : null;
}

/**
 * The update banner needs `mandatory`, which the release detail contract does
 * not carry, so this returns the narrower `latest` shape rather than a detail
 * the caller would have to widen.
 */
export async function getMobileLatestRelease(
  channel: MobileReleaseChannel,
  dependencies: MobileReleaseServiceDependencies = defaultDependencies,
): Promise<MobileAppUpdateLatest | null> {
  const row = await dependencies.findLatestRelease(toReleaseChannelColumn(channel));

  return row ? MobileAppUpdateLatestSchema.parse(toMobileAppUpdateLatest(row)) : null;
}
