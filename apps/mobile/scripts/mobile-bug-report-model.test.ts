import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMobileBugReportRequest,
  enqueueMobileBugReportDraft,
  readQueuedMobileBugReports,
  redactMobileBugReportLogLines,
  validateMobileBugReportDraft,
  writeQueuedMobileBugReports,
  MOBILE_BUG_REPORT_QUEUE_KEY,
  type MobileBugReportQueuedDraft,
} from "../src/about/mobile-bug-report-model";
import {
  collectDeviceInfo,
  collectRecentLogLines,
} from "../src/about/mobile-bug-report-diagnostics";

function queuedDraft(id: string): MobileBugReportQueuedDraft {
  return {
    id,
    queuedAt: `2026-07-30T09:00:0${id}.000Z`,
    request: {
      body: "Sesli kanalda mikrofon simgesi açık kalıyor.",
      category: "voice",
      includesDeviceInfo: false,
      includesLogs: false,
      includesScreenshot: false,
    },
  };
}

describe("mobile bug report model", () => {
  it("requires a category and a trimmed 20..1000 character description", () => {
    assert.deepEqual(validateMobileBugReportDraft({ body: "x".repeat(20), category: null }), {
      valid: false,
      reason: "category",
    });
    assert.deepEqual(
      validateMobileBugReportDraft({ body: ` ${"x".repeat(19)} `, category: "chat" }),
      {
        valid: false,
        reason: "body-short",
      },
    );
    assert.deepEqual(validateMobileBugReportDraft({ body: "x".repeat(20), category: "chat" }), {
      valid: true,
    });
    assert.deepEqual(validateMobileBugReportDraft({ body: "x".repeat(1_001), category: "chat" }), {
      valid: false,
      reason: "body-long",
    });
  });

  it("keeps at most five queued drafts and drops the oldest first", () => {
    const queued = ["1", "2", "3", "4", "5", "6"].reduce<readonly MobileBugReportQueuedDraft[]>(
      (current, id) => enqueueMobileBugReportDraft(current, queuedDraft(id)),
      [],
    );

    assert.deepEqual(
      queued.map((draft) => draft.id),
      ["2", "3", "4", "5", "6"],
    );
  });

  it("persists only five valid drafts under the dedicated queue key", async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const storage = {
      getItem: async () => writes.at(-1)?.value ?? null,
      setItem: async (key: string, value: string) => {
        writes.push({ key, value });
      },
    };

    await writeQueuedMobileBugReports(["1", "2", "3", "4", "5", "6"].map(queuedDraft), storage);

    assert.equal(writes[0]?.key, MOBILE_BUG_REPORT_QUEUE_KEY);
    assert.deepEqual(
      (await readQueuedMobileBugReports(storage)).map((draft) => draft.id),
      ["2", "3", "4", "5", "6"],
    );
  });

  it("returns no log lines when the requested limit is zero", () => {
    assert.deepEqual(redactMobileBugReportLogLines(["fault kind=network"], 0), []);
  });

  it("removes message content, person names, file names, e-mail addresses and tokens from logs", () => {
    const sensitive = [
      "message_body=Bu gizli mesaj içeriğidir",
      "person_name=Ayşe Yılmaz",
      "file_name=finans-planı.pdf",
      "owner=ada@example.com",
      "Authorization: Bearer abc.def.ghi",
      "access_token=secret-token-value",
      "voice disconnected reference=V-123",
    ];

    const redacted = redactMobileBugReportLogLines(sensitive);
    const serialized = redacted.join("\n");

    assert.equal(redacted.length, sensitive.length);
    assert.equal(serialized.includes("Bu gizli mesaj içeriğidir"), false);
    assert.equal(serialized.includes("Ayşe Yılmaz"), false);
    assert.equal(serialized.includes("finans-planı.pdf"), false);
    assert.equal(serialized.includes("ada@example.com"), false);
    assert.equal(serialized.includes("abc.def.ghi"), false);
    assert.equal(serialized.includes("secret-token-value"), false);
    assert.match(serialized, /voice disconnected reference=V-123/);
  });

  it("builds a strict report body without collected message, person, file or token data", () => {
    const request = buildMobileBugReportRequest({
      appBuild: "8150",
      appVersion: "0.8.15",
      body: "Mikrofon simgesi kanaldan çıkınca açık kalıyor.",
      category: "voice",
      deviceInfo: {
        deviceModel: "iPhone 15",
        locale: "tr",
        osName: "iOS",
        osVersion: "18.2",
      },
      includesDeviceInfo: true,
      includesLogs: true,
      includesScreenshot: true,
      logLines: [
        "message_content=özel konuşma",
        "display_name=Ayşe Yılmaz",
        "attachment_name=secret-photo.jpg",
        "refresh_token=top-secret",
        "fault kind=network reference=N-481",
      ],
      platform: "ios",
      releaseChannel: "uat",
      // `MobileMediaUpload.id` is `@default(uuid())`, and the request schema
      // pins that shape so the admin console never renders an attacker-chosen
      // string as a link. The fixture has to be a real claim id.
      screenshotUploadKey: "6f1b2a4c-9d3e-4f58-8a71-2c5d0e7b4a19", // gitleaks:allow -- deterministic invalid fixture
    });
    const serialized = JSON.stringify(request);

    assert.equal(serialized.includes("özel konuşma"), false);
    assert.equal(serialized.includes("Ayşe Yılmaz"), false);
    assert.equal(serialized.includes("secret-photo.jpg"), false);
    assert.equal(serialized.includes("top-secret"), false);
    assert.equal("userId" in request, false);
    assert.equal("userName" in request, false);
    assert.equal("fileName" in request, false);
    assert.match(request.logExcerpt ?? "", /fault kind=network reference=N-481/);
  });
});

describe("mobile bug report diagnostics", () => {
  it("reads the existing fault trail, keeps the newest requested rows and exposes no error text", () => {
    const lines = collectRecentLogLines(2, {
      readFaults: () => [
        { at: "2026-07-30T09:00:03.000Z", kind: "network", reference: "N-003" },
        { at: "2026-07-30T09:00:02.000Z", kind: "render", reference: "R-002" },
        { at: "2026-07-30T09:00:01.000Z", kind: "storage", reference: "S-001" },
      ],
    });

    assert.deepEqual(lines, [
      "2026-07-30T09:00:03.000Z kind=network reference=N-003",
      "2026-07-30T09:00:02.000Z kind=render reference=R-002",
    ]);
  });

  it("collects device and release fields without a user identity", () => {
    const diagnostics = collectDeviceInfo(
      {
        appBuild: "8150",
        appVersion: "0.8.15",
        locale: "tr",
        releaseChannel: "uat",
      },
      {
        deviceModel: "iPhone 15",
        osName: "iOS",
        osVersion: "18.2",
        platform: "ios",
      },
    );

    assert.deepEqual(diagnostics, {
      appBuild: "8150",
      appVersion: "0.8.15",
      deviceInfo: {
        deviceModel: "iPhone 15",
        locale: "tr",
        osName: "iOS",
        osVersion: "18.2",
      },
      platform: "ios",
      releaseChannel: "uat",
    });
    assert.equal("userId" in diagnostics, false);
  });
});
