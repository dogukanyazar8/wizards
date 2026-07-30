import type { MobileFeedbackSubmitRequest } from "@wizards/types";

import { WHISPR_MOBILE_APP_IDENTITY } from "../release/mobile-store-contract";

export type MobileRating = 1 | 2 | 3 | 4 | 5;
export type MobileRatingTopic = "audio" | "design" | "notifications" | "speed";

export interface MobileRatingLabelCopy {
  readonly rateLabel1: string;
  readonly rateLabel2: string;
  readonly rateLabel3: string;
  readonly rateLabel4: string;
  readonly rateLabel5: string;
}

export interface MobileRatingStoreIdentity {
  readonly androidPackage?: string | null;
  readonly iosAppStoreId?: string | null;
}

export interface MobileRatingAutoTriggerInput {
  readonly currentVersion: string;
  readonly firstSessionAt: string | null;
  readonly hasOpenBugReport: boolean;
  readonly lastCrashAt: string | null;
  readonly now: Date;
  readonly snoozedUntil: string | null;
  readonly submittedVersion: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const MOBILE_RATING_MIN_USAGE_DAYS = 7;
const MOBILE_RATING_CRASH_WINDOW_DAYS = 7;
const MOBILE_RATING_SNOOZE_DAYS = 90;

const MOBILE_RATING_LABEL_KEYS = {
  1: "rateLabel1",
  2: "rateLabel2",
  3: "rateLabel3",
  4: "rateLabel4",
  5: "rateLabel5",
} as const satisfies Record<MobileRating, keyof MobileRatingLabelCopy>;

export function getMobileRatingLabel(rating: MobileRating, copy: MobileRatingLabelCopy): string {
  return copy[MOBILE_RATING_LABEL_KEYS[rating]];
}

export function calculateMobileRatingUsageDays(
  firstSessionAt: string | null,
  now: Date,
): number | null {
  if (firstSessionAt === null) {
    return null;
  }

  const firstSessionTimestamp = Date.parse(firstSessionAt);
  const elapsed = now.getTime() - firstSessionTimestamp;
  if (!Number.isFinite(firstSessionTimestamp) || elapsed < 0) {
    return null;
  }

  return Math.floor(elapsed / DAY_MS);
}

function isCrashInsideWindow(lastCrashAt: string | null, now: Date): boolean {
  if (lastCrashAt === null) {
    return false;
  }

  const crashTimestamp = Date.parse(lastCrashAt);
  if (!Number.isFinite(crashTimestamp)) {
    return true;
  }

  const elapsed = now.getTime() - crashTimestamp;
  return elapsed >= 0 && elapsed <= MOBILE_RATING_CRASH_WINDOW_DAYS * DAY_MS;
}

/**
 * §4.20's complete product gate. This remains a pure decision function: the
 * future activation point must supply the first-session timestamp, newest
 * `readMobileFaultLog()` entry and open BUG feedback state. This task
 * deliberately does not invoke it.
 */
export function shouldAutoTriggerMobileRating(input: MobileRatingAutoTriggerInput): boolean {
  const usageDays = calculateMobileRatingUsageDays(input.firstSessionAt, input.now);
  if (usageDays === null || usageDays < MOBILE_RATING_MIN_USAGE_DAYS) {
    return false;
  }

  if (isCrashInsideWindow(input.lastCrashAt, input.now) || input.hasOpenBugReport) {
    return false;
  }

  if (input.snoozedUntil !== null) {
    const snoozedUntil = Date.parse(input.snoozedUntil);
    if (!Number.isFinite(snoozedUntil) || snoozedUntil >= input.now.getTime()) {
      return false;
    }
  }

  const currentVersion = input.currentVersion.trim();
  return currentVersion.length > 0 && input.submittedVersion !== currentVersion;
}

export function getMobileRatingSnoozedUntil(now: Date): string {
  return new Date(now.getTime() + MOBILE_RATING_SNOOZE_DAYS * DAY_MS).toISOString();
}

export function resolveMobileRatingStoreUrl(
  platform: string,
  identity: MobileRatingStoreIdentity = WHISPR_MOBILE_APP_IDENTITY,
): string | null {
  if (platform === "android") {
    const packageName = identity.androidPackage?.trim() ?? "";
    return /^[A-Za-z][A-Za-z0-9_.]*$/.test(packageName)
      ? `market://details?id=${packageName}`
      : null;
  }

  if (platform === "ios") {
    const appStoreId = identity.iosAppStoreId?.trim() ?? "";
    return /^\d+$/.test(appStoreId)
      ? `itms-apps://apps.apple.com/app/id${appStoreId}?action=write-review`
      : null;
  }

  return null;
}

function toFeedbackRating(rating: MobileRating): MobileFeedbackSubmitRequest["rating"] {
  switch (rating) {
    case 1:
      return "BAD";
    case 2:
    case 3:
      return "OKAY";
    case 4:
      return "GOOD";
    case 5:
      return "GREAT";
  }
}

/**
 * A rating is product feedback, not a support/bug report. The existing
 * `/api/v1/mobile/feedback` contract has one topic, so the exact star value and
 * multi-select 2h topics travel in its bounded message while the row is filed
 * under OTHER.
 */
export function buildMobileRatingFeedbackRequest(
  rating: MobileRating,
  topics: readonly MobileRatingTopic[],
): MobileFeedbackSubmitRequest {
  return {
    attachmentClaimIds: [],
    diagnostics: null,
    message: [
      `Whispr in-app rating: ${rating}/5`,
      `Topics: ${topics.length === 0 ? "none" : topics.join(", ")}`,
    ].join("\n"),
    rating: toFeedbackRating(rating),
    topic: "OTHER",
  };
}
