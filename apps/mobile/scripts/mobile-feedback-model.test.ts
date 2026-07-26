import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT,
  MOBILE_FEEDBACK_RATING_ICONS,
  MOBILE_FEEDBACK_TOPICS,
  MOBILE_FEEDBACK_TOPIC_ICONS,
  addMobileFeedbackAttachment,
  canAddMobileFeedbackAttachment,
  canSubmitMobileFeedback,
  formatMobileFeedbackCounter,
  formatMobileFeedbackRelativeTime,
  isMobileFeedbackDiagnosticsDefaultOn,
  removeMobileFeedbackAttachment,
  resolveMobileFeedbackDiagnostics,
  toggleMobileRoadmapVote,
} from "../src/feedback/mobile-feedback-model";

const labels = {
  daysAgo: "{count} gün önce",
  hoursAgo: "{count} sa önce",
  justNow: "şimdi gönderildi",
  minutesAgo: "{count} dk önce",
};

const attachment = (claimId: string) => ({ claimId, localUri: `file:///${claimId}.png` });

test("diagnostics default on only where a report is useless without it", () => {
  assert.equal(isMobileFeedbackDiagnosticsDefaultOn("BUG"), true);
  assert.equal(isMobileFeedbackDiagnosticsDefaultOn("PERFORMANCE"), true);
  assert.equal(isMobileFeedbackDiagnosticsDefaultOn("SUGGESTION"), false);
  assert.equal(isMobileFeedbackDiagnosticsDefaultOn("VOICE"), false);
  assert.equal(isMobileFeedbackDiagnosticsDefaultOn("OTHER"), false);
});

test("changing topic re-applies the default until the user touches the toggle", () => {
  // Untouched: the toggle follows the topic.
  assert.equal(
    resolveMobileFeedbackDiagnostics({ current: false, topic: "BUG", userOverridden: false }),
    true,
  );
  assert.equal(
    resolveMobileFeedbackDiagnostics({ current: true, topic: "SUGGESTION", userOverridden: false }),
    false,
  );

  // Touched: an explicit answer survives every later topic change, in both
  // directions — a deliberate "no" must never be silently reversed.
  assert.equal(
    resolveMobileFeedbackDiagnostics({ current: false, topic: "BUG", userOverridden: true }),
    false,
  );
  assert.equal(
    resolveMobileFeedbackDiagnostics({ current: true, topic: "SUGGESTION", userOverridden: true }),
    true,
  );
});

test("screenshots stop at three and never duplicate a claim", () => {
  let attachments = addMobileFeedbackAttachment([], attachment("a"));
  attachments = addMobileFeedbackAttachment(attachments, attachment("b"));
  attachments = addMobileFeedbackAttachment(attachments, attachment("c"));

  assert.equal(attachments.length, MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT);
  assert.equal(canAddMobileFeedbackAttachment(attachments), false);

  const overflowed = addMobileFeedbackAttachment(attachments, attachment("d"));
  assert.equal(overflowed, attachments);

  const duplicated = addMobileFeedbackAttachment(
    removeMobileFeedbackAttachment(attachments, "c"),
    attachment("a"),
  );
  assert.deepEqual(
    duplicated.map((entry) => entry.claimId),
    ["a", "b"],
  );
});

test("removing an unknown screenshot leaves the list identical", () => {
  const attachments = addMobileFeedbackAttachment([], attachment("a"));
  assert.equal(removeMobileFeedbackAttachment(attachments, "zz"), attachments);
  assert.deepEqual(removeMobileFeedbackAttachment(attachments, "a"), []);
});

test("the counter reads exactly as the card renders it", () => {
  assert.equal(formatMobileFeedbackCounter(142), "142 / 1000");
  assert.equal(formatMobileFeedbackCounter(0), "0 / 1000");
});

test("Gönder stays inert until there is a real message", () => {
  assert.equal(canSubmitMobileFeedback({ isSubmitting: false, message: "" }), false);
  assert.equal(canSubmitMobileFeedback({ isSubmitting: false, message: "   " }), false);
  assert.equal(canSubmitMobileFeedback({ isSubmitting: false, message: "merhaba" }), true);
  // And it stays inert while a submission is already in flight.
  assert.equal(canSubmitMobileFeedback({ isSubmitting: true, message: "merhaba" }), false);
});

test("relative time reads naturally seconds after sending and days later", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  assert.equal(
    formatMobileFeedbackRelativeTime("2026-07-26T11:59:30.000Z", now, labels),
    "şimdi gönderildi",
  );
  assert.equal(
    formatMobileFeedbackRelativeTime("2026-07-26T11:45:00.000Z", now, labels),
    "15 dk önce",
  );
  assert.equal(
    formatMobileFeedbackRelativeTime("2026-07-26T09:00:00.000Z", now, labels),
    "3 sa önce",
  );
  assert.equal(
    formatMobileFeedbackRelativeTime("2026-07-22T12:00:00.000Z", now, labels),
    "4 gün önce",
  );
  // A clock that ran backwards must not print "-1 dk önce".
  assert.equal(
    formatMobileFeedbackRelativeTime("2026-07-26T12:05:00.000Z", now, labels),
    "şimdi gönderildi",
  );
  assert.equal(formatMobileFeedbackRelativeTime("not-a-date", now, labels), "şimdi gönderildi");
});

test("the upvote toggle moves the count in both directions and never goes negative", () => {
  assert.deepEqual(toggleMobileRoadmapVote({ voteCount: 96, votedByViewer: false }), {
    voteCount: 97,
    votedByViewer: true,
  });
  assert.deepEqual(toggleMobileRoadmapVote({ voteCount: 97, votedByViewer: true }), {
    voteCount: 96,
    votedByViewer: false,
  });
  assert.deepEqual(toggleMobileRoadmapVote({ voteCount: 0, votedByViewer: true }), {
    voteCount: 0,
    votedByViewer: false,
  });
});

test("every topic and rating names a glyph from the shared line set", () => {
  assert.deepEqual(MOBILE_FEEDBACK_TOPICS, ["SUGGESTION", "BUG", "VOICE", "PERFORMANCE", "OTHER"]);
  assert.deepEqual(MOBILE_FEEDBACK_TOPIC_ICONS, {
    BUG: "bug",
    OTHER: "settings",
    PERFORMANCE: "bolt",
    SUGGESTION: "star",
    VOICE: "speaker",
  });
  assert.deepEqual(MOBILE_FEEDBACK_RATING_ICONS, {
    BAD: "face-bad",
    GOOD: "face-good",
    GREAT: "face-great",
    OKAY: "face-okay",
  });
});
