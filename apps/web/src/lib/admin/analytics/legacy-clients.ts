import { prisma, type PrismaClient } from "@wizards/db";

/**
 * The gate on removing the frozen `badges` field (08 §5).
 *
 * `MobileUserProfileSchema` is `.strict()` and OTA is off, so a 0.8.x phone in
 * the field parses every profile payload against the schema it shipped with.
 * Dropping the field while such a client is still around does not degrade the
 * profile card — it makes the card fail to open at all. The removal is therefore
 * gated on a number, and this module is where an admin can read that number
 * instead of guessing.
 *
 * The comparison happens in this process rather than in SQL because `appVersion`
 * is a string column: `"0.10.0" < "0.9.0"` is true lexicographically and false
 * as a version. The query groups by version — a handful of rows — and the
 * ordering is applied here.
 */

/** Sessions below this version block the removal. */
export const LEGACY_MOBILE_APP_VERSION = "0.9.0";

/** 08 §5 asks the question over the last 30 days. */
export const LEGACY_MOBILE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LegacyClientStore = {
  appSession: Pick<PrismaClient["appSession"], "groupBy">;
};

const defaultStore: LegacyClientStore = prisma;

function parseVersion(value: string): number[] {
  // A pre-release or build suffix ("0.8.15-rc.1") compares by its release part.
  const [release = ""] = value.trim().replace(/^v/u, "").split(/[-+]/u);

  return release.split(".").map((part) => Number.parseInt(part, 10));
}

/** Negative when `left` is older, 0 when equal, positive when newer. */
export function compareAppVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    // An unparseable segment sorts as 0, which keeps a malformed version older
    // than a real one instead of letting NaN silently answer "not older".
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    const leftValue = Number.isFinite(leftPart) ? (leftPart as number) : 0;
    const rightValue = Number.isFinite(rightPart) ? (rightPart as number) : 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

export function isLegacyMobileVersion(
  version: string | null | undefined,
  maxVersion: string = LEGACY_MOBILE_APP_VERSION,
): boolean {
  // A mobile session that reported no version is old by construction: version
  // reporting shipped before 0.9.0, so an empty field cannot be a newer client.
  if (version === null || version === undefined || version.trim() === "") {
    return true;
  }

  return compareAppVersions(version, maxVersion) < 0;
}

export type LegacyMobileClientSummary = {
  /** Sessions started inside the window by a client below the cut-off. */
  sessions: number;
  /** Version strings behind those sessions, oldest first. */
  versions: Array<{ appVersion: string | null; sessions: number }>;
  maxVersion: string;
  windowDays: number;
  /** True when the frozen `badges` field may be removed (08 §5). */
  clear: boolean;
};

export async function summarizeLegacyMobileClients(
  args: { now: Date; store?: LegacyClientStore; windowDays?: number } = { now: new Date() },
): Promise<LegacyMobileClientSummary> {
  const store = args.store ?? defaultStore;
  const windowDays = args.windowDays ?? LEGACY_MOBILE_WINDOW_DAYS;
  const since = new Date(args.now.getTime() - windowDays * DAY_MS);

  const groups = await store.appSession.groupBy({
    by: ["appVersion"],
    where: { clientType: "MOBILE", startedAt: { gte: since } },
    _count: { _all: true },
  });

  const versions = groups
    .filter((group) => isLegacyMobileVersion(group.appVersion))
    .map((group) => ({ appVersion: group.appVersion, sessions: group._count._all }))
    .sort((left, right) =>
      compareAppVersions(left.appVersion ?? "0.0.0", right.appVersion ?? "0.0.0"),
    );
  const sessions = versions.reduce((total, entry) => total + entry.sessions, 0);

  return {
    clear: sessions === 0,
    maxVersion: LEGACY_MOBILE_APP_VERSION,
    sessions,
    versions,
    windowDays,
  };
}
