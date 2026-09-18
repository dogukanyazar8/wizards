import {
  MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT,
  MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH,
  type FeedbackRating,
  type FeedbackStatus,
  type FeedbackTopic,
  type MobileFeedbackDiagnostics,
  type MobileRoadmapItem,
} from "@wizards/types";

import type { MobileLineIconName } from "../design/mobile-line-icons";
import type { MobileUploadStage } from "../media/mobile-upload-watchdog";

export { MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT, MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH };

/** Handoff 4a, left to right. */
export const MOBILE_FEEDBACK_RATINGS = [
  "BAD",
  "OKAY",
  "GOOD",
  "GREAT",
] as const satisfies readonly FeedbackRating[];

export const MOBILE_FEEDBACK_TOPICS = [
  "SUGGESTION",
  "BUG",
  "VOICE",
  "PERFORMANCE",
  "OTHER",
] as const satisfies readonly FeedbackTopic[];

export const MOBILE_FEEDBACK_RATING_ICONS: Readonly<Record<FeedbackRating, MobileLineIconName>> = {
  BAD: "face-bad",
  GOOD: "face-good",
  GREAT: "face-great",
  OKAY: "face-okay",
};

export const MOBILE_FEEDBACK_TOPIC_ICONS: Readonly<Record<FeedbackTopic, MobileLineIconName>> = {
  BUG: "bug",
  OTHER: "settings",
  PERFORMANCE: "bolt",
  SUGGESTION: "star",
  VOICE: "speaker",
};

export type MobileFeedbackAttachmentStatus = "failed" | "ready" | "uploading";

export interface MobileFeedbackAttachmentDraft {
  /** The server claim id; `null` until the upload actually lands. */
  readonly claimId: string | null;
  /**
   * Local identity, assigned the moment the picker returns. The tile is drawn
   * from this before any byte leaves the device, which is what makes the
   * thumbnail appear immediately instead of after the round trip.
   */
  readonly id: string;
  readonly localUri: string;
  /**
   * 0 to 1. A spinner cannot tell a slow upload from a dead one — which is
   * exactly the confusion a stalled screenshot upload caused — so the tile
   * shows how far the bytes have actually got.
   */
  readonly progress: number;
  readonly status: MobileFeedbackAttachmentStatus;
}

export function createMobileFeedbackAttachmentDraft(
  id: string,
  localUri: string,
): MobileFeedbackAttachmentDraft {
  return { claimId: null, id, localUri, progress: 0, status: "uploading" };
}

/**
 * Diagnostics default ON for the two topics that are useless without it — a bug
 * report or a performance complaint with no device, build or fault trail is a
 * ticket nobody can action. Everything else stays OFF: an idea about the server
 * switcher does not need the reporter's hardware.
 */
export function isMobileFeedbackDiagnosticsDefaultOn(topic: FeedbackTopic): boolean {
  return topic === "BUG" || topic === "PERFORMANCE";
}

/**
 * Switching topic re-applies that default — until the user touches the toggle
 * themselves, after which their choice survives every later topic change. An
 * explicit "no" must never be silently reversed by picking a different subject.
 */
export function resolveMobileFeedbackDiagnostics(input: {
  readonly current: boolean;
  readonly topic: FeedbackTopic;
  readonly userOverridden: boolean;
}): boolean {
  return input.userOverridden ? input.current : isMobileFeedbackDiagnosticsDefaultOn(input.topic);
}

export function addMobileFeedbackAttachment(
  attachments: readonly MobileFeedbackAttachmentDraft[],
  next: MobileFeedbackAttachmentDraft,
): readonly MobileFeedbackAttachmentDraft[] {
  if (
    attachments.length >= MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT ||
    attachments.some((attachment) => attachment.id === next.id)
  ) {
    return attachments;
  }

  return [...attachments, next];
}

/**
 * Adds a whole gallery selection at once, keeping the cap and the no-duplicates
 * rule the single-image path already enforced.
 */
