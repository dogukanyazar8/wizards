import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as bugReport from "./bug-report";
import {
  BUG_REPORT_REDACTED_LINE,
  BugReportClientPlatformSchema,
  DesktopReleaseRingSchema,
  WebBugReportRequestSchema,
  WebBugReportResponseSchema,
  redactBugReportLogLines,
  resolveBugReportReleaseChannel,
} from "./bug-report";
import { MOBILE_BUG_REPORT_LOG_MAX_LINES, MobileBugReportRequestSchema } from "./mobile";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const request = {
  appBuild: "1187",
  appVersion: "2.4.1",
  body: "Ses kanalına girince mikrofon bir dakika sonra kendiliğinden kapanıyor.",
  category: "voice",
  includesDeviceInfo: false,
  includesLogs: true,
  includesScreenshot: false,
  platform: "web",
  releaseChannel: "stable",
};

describe("bug report contract", () => {
  it("covers every exported schema with a valid and an invalid fixture", () => {
    assertSchemaBehaviorCoverage(bugReport, {
      BugReportClientPlatformSchema: {
        schema: BugReportClientPlatformSchema,
        valid: "desktop",
        invalid: "android",
      },
      DesktopReleaseRingSchema: {
        schema: DesktopReleaseRingSchema,
        valid: "production-small",
        invalid: "stable",
      },
      WebBugReportRequestSchema: {
        schema: WebBugReportRequestSchema,
        valid: request,
        invalid: { ...request, body: "kısa" },
      },
      WebBugReportResponseSchema: {
        schema: WebBugReportResponseSchema,
        valid: { createdAt: "2026-08-26T09:00:00.000Z", ticket: "WSP-12345" },
        invalid: { createdAt: "2026-08-26T09:00:00.000Z", ticket: "WSP-1" },
      },
    });
  });

  it("is the mobile schema itself, not a second copy that can drift", () => {
    assert.equal(WebBugReportRequestSchema, MobileBugReportRequestSchema);
  });

  it("accepts the web platform values the column stores", () => {
    assertAccepts(WebBugReportRequestSchema, { ...request, platform: "desktop" });
    assertRejects(WebBugReportRequestSchema, { ...request, screenshotUploadKey: "not-a-uuid" }, [
      "screenshotUploadKey",
    ]);
  });

  it("maps every desktop release ring onto a contract channel", () => {
    assert.equal(resolveBugReportReleaseChannel("production"), "stable");
    assert.equal(resolveBugReportReleaseChannel("production-small"), "stable");
    assert.equal(resolveBugReportReleaseChannel("uat"), "uat");
  });

  it("falls back to stable for an unknown or missing ring", () => {
    assert.equal(resolveBugReportReleaseChannel(undefined), "stable");
    assert.equal(resolveBugReportReleaseChannel("nightly"), "stable");
    assert.equal(resolveBugReportReleaseChannel(7), "stable");
  });

  it("drops a suspicious line whole instead of masking part of it", () => {
    const lines = [
      "2026-08-26T09:00:00.000Z kind=network reference=WW-N-1A2B3C",
      "authorization: Bearer abc.def.ghi",
      "message: merhaba Ayşe",
      "user_name=dogukan",
      "contact: someone@example.com",
      "/Users/doguk/Desktop/gizli-rapor.pdf",
    ];

    const redacted = redactBugReportLogLines(lines);

    assert.equal(redacted.length, lines.length);
    assert.equal(redacted[0], lines[0]);
    for (const line of redacted.slice(1)) {
      assert.equal(line, BUG_REPORT_REDACTED_LINE);
    }
  });

  it("keeps the last lines, never more than the contract cap, and none at limit zero", () => {
    const lines = Array.from({ length: 600 }, (_, index) => `line-${index}`);

    assert.deepEqual(redactBugReportLogLines(lines, 0), []);
    assert.deepEqual(redactBugReportLogLines(lines, 3), ["line-597", "line-598", "line-599"]);
    assert.equal(redactBugReportLogLines(lines, 5_000).length, MOBILE_BUG_REPORT_LOG_MAX_LINES);
  });

  it("normalises embedded newlines so one fault cannot forge extra log rows", () => {
    assert.deepEqual(redactBugReportLogLines(["  first\n\rsecond  "], 1), ["first second"]);
  });
});
