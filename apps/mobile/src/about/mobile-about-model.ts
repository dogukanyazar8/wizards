import type {
  MobileAppUpdateResponse,
  MobileReleaseChange,
  MobileReleaseChangeType,
  MobileReleaseSummary,
} from "@wizards/types";

import type { mobileCopy } from "../locale/mobile-copy";

export type MobileAboutCopy = (typeof mobileCopy)["tr"];

/** Handoff §3.3: the 1c filter chips, "Tümü" plus one per change type. */
export type MobileReleaseChangeFilter = "all" | MobileReleaseChangeType;

/** §4.2 paints one of three tints; the offline row reuses the neutral one. */
export type MobileAboutUpdateTone = "accent" | "neutral" | "success";

/** §4.2's three rows plus §9.5's fourth, which the server state cannot express. */
export type MobileAboutUpdateRowState = "available" | "checking" | "current" | "offline";

export interface MobileAboutUpdatePresentation {
  readonly action: string;
  readonly actionKind: "check" | "stop" | "update";
  readonly state: MobileAboutUpdateRowState;
  readonly subtitle: string;
  readonly title: string;
  readonly tone: MobileAboutUpdateTone;
}

export interface MobileAboutUpdateContext {
  /** `formatMobileBytes` bound to the active locale; kept injectable so the model stays pure. */
  readonly formatSize: (bytes: number) => string;
  /** "2 dk" — the relative distance the caller already rendered, or null if unknown. */
  readonly lastCheckedLabel?: string | null;
  /** False while `mobile-network-contract` reports no reachable network. */
  readonly online: boolean;
  /**
   * `Updates.isEnabled`. False in every build shipped so far, because
   * `app.config.js` still carries no `updates` key — the row then says so
   * instead of offering a download that cannot arrive.
   */
  readonly otaEnabled?: boolean;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * §4.2's table, plus §9.5's offline row and prompt 02 §5's OTA-disabled subtitle.
 *
 * The server's `UpdateState` has six members but the row renders three: the
 * `downloading`, `ready` and `failed` states all mean "there is an update", and
 * their progress and failure surfaces belong to the 1d overlay (§3.4, §4.7), not
 * to this line. They therefore collapse onto `available`.
 */
export function resolveAboutUpdatePresentation(
  update: MobileAppUpdateResponse | null,
  copy: MobileAboutCopy,
  context: MobileAboutUpdateContext,
): MobileAboutUpdatePresentation {
  if (!context.online) {
    return {
      action: copy.aboutUpdateActionCheck,
      actionKind: "check",
      state: "offline",
      subtitle: copy.aboutUpdateSubOffline,
      title: copy.aboutUpdateOffline,
      tone: "neutral",
    };
  }

  if (update?.state === "checking") {
    return {
      action: copy.aboutUpdateActionStop,
      actionKind: "stop",
      state: "checking",
      subtitle: copy.aboutUpdateSubChecking,
      title: copy.aboutUpdateChecking,
      tone: "neutral",
    };
  }

  const hasUpdate =
    update !== null &&
    update.latest !== undefined &&
    (update.state === "available" ||
      update.state === "downloading" ||
      update.state === "ready" ||
      update.state === "failed");

  if (hasUpdate && update.latest) {
    const { latest } = update;

    return {
      action: copy.aboutUpdateActionUpdate,
      actionKind: "update",
      state: "available",
      subtitle: copy.aboutUpdateSubAvailable,
      title: fill(copy.aboutUpdateAvailable, {
        codename: latest.codename ?? latest.version,
        size: latest.sizeBytes === undefined ? "" : context.formatSize(latest.sizeBytes),
        version: latest.version,
      }).replace(/\s*·\s*$/, ""),
      tone: "accent",
    };
  }

  // A build with OTA off can still report `current`; what it cannot do is
  // promise the check was automatic, so the subtitle says why instead.
  const otaDisabled = context.otaEnabled === false || update?.otaEnabled === false;
  const subtitle = otaDisabled
    ? copy.aboutUpdateSubDisabled
    : context.lastCheckedLabel
      ? fill(copy.aboutUpdateSubCurrent, { time: context.lastCheckedLabel })
      : copy.aboutUpdateSubDisabled;

  return {
    action: copy.aboutUpdateActionCheck,
    actionKind: "check",
    state: "current",
    subtitle,
    title: copy.aboutUpdateCurrent,
    tone: "success",
  };
}

export interface MobileReleaseChangeGroup {
  readonly changes: readonly MobileReleaseChange[];
  readonly type: MobileReleaseChangeType;
}

/** §3.6: "boş tür grubu hiç render edilmez", so empty groups are never produced. */
const CHANGE_TYPE_ORDER: readonly MobileReleaseChangeType[] = ["new", "improved", "fixed"];

export function groupReleaseChangesByType(
  changes: readonly MobileReleaseChange[],
): readonly MobileReleaseChangeGroup[] {
  return CHANGE_TYPE_ORDER.map((type) => ({
    changes: changes.filter((change) => change.type === type),
    type,
  })).filter((group) => group.changes.length > 0);
}

export interface MobileReleaseYearGroup {
  readonly releases: readonly MobileReleaseSummary[];
  readonly year: string;
}

/**
 * §3.7: 2b groups by year, newest first, and so are the rows inside each year.
 * A release whose `releasedAt` the runtime cannot parse keeps its position
 * rather than being dropped — a version missing from history reads as data loss.
 */
export function groupReleasesByYear(
  releases: readonly MobileReleaseSummary[],
): readonly MobileReleaseYearGroup[] {
  const byYear = new Map<string, MobileReleaseSummary[]>();

  for (const release of releases) {
    const timestamp = Date.parse(release.releasedAt);
    const year = Number.isNaN(timestamp)
      ? release.releasedAt.slice(0, 4)
      : String(new Date(timestamp).getUTCFullYear());
    const bucket = byYear.get(year);

    if (bucket) {
      bucket.push(release);
    } else {
      byYear.set(year, [release]);
    }
  }

  return [...byYear.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, entries]) => ({
      releases: [...entries].sort(
        (left, right) => toTimestamp(right.releasedAt) - toTimestamp(left.releasedAt),
      ),
      year,
    }));
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export interface MobileReleaseChangeFilterResult {
  readonly changes: readonly MobileReleaseChange[];
  /**
   * §4.6: an empty result does not disable the chip — the card shows the
   * "Bu sürümde bu türde değişiklik yok" row instead, and this flag is what
   * tells 1c to render it.
   */
  readonly isEmpty: boolean;
}