export function addMobileFeedbackAttachments(
  attachments: readonly MobileFeedbackAttachmentDraft[],
  next: readonly MobileFeedbackAttachmentDraft[],
): readonly MobileFeedbackAttachmentDraft[] {
  return next.reduce(addMobileFeedbackAttachment, attachments);
}

/**
 * How many images the picker may still return. Telling the gallery the limit is
 * what keeps a fourth pick from being silently discarded after the user made it.
 */
export function countMobileFeedbackAttachmentSlots(
  attachments: readonly MobileFeedbackAttachmentDraft[],
): number {
  return Math.max(0, MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT - attachments.length);
}

/** Progress reports arrive from the transport; unknown tiles and junk values are absorbed. */
export function setMobileFeedbackAttachmentProgress(
  attachments: readonly MobileFeedbackAttachmentDraft[],
  id: string,
  progress: number,
): readonly MobileFeedbackAttachmentDraft[] {
  if (!attachments.some((attachment) => attachment.id === id)) {
    return attachments;
  }

  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return attachments.map((attachment) =>
    attachment.id === id ? { ...attachment, progress: clamped } : attachment,
  );
}

export function removeMobileFeedbackAttachment(
  attachments: readonly MobileFeedbackAttachmentDraft[],
  id: string,
): readonly MobileFeedbackAttachmentDraft[] {
  const next = attachments.filter((attachment) => attachment.id !== id);
  return next.length === attachments.length ? attachments : next;
}

/**
 * Resolves one tile in place: a claim id makes it ready, `null` marks it failed.
 * A tile the user removed mid-upload stays removed — the late result must not
 * resurrect it.
 */
export function settleMobileFeedbackAttachment(
  attachments: readonly MobileFeedbackAttachmentDraft[],
  id: string,
  claimId: string | null,
): readonly MobileFeedbackAttachmentDraft[] {
  if (!attachments.some((attachment) => attachment.id === id)) {
    return attachments;
  }

  return attachments.map((attachment) =>
    attachment.id === id
      ? {
          ...attachment,
          claimId,
          progress: claimId === null ? 0 : 1,
          status: claimId === null ? "failed" : "ready",
        }
      : attachment,
  );
}

/** Only uploaded tiles can be submitted; a failed one is simply left behind. */
export function collectMobileFeedbackAttachmentClaimIds(
  attachments: readonly MobileFeedbackAttachmentDraft[],
): string[] {
  return attachments.flatMap((attachment) =>
    attachment.status === "ready" && attachment.claimId !== null ? [attachment.claimId] : [],
  );
}

export function countMobileFeedbackAttachmentsInFlight(
  attachments: readonly MobileFeedbackAttachmentDraft[],
): number {
  return attachments.filter((attachment) => attachment.status === "uploading").length;
}

export function canAddMobileFeedbackAttachment(
  attachments: readonly MobileFeedbackAttachmentDraft[],
): boolean {
  return attachments.length < MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT;
}

/** `142 / 1000`, exactly as the card's top-right corner renders it. */
export function formatMobileFeedbackCounter(
  length: number,
  max = MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH,
) {
  return `${Math.max(0, Math.trunc(length))} / ${max}`;
}

/**
 * Gönder is inert while the message is blank — whitespace is not a message — and
 * while a screenshot is still uploading, because submitting then would silently
 * drop the image the user is watching upload.
 */
export function canSubmitMobileFeedback(input: {
  readonly attachments?: readonly MobileFeedbackAttachmentDraft[];
  readonly isSubmitting: boolean;
  readonly message: string;
}): boolean {
  return (
    !input.isSubmitting &&
    input.message.trim().length > 0 &&
    countMobileFeedbackAttachmentsInFlight(input.attachments ?? []) === 0
  );
}

