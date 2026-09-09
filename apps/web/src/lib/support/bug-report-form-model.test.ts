import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REPORT_CATEGORIES,
  bugReportCounterTone,
  bugReportFooterNote,
  bugReportScreenshotAction,
  bugReportScreenshotBoxIntent,
  canSubmitBugReport,
  clampBugReportBody,
  clampUploadPercent,
  clearPendingValidationError,
  createBugReportDraft,
  formatScreenshotSize,
  isBugReportDirty,
  isBugReportScreenshotActionVisible,
  shouldConfirmBugReportClose,
  toggleBugReportScreenshot,
  validateBugReportDraft,
  type BugReportDraft,
} from "./bug-report-form-model";
import { REPORT_BODY_MAX_LENGTH, REPORT_BODY_MIN_LENGTH } from "./report-metrics";

const valid = "Ses kanalına girince mikrofon bir dakika sonra kendiliğinden kapanıyor.";

function draft(overrides: Partial<BugReportDraft> = {}): BugReportDraft {
  return { ...createBugReportDraft(), ...overrides };
}

describe("bug report form model", () => {
  it("opens with the three toggle defaults the design draws", () => {
    const initial = createBugReportDraft();

    assert.equal(initial.includesLogs, true);
    assert.equal(initial.includesScreenshot, false);
    assert.equal(initial.includesDeviceInfo, false);
    assert.equal(initial.category, null);
    assert.equal(initial.phase, "form");
  });

  it("lists the five categories in the design's order", () => {
    assert.deepEqual(
      [...REPORT_CATEGORIES],
      ["voice", "chat", "notification", "performance", "other"],
    );
  });

  it("requires a category and twenty trimmed characters", () => {
    assert.deepEqual(validateBugReportDraft({ body: valid, category: null }), {
      reason: "category",
      valid: false,
    });
    assert.deepEqual(validateBugReportDraft({ body: "çalışmıyor", category: "voice" }), {
      reason: "body-short",
      valid: false,
    });
    assert.deepEqual(validateBugReportDraft({ body: `${" ".repeat(40)}kısa`, category: "voice" }), {
      reason: "body-short",
      valid: false,
    });
    assert.deepEqual(validateBugReportDraft({ body: valid, category: "voice" }), { valid: true });
    assert.equal(valid.trim().length >= REPORT_BODY_MIN_LENGTH, true);
  });

  it("cuts input at the limit instead of rejecting it", () => {
    const long = "a".repeat(REPORT_BODY_MAX_LENGTH + 40);

    assert.equal(clampBugReportBody(long).length, REPORT_BODY_MAX_LENGTH);
    assert.equal(clampBugReportBody("kısa"), "kısa");
  });

  it("moves the counter through muted, warning and danger", () => {
    assert.equal(bugReportCounterTone(0), "muted");
    assert.equal(bugReportCounterTone(900), "muted");
    assert.equal(bugReportCounterTone(901), "warning");
    assert.equal(bugReportCounterTone(999), "warning");
    assert.equal(bugReportCounterTone(1_000), "danger");
  });

  it("keeps the button disabled without a category, with a short body, offline or busy", () => {
    const base = {
      body: valid,
      category: "voice" as const,
      offline: false,
      phase: "form" as const,
    };

    assert.equal(canSubmitBugReport(base), true);
    assert.equal(canSubmitBugReport({ ...base, category: null }), false);
    assert.equal(canSubmitBugReport({ ...base, body: "kısa" }), false);
    assert.equal(canSubmitBugReport({ ...base, offline: true }), false);
    assert.equal(canSubmitBugReport({ ...base, phase: "busy" }), false);
  });

  it("says exactly what is missing in the footer, in the design's priority order", () => {
    const base = { body: "", category: null, offline: false, phase: "form" as const };

    assert.deepEqual(bugReportFooterNote({ ...base, phase: "busy" }), {
      key: "report.footer.sending",
      tone: "muted",
    });
    // Offline outranks a missing category: the network is the blocker either way.
    assert.deepEqual(bugReportFooterNote({ ...base, offline: true }), {
      key: "report.footer.offline",
      tone: "warning",
    });
    assert.deepEqual(bugReportFooterNote(base), {
      key: "report.footer.category",
      tone: "muted",
    });
    assert.deepEqual(bugReportFooterNote({ ...base, body: "beş", category: "voice" }), {
      key: "report.footer.short",
      params: { count: 17 },
      tone: "muted",
    });
    assert.deepEqual(bugReportFooterNote({ ...base, body: valid, category: "voice" }), {
      key: "report.footer.ready",
      tone: "muted",
    });
  });

  it("counts the missing characters from the trimmed body", () => {
    const note = bugReportFooterNote({
      body: "  on karakter  ",
      category: "chat",
      offline: false,
      phase: "form",
    });

    // "on karakter" is eleven characters once the padding is trimmed.
    assert.deepEqual(note.params, { count: 9 });
  });

  it("asks before closing a started draft and never after sending", () => {
    assert.equal(shouldConfirmBugReportClose(draft()), false);
    assert.equal(shouldConfirmBugReportClose(draft({ category: "voice" })), true);
    assert.equal(shouldConfirmBugReportClose(draft({ body: "a" })), true);
    assert.equal(shouldConfirmBugReportClose(draft({ body: "a", phase: "busy" })), false);
    assert.equal(shouldConfirmBugReportClose(draft({ body: "a", phase: "done" })), false);
  });

  it("treats an untouched form as clean even with the default toggles", () => {
    assert.equal(isBugReportDirty(createBugReportDraft()), false);
  });

  it("walks the screenshot row through its four states", () => {
    assert.equal(bugReportScreenshotAction("none"), "add");
    assert.equal(bugReportScreenshotAction("ready"), "remove");
    assert.equal(bugReportScreenshotAction("failed"), "retry");

    assert.equal(bugReportScreenshotBoxIntent("none"), "add");
    assert.equal(bugReportScreenshotBoxIntent("ready"), "view");
    assert.equal(bugReportScreenshotBoxIntent("failed"), "retry");

    assert.equal(isBugReportScreenshotActionVisible("uploading"), false);
    assert.equal(isBugReportScreenshotActionVisible("ready"), true);
  });

  it("clears a pending attachment error when the screenshot toggle flips", () => {
    const failed = draft({
      error: "attach",
      includesScreenshot: true,
      screenshotState: "failed",
    });
    const off = toggleBugReportScreenshot(failed);

    assert.equal(off.includesScreenshot, false);
    assert.equal(off.screenshotState, "none");
    assert.equal(off.error, null);

    const on = toggleBugReportScreenshot(off);
    assert.equal(on.includesScreenshot, true);
    assert.equal(on.screenshotState, "ready");
  });

  it("leaves a submit error alone when the screenshot toggle flips", () => {
    const next = toggleBugReportScreenshot(draft({ error: "submit" }));
    assert.equal(next.error, "submit");
  });

  it("clears only the validation error when the user edits the draft", () => {
    assert.equal(clearPendingValidationError(draft({ error: "validate" })), null);
    assert.equal(clearPendingValidationError(draft({ error: "submit" })), "submit");
    assert.equal(clearPendingValidationError(draft({ error: "attach" })), "attach");
  });

  it("formats the attachment size the way the row reads it", () => {
    assert.equal(formatScreenshotSize(290_816), "284 KB");
    assert.equal(formatScreenshotSize(0), "0 KB");
    assert.equal(formatScreenshotSize(-1), "0 KB");
    assert.equal(formatScreenshotSize(400), "1 KB");
    assert.equal(formatScreenshotSize(2_202_010), "2.1 MB");
  });

  it("keeps the upload percentage a whole number inside 0..100", () => {
    assert.equal(clampUploadPercent(61.6), 62);
    assert.equal(clampUploadPercent(-4), 0);
    assert.equal(clampUploadPercent(140), 100);
    assert.equal(clampUploadPercent(Number.NaN), 0);
  });
});