export function filterReleaseChanges(
  changes: readonly MobileReleaseChange[],
  filter: MobileReleaseChangeFilter,
): MobileReleaseChangeFilterResult {
  const filtered = filter === "all" ? changes : changes.filter((change) => change.type === filter);

  return { changes: filtered, isEmpty: filtered.length === 0 };
}

export interface MobileAboutDiagnosticsInput {
  readonly appVersion: string;
  readonly buildNumber?: number | string | null;
  readonly channel: string;
  readonly deviceModel?: string | null;
  readonly locale: string;
  readonly osName?: string | null;
  readonly osVersion?: string | null;
  /** Shortened to eight characters before it ever reaches the clipboard. */
  readonly userId?: string | null;
}

/** How much of an account id a support conversation needs to disambiguate. */
const DIAGNOSTICS_USER_ID_LENGTH = 8;
/**
 * Nothing here is supposed to carry a credential, but this text goes to the
 * clipboard and from there into a chat window, so anything that looks like an
 * address or a bearer token is dropped rather than trusted upstream.
 */
const SECRET_LIKE_PATTERN =
  /[^\s@]+@[^\s@]+\.[^\s@]+|\b(?:ey[A-Za-z0-9_-]{10,}|[A-Za-z0-9_-]{40,})\b/;

/**
 * §4.1: version, build, channel, device model, OS, language and a shortened
 * account id — nothing else. Returned as plain lines because it is pasted into
 * a support thread, not parsed.
 */
export function buildDiagnosticsText(input: MobileAboutDiagnosticsInput): string {
  const shortUserId = input.userId ? input.userId.slice(0, DIAGNOSTICS_USER_ID_LENGTH) : null;
  const osLabel = [input.osName, input.osVersion].filter(Boolean).join(" ");

  const lines: readonly (readonly [string, string | null])[] = [
    ["Whispr", input.appVersion],
    [
      "Build",
      input.buildNumber === null || input.buildNumber === undefined
        ? null
        : String(input.buildNumber),
    ],
    ["Channel", input.channel],
    ["Device", input.deviceModel ?? null],
    ["OS", osLabel || null],
    ["Locale", input.locale],
    ["User", shortUserId],
  ];

  return lines
    .filter((entry): entry is readonly [string, string] => {
      const value = entry[1];
      return typeof value === "string" && value.length > 0 && !SECRET_LIKE_PATTERN.test(value);
    })
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}