export interface MobileFeedbackRelativeTimeLabels {
  readonly daysAgo: string;
  readonly hoursAgo: string;
  readonly justNow: string;
  readonly minutesAgo: string;
}

export interface MobileFeedbackShortTimeLabels {
  readonly days: string;
  readonly hours: string;
  readonly justNow: string;
  readonly minutes: string;
  readonly weeks: string;
}

/**
 * "şimdi gönderildi" for the first minute, then coarse buckets. A submission
 * receipt is read seconds after it is created and then, days later, from a
 * notification — both ends have to read naturally.
 */
export function formatMobileFeedbackRelativeTime(
  isoTimestamp: string,
  now: Date,
  labels: MobileFeedbackRelativeTimeLabels,
): string {
  const timestamp = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(timestamp)) {
    return labels.justNow;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1_000));
  if (elapsedSeconds < 60) {
    return labels.justNow;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return labels.minutesAgo.replace("{count}", String(minutes));
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return labels.hoursAgo.replace("{count}", String(hours));
  }

  return labels.daysAgo.replace("{count}", String(Math.floor(hours / 24)));
}

/** Compact list-row time: `şimdi`, `3 gün`, `2 hf`; never a negative value. */
export function formatMobileFeedbackShortTime(
  isoTimestamp: string,
  now: Date,
  labels: MobileFeedbackShortTimeLabels,
): string {
  const timestamp = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(timestamp)) {
    return labels.justNow;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1_000));
  if (elapsedSeconds < 60) {
    return labels.justNow;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return labels.minutes.replace("{count}", String(minutes));
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return labels.hours.replace("{count}", String(hours));
  }

  const days = Math.floor(hours / 24);
  return days < 7
    ? labels.days.replace("{count}", String(days))
    : labels.weeks.replace("{count}", String(Math.floor(days / 7)));
}

export type MobileFeedbackUploadFailureReason =
  | "network"
  | "permission"
  | "rejected"
  | "signed-out"
  | "stalled"
  | "timeout"
  | "too-large"
  | "unknown"
  | "unreadable"
  | "unsupported-type";

/**
 * Picker failures are a different family from upload failures: nothing has left
 * the device yet, and the user can fix every one of them by choosing another
 * image — provided the tile says which one it was.
 */
export function classifyMobileFeedbackPickerFailure(
  error: unknown,
): MobileFeedbackUploadFailureReason {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";

  switch (code) {
    case "photo-library-permission-denied":
      return "permission";
    case "selected-file-too-large":
      return "too-large";
    case "unable-to-read-selected-file":
    case "unknown-image-size":
      return "unreadable";
    case "unsupported-image-content-type":
      return "unsupported-type";
    default:
      return "unknown";
  }
}

const UPLOAD_NETWORK_MESSAGE =
  /network request failed|timed? ?out|econnreset|enotfound|failed to fetch|offline/i;
const UPLOAD_REJECTED_MESSAGE = /unauthorized|not allowed|too many|could not be verified|413|415/i;

/**
 * Turns an upload failure into something the tile can actually say.
 *
 * The first version reported one opaque "could not be completed" for every
 * cause, which is why a stalled upload was indistinguishable from a rejected
 * one — and why the only way to tell them apart was to guess.
 *
 * `abortedStage` is the stage the watchdog gave up in, or `null` when the
 * attempt was not aborted. It separates the two waits that used to share one
 * message: bytes that stopped moving ("stalled") and a server that never
 * answered after the last byte ("timeout"). The user can retry the first on a
 * better connection; the second is ours to fix.
 */
export function classifyMobileFeedbackUploadFailure(
  error: unknown,
  abortedStage: MobileUploadStage | null,
): MobileFeedbackUploadFailureReason {
  if (abortedStage) {
    return abortedStage === "finalizing" ? "timeout" : "stalled";
  }
  if (!(error instanceof Error)) {
    return "unknown";
  }
  if (error.name === "AbortError") {
    return "timeout";
  }
  if (UPLOAD_NETWORK_MESSAGE.test(error.message)) {
    return "network";
  }
  if (UPLOAD_REJECTED_MESSAGE.test(error.message)) {
    return "rejected";
  }

  return "unknown";
}

