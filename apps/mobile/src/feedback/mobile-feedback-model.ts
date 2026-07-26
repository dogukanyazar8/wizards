import {
  MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT,
  MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH,
  type FeedbackRating,
  type FeedbackStatus,
  type FeedbackTopic,
  type MobileFeedbackDiagnostics,
} from "@wizards/types";

import type { MobileLineIconName } from "../design/mobile-line-icons";

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

export interface MobileFeedbackAttachmentDraft {
  readonly claimId: string;
  readonly localUri: string;
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
    attachments.some((attachment) => attachment.claimId === next.claimId)
  ) {
    return attachments;
  }

  return [...attachments, next];
}

export function removeMobileFeedbackAttachment(
  attachments: readonly MobileFeedbackAttachmentDraft[],
  claimId: string,
): readonly MobileFeedbackAttachmentDraft[] {
  const next = attachments.filter((attachment) => attachment.claimId !== claimId);
  return next.length === attachments.length ? attachments : next;
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

/** Gönder is inert while the message is blank; whitespace is not a message. */
export function canSubmitMobileFeedback(input: {
  readonly isSubmitting: boolean;
  readonly message: string;
}): boolean {
  return !input.isSubmitting && input.message.trim().length > 0;
}

export interface MobileFeedbackRelativeTimeLabels {
  readonly daysAgo: string;
  readonly hoursAgo: string;
  readonly justNow: string;
  readonly minutesAgo: string;
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

export interface MobileFeedbackStatusLabels {
  readonly IN_PROGRESS: string;
  readonly PLANNED: string;
  readonly REVIEWING: string;
  readonly SHIPPED: string;
}

export function getMobileFeedbackStatusLabel(
  status: FeedbackStatus,
  labels: MobileFeedbackStatusLabels,
): string {
  return labels[status];
}
