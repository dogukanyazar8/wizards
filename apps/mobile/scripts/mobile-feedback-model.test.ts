import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT,
  MOBILE_FEEDBACK_DIAGNOSTICS_EXCLUSIONS,
  buildMobileFeedbackDiagnosticsRows,
  MOBILE_FEEDBACK_RATING_ICONS,
  MOBILE_FEEDBACK_TOPICS,
  MOBILE_FEEDBACK_TOPIC_ICONS,
  addMobileFeedbackAttachment,
  canAddMobileFeedbackAttachment,
  canSubmitMobileFeedback,
  classifyMobileFeedbackUploadFailure,
  collectMobileFeedbackAttachmentClaimIds,
  countMobileFeedbackAttachmentsInFlight,
  createMobileFeedbackAttachmentDraft,
  formatMobileFeedbackCounter,
  formatMobileFeedbackRelativeTime,
  isMobileFeedbackDiagnosticsDefaultOn,
  removeMobileFeedbackAttachment,
  resolveMobileFeedbackDiagnostics,
  settleMobileFeedbackAttachment,
  toggleMobileRoadmapVote,
} from "../src/feedback/mobile-feedback-model";

const labels = {
  daysAgo: "{count} gün önce",
  hoursAgo: "{count} sa önce",
  justNow: "şimdi gönderildi",
  minutesAgo: "{count} dk önce",
};

const draft = (id: string) => createMobileFeedbackAttachmentDraft(id, `file:///${id}.png`);

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

test("a picked screenshot is on the list before its upload starts", () => {
  const [added] = addMobileFeedbackAttachment([], draft("a"));

  // The tile is drawn from the local uri, so the thumbnail is visible while the
  // bytes are still going out.
  assert.deepEqual(added, {
    claimId: null,
    id: "a",
    localUri: "file:///a.png",
    status: "uploading",
  });
});

test("screenshots stop at three and never duplicate a tile", () => {
  let attachments = addMobileFeedbackAttachment([], draft("a"));
  attachments = addMobileFeedbackAttachment(attachments, draft("b"));
  attachments = addMobileFeedbackAttachment(attachments, draft("c"));

  assert.equal(attachments.length, MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT);
  assert.equal(canAddMobileFeedbackAttachment(attachments), false);

  const overflowed = addMobileFeedbackAttachment(attachments, draft("d"));
  assert.equal(overflowed, attachments);

  const duplicated = addMobileFeedbackAttachment(
    removeMobileFeedbackAttachment(attachments, "c"),
    draft("a"),
  );
  assert.deepEqual(
    duplicated.map((entry) => entry.id),
    ["a", "b"],
  );
});

test("removing an unknown screenshot leaves the list identical", () => {
  const attachments = addMobileFeedbackAttachment([], draft("a"));
  assert.equal(removeMobileFeedbackAttachment(attachments, "zz"), attachments);
  assert.deepEqual(removeMobileFeedbackAttachment(attachments, "a"), []);
});

test("an upload settles its own tile and leaves the others alone", () => {
  const attachments = addMobileFeedbackAttachment(
    addMobileFeedbackAttachment([], draft("a")),
    draft("b"),
  );

  const settled = settleMobileFeedbackAttachment(attachments, "a", "upload-1");
  assert.deepEqual(
    settled.map((entry) => [entry.id, entry.status, entry.claimId]),
    [
      ["a", "ready", "upload-1"],
      ["b", "uploading", null],
    ],
  );

  const failed = settleMobileFeedbackAttachment(settled, "b", null);
  assert.deepEqual(
    failed.map((entry) => [entry.id, entry.status, entry.claimId]),
    [
      ["a", "ready", "upload-1"],
      ["b", "failed", null],
    ],
  );
});

// A tile the user removed mid-upload must stay gone when the response lands.
test("a late upload result cannot resurrect a removed tile", () => {
  const attachments = addMobileFeedbackAttachment([], draft("a"));
  const removed = removeMobileFeedbackAttachment(attachments, "a");

  assert.equal(settleMobileFeedbackAttachment(removed, "a", "upload-1"), removed);
});

test("only uploaded tiles are submitted, and an in-flight one blocks Gönder", () => {
  let attachments = addMobileFeedbackAttachment([], draft("a"));
  attachments = addMobileFeedbackAttachment(attachments, draft("b"));
  attachments = addMobileFeedbackAttachment(attachments, draft("c"));

  assert.equal(countMobileFeedbackAttachmentsInFlight(attachments), 3);
  assert.equal(
    canSubmitMobileFeedback({ attachments, isSubmitting: false, message: "merhaba" }),
    false,
  );

  attachments = settleMobileFeedbackAttachment(attachments, "a", "upload-1");
  attachments = settleMobileFeedbackAttachment(attachments, "b", null);
  attachments = settleMobileFeedbackAttachment(attachments, "c", "upload-3");

  assert.equal(countMobileFeedbackAttachmentsInFlight(attachments), 0);
  // The failed tile is left behind rather than sent as a broken claim.
  assert.deepEqual(collectMobileFeedbackAttachmentClaimIds(attachments), ["upload-1", "upload-3"]);
  assert.equal(
    canSubmitMobileFeedback({ attachments, isSubmitting: false, message: "merhaba" }),
    true,
  );
});