export type MobileFeedbackDiagnosticsRowId =
  "appVersion" | "device" | "faults" | "locale" | "os" | "theme";

export interface MobileFeedbackDiagnosticsRow {
  readonly icon: MobileLineIconName;
  readonly id: MobileFeedbackDiagnosticsRowId;
  readonly label: string;
  /** The value that would actually be sent, already formatted for reading. */
  readonly value: string;
}

export interface MobileFeedbackDiagnosticsRowLabels {
  readonly appVersion: string;
  readonly device: string;
  readonly faults: string;
  readonly faultsCount: string;
  readonly faultsNone: string;
  readonly locale: string;
  readonly localeNames: Readonly<Record<string, string>>;
  readonly os: string;
  readonly theme: string;
  readonly themeNames: { readonly dark: string; readonly light: string };
  readonly unknown: string;
}

const DIAGNOSTICS_ROW_ICONS: Readonly<Record<MobileFeedbackDiagnosticsRowId, MobileLineIconName>> =
  {
    appVersion: "info",
    device: "phone",
    faults: "alert-triangle",
    locale: "globe",
    os: "settings",
    theme: "moon",
  };

/**
 * The "Neler gönderilir?" rows, built from the payload the form would actually
 * send rather than from a hand-kept list.
 *
 * That is the whole point of the sheet: a static list is a promise, and a
 * promise drifts the first time the diagnostics contract grows a field. Reading
 * the real object means the sheet cannot be out of date, and the user sees
 * their own device rather than an abstract label.
 */
export function buildMobileFeedbackDiagnosticsRows(
  diagnostics: MobileFeedbackDiagnostics,
  labels: MobileFeedbackDiagnosticsRowLabels,
): readonly MobileFeedbackDiagnosticsRow[] {
  const osValue = [diagnostics.osName, diagnostics.osVersion].filter(Boolean).join(" ").trim();
  const faultCount = diagnostics.recentFaults.length;

  const values: Readonly<Record<MobileFeedbackDiagnosticsRowId, string>> = {
    appVersion: diagnostics.appVersion,
    device: diagnostics.deviceModel ?? labels.unknown,
    faults:
      faultCount === 0
        ? labels.faultsNone
        : labels.faultsCount.replace("{count}", String(faultCount)),
    locale: labels.localeNames[diagnostics.locale] ?? diagnostics.locale,
    os: osValue.length > 0 ? osValue : labels.unknown,
    theme: labels.themeNames[diagnostics.theme],
  };

  return (["appVersion", "device", "os", "locale", "theme", "faults"] as const).map((id) => ({
    icon: DIAGNOSTICS_ROW_ICONS[id],
    id,
    label: labels[id],
    value: values[id],
  }));
}

export type MobileFeedbackDiagnosticsExclusionId = "identity" | "messages" | "session";

/**
 * What the payload deliberately leaves out. Saying so is half the reason the
 * sheet exists — "cihaz modeli, sürüm ve hata kayıtları" answers what is taken,
 * not what is safe.
 */
export const MOBILE_FEEDBACK_DIAGNOSTICS_EXCLUSIONS = [
  { icon: "message-square", id: "messages" },
  { icon: "profile", id: "identity" },
  { icon: "lock", id: "session" },
] as const satisfies readonly {
  readonly icon: MobileLineIconName;
  readonly id: MobileFeedbackDiagnosticsExclusionId;
}[];

/**
 * The chip row, in the order an item actually walks: it is reviewed, then
 * queued, then built, then shipped. Sorting these alphabetically would put
 * "Yayınlandı" between "Planlandı" and "Değerlendiriliyor" and lose the one
 * thing the row is trying to say.
 */
