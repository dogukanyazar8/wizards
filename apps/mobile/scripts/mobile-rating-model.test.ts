import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMobileRatingFeedbackRequest,
  calculateMobileRatingUsageDays,
  getMobileRatingLabel,
  getMobileRatingSnoozedUntil,
  resolveMobileRatingStoreUrl,
  shouldAutoTriggerMobileRating,
} from "../src/about/mobile-rating-model";

const NOW = new Date("2026-07-30T09:41:00.000Z");

const labels = {
  rateLabel1: "Hiç olmadı",
  rateLabel2: "Zayıf",
  rateLabel3: "İdare eder",
  rateLabel4: "İyi, ama eksikleri var",
  rateLabel5: "Harika",
} as const;

describe("mobile rating model", () => {
  it("maps ratings 1-5 to their localized labels", () => {
    assert.deepEqual(
      ([1, 2, 3, 4, 5] as const).map((rating) => getMobileRatingLabel(rating, labels)),
      ["Hiç olmadı", "Zayıf", "İdare eder", "İyi, ama eksikleri var", "Harika"],
    );
  });

  it("calculates whole usage days from a known first session and keeps an unknown date unknown", () => {
    assert.equal(calculateMobileRatingUsageDays("2026-07-20T09:40:59.000Z", NOW), 10);
    assert.equal(calculateMobileRatingUsageDays(null, NOW), null);
    assert.equal(calculateMobileRatingUsageDays("not-a-date", NOW), null);
  });

  it("allows automatic prompting only when every product gate passes", () => {
    assert.equal(
      shouldAutoTriggerMobileRating({
        currentVersion: "0.8.15",
        firstSessionAt: "2026-07-20T09:41:00.000Z",
        hasOpenBugReport: false,
        lastCrashAt: null,
        now: NOW,
        snoozedUntil: null,
        submittedVersion: "0.8.14",
      }),
      true,
    );
  });

  it("blocks automatic prompting when usage is under seven days", () => {
    assert.equal(
      shouldAutoTriggerMobileRating({
        currentVersion: "0.8.15",
        firstSessionAt: "2026-07-24T09:41:00.000Z",
        hasOpenBugReport: false,
        lastCrashAt: null,
        now: NOW,
        snoozedUntil: null,
        submittedVersion: null,
      }),
      false,
    );
  });

  it("blocks automatic prompting after a crash in the last seven days", () => {
    assert.equal(
      shouldAutoTriggerMobileRating({
        currentVersion: "0.8.15",
        firstSessionAt: "2026-07-20T09:41:00.000Z",
        hasOpenBugReport: false,
        lastCrashAt: "2026-07-24T09:41:00.000Z",
        now: NOW,
        snoozedUntil: null,
        submittedVersion: null,
      }),
      false,
    );
  });

  it("blocks automatic prompting while an open bug report exists", () => {
    assert.equal(
      shouldAutoTriggerMobileRating({
        currentVersion: "0.8.15",
        firstSessionAt: "2026-07-20T09:41:00.000Z",
        hasOpenBugReport: true,
        lastCrashAt: null,
        now: NOW,
        snoozedUntil: null,
        submittedVersion: null,
      }),
      false,
    );
  });

  it("blocks automatic prompting until snoozedUntil is strictly in the past", () => {
    assert.equal(
      shouldAutoTriggerMobileRating({
        currentVersion: "0.8.15",
        firstSessionAt: "2026-07-20T09:41:00.000Z",
        hasOpenBugReport: false,
        lastCrashAt: null,
        now: NOW,
        snoozedUntil: NOW.toISOString(),
        submittedVersion: null,
      }),
      false,
    );
  });

  it("blocks automatic prompting after the current version was submitted", () => {
    assert.equal(
      shouldAutoTriggerMobileRating({
        currentVersion: "0.8.15",
        firstSessionAt: "2026-07-20T09:41:00.000Z",
        hasOpenBugReport: false,
        lastCrashAt: null,
        now: NOW,
        snoozedUntil: null,
        submittedVersion: "0.8.15",
      }),
      false,
    );
  });

  it("builds the existing product-feedback payload instead of a bug-report payload", () => {
    assert.deepEqual(buildMobileRatingFeedbackRequest(4, ["notifications", "audio"]), {
      attachmentClaimIds: [],
      diagnostics: null,
      message: "Whispr in-app rating: 4/5\nTopics: notifications, audio",
      rating: "GOOD",
      topic: "OTHER",
    });
  });

  it("uses contract identities for store links and returns null when an identity is absent", () => {
    assert.equal(
      resolveMobileRatingStoreUrl("android", {
        androidPackage: "team.whispr.mobile",
      }),
      "market://details?id=team.whispr.mobile",
    );
    assert.equal(
      resolveMobileRatingStoreUrl("ios", { iosAppStoreId: "1234567890" }),
      "itms-apps://apps.apple.com/app/id1234567890?action=write-review",
    );
    assert.equal(resolveMobileRatingStoreUrl("ios", {}), null);
  });

  it("snoozes for exactly 90 days", () => {
    assert.equal(getMobileRatingSnoozedUntil(NOW), "2026-10-28T09:41:00.000Z");
  });
});