test("an upload failure is classified so the tile can say what went wrong", () => {
  // A stalled upload the timeout aborted is not the same as a rejected one, and
  // one opaque message for both is what made this impossible to diagnose.
  assert.equal(classifyMobileFeedbackUploadFailure(new Error("boom"), true), "timeout");
  assert.equal(
    classifyMobileFeedbackUploadFailure(
      Object.assign(new Error("x"), { name: "AbortError" }),
      false,
    ),
    "timeout",
  );
  assert.equal(
    classifyMobileFeedbackUploadFailure(new Error("Network request failed"), false),
    "network",
  );
  assert.equal(classifyMobileFeedbackUploadFailure(new Error("Unauthorized"), false), "rejected");
  assert.equal(
    classifyMobileFeedbackUploadFailure(
      new Error("Too many uploads. Please try again shortly."),
      false,
    ),
    "rejected",
  );
  assert.equal(classifyMobileFeedbackUploadFailure(new Error("boom"), false), "unknown");
  assert.equal(classifyMobileFeedbackUploadFailure("not an error", false), "unknown");
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

const diagnosticsLabels = {
  appVersion: "Uygulama sürümü",
  device: "Cihaz modeli",
  faults: "Son hata kayıtları",
  faultsCount: "{count} kayıt · tür ve referans kodu",
  faultsNone: "Kayıt yok",
  locale: "Uygulama dili",
  localeNames: { en: "İngilizce", tr: "Türkçe" },
  os: "İşletim sistemi",
  theme: "Tema",
  themeNames: { dark: "Karanlık tema", light: "Açık tema" },
  unknown: "Bilinmiyor",
};

const diagnosticsPayload = {
  appVersion: "1.4.0",
  deviceModel: "Pixel 8",
  locale: "tr",
  osName: "Android",
  osVersion: "15",
  recentFaults: [
    { at: "2026-07-26T10:00:00.000Z", kind: "network" as const, reference: "WB-N-1A2B3C" },
    { at: "2026-07-26T09:00:00.000Z", kind: "render" as const, reference: "WB-R-1A2B00" },
  ],
  theme: "light" as const,
};

test("the consent sheet reads its rows off the payload that would actually be sent", () => {
  const rows = buildMobileFeedbackDiagnosticsRows(diagnosticsPayload, diagnosticsLabels);

  // Order is the reading order of the sheet, and every row shows a real value.
  assert.deepEqual(
    rows.map((row) => [row.id, row.value]),
    [
      ["appVersion", "1.4.0"],
      ["device", "Pixel 8"],
      ["os", "Android 15"],
      ["locale", "Türkçe"],
      ["theme", "Açık tema"],
      ["faults", "2 kayıt · tür ve referans kodu"],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.icon),
    ["info", "phone", "settings", "globe", "moon", "alert-triangle"],
  );
});

test("a device that reports nothing says so instead of printing an empty row", () => {
  const rows = buildMobileFeedbackDiagnosticsRows(
    {
      ...diagnosticsPayload,
      deviceModel: null,
      locale: "de",
      osName: null,
      osVersion: null,
      recentFaults: [],
      theme: "dark",
    },
    diagnosticsLabels,
  );
  const value = (id: string) => rows.find((row) => row.id === id)?.value;

  assert.equal(value("device"), "Bilinmiyor");
  assert.equal(value("os"), "Bilinmiyor");
  assert.equal(value("faults"), "Kayıt yok");
  assert.equal(value("theme"), "Karanlık tema");
  // An unmapped locale falls back to its own tag rather than to a blank cell.
  assert.equal(value("locale"), "de");
});

test("a half-known OS still reads as one string", () => {
  const rows = buildMobileFeedbackDiagnosticsRows(
    { ...diagnosticsPayload, osVersion: null },
    diagnosticsLabels,
  );

  assert.equal(rows.find((row) => row.id === "os")?.value, "Android");
});

test("the sheet names what is deliberately left out", () => {
  assert.deepEqual(MOBILE_FEEDBACK_DIAGNOSTICS_EXCLUSIONS, [
    { icon: "message-square", id: "messages" },
    { icon: "profile", id: "identity" },
    { icon: "lock", id: "session" },
  ]);
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