export const MOBILE_ROADMAP_STATUS_FILTERS = [
  "ALL",
  "REVIEWING",
  "PLANNED",
  "IN_PROGRESS",
  "SHIPPED",
] as const;

export type MobileRoadmapStatusFilter = (typeof MOBILE_ROADMAP_STATUS_FILTERS)[number];

export type MobileRoadmapStatusCounts = Readonly<Record<MobileRoadmapStatusFilter, number>>;

const MOBILE_ROADMAP_STATUS_PRIORITY: Readonly<Record<FeedbackStatus, number>> = {
  IN_PROGRESS: 0,
  PLANNED: 1,
  REVIEWING: 2,
  SHIPPED: 3,
};

/** Presentation order is intentionally independent of the compact 4b preview. */
export function sortMobileRoadmapItems(
  items: readonly MobileRoadmapItem[],
): readonly MobileRoadmapItem[] {
  return items.slice().sort((left, right) => {
    const statusOrder =
      MOBILE_ROADMAP_STATUS_PRIORITY[left.status] - MOBILE_ROADMAP_STATUS_PRIORITY[right.status];
    if (statusOrder !== 0) {
      return statusOrder;
    }

    const voteOrder = right.voteCount - left.voteCount;
    if (voteOrder !== 0) {
      return voteOrder;
    }

    const updatedOrder = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (Number.isFinite(updatedOrder) && updatedOrder !== 0) {
      return updatedOrder;
    }

    return left.id.localeCompare(right.id);
  });
}

/**
 * Counts every chip, including the empty ones. A chip that disappears when its
 * last item moves on would reshuffle the row under the user's thumb, so zeros
 * are counted rather than omitted.
 */
export function countMobileRoadmapByStatus(
  items: readonly MobileRoadmapItem[],
): MobileRoadmapStatusCounts {
  const counts: Record<MobileRoadmapStatusFilter, number> = {
    ALL: items.length,
    IN_PROGRESS: 0,
    PLANNED: 0,
    REVIEWING: 0,
    SHIPPED: 0,
  };

  for (const item of items) {
    counts[item.status] += 1;
  }

  return counts;
}

/** "Tümü" is the server's ranking untouched; a status chip is that ranking, filtered. */
export function filterMobileRoadmapItems(
  items: readonly MobileRoadmapItem[],
  filter: MobileRoadmapStatusFilter,
): readonly MobileRoadmapItem[] {
  return filter === "ALL" ? items : items.filter((item) => item.status === filter);
}

export interface MobileFeedbackVersionLabelLabels {
  readonly arrived: string;
  readonly fixed: string;
  readonly target: string;
}

/** Turns the stored bare version into the status- and topic-aware UI note. */
export function formatMobileFeedbackVersionLabel(input: {
  readonly labels: MobileFeedbackVersionLabelLabels;
  readonly status: FeedbackStatus;
  readonly topic: FeedbackTopic;
  readonly versionLabel: string | null;
}): string | null {
  if (input.versionLabel === null) {
    return null;
  }

  const template =
    input.status !== "SHIPPED"
      ? input.labels.target
      : input.topic === "BUG" || input.topic === "PERFORMANCE"
        ? input.labels.fixed
        : input.labels.arrived;

  return template.replace("{version}", input.versionLabel);
}

export interface MobileRoadmapVoteState {
  readonly voteCount: number;
  readonly votedByViewer: boolean;
}

/**
 * The optimistic half of the upvote toggle. Kept pure so the button, the cache
 * patch and the rollback all agree on what a tap means.
 */
export function toggleMobileRoadmapVote(state: MobileRoadmapVoteState): MobileRoadmapVoteState {
  return state.votedByViewer
    ? { voteCount: Math.max(0, state.voteCount - 1), votedByViewer: false }
    : { voteCount: state.voteCount + 1, votedByViewer: true };
}
