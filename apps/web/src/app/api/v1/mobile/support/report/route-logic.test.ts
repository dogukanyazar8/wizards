import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import {
  submitMobileBugReport,
  type MobileBugReportServiceDependencies,
} from "@/lib/support/bug-report-service";

const routes = import("./route-logic");

const submittedAt = new Date("2026-07-29T09:00:00.000Z");

const submission = {
  appBuild: "8150",
  appVersion: "0.8.15",
  body: "Sesli kanalda mikrofon açıkken kimse beni duymuyor.",
  category: "voice",
  deviceInfo: { deviceModel: "iPhone 15", osName: "iOS", osVersion: "18.2" },
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: false,
  logExcerpt: "line-1\nline-2",
  platform: "ios",
  releaseChannel: "stable",
};

type Written = Record<string, unknown>;

function service(
  written: Written[],
  overrides: Partial<MobileBugReportServiceDependencies> = {},
): MobileBugReportServiceDependencies {
  return {
    createBugReport: async (data) => {
      written.push(data as Written);
      return { createdAt: submittedAt };
    },
    deleteExpiredBugReports: async () => ({ count: 0 }),
    isUniqueTicketViolation: (error) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
    now: () => submittedAt,
    randomTicketSequence: () => 24_817,
    ...overrides,
  };
}

function request(body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/support/report", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function dependencies(
  written: Written[],
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileBugReportSubmitRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    submitReport: (input) => submitMobileBugReport(input, service(written)),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileBugReportSubmitRoute"]>[1];
}

describe("mobile bug report route", () => {
  it("stores the report and answers with a WSP ticket", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const response = await mobileBugReportSubmitRoute(request(submission), dependencies(written));
    const payload = (await response.json()) as { createdAt: string; ticket: string };

    assert.equal(response.status, 201);
    assert.match(payload.ticket, /^WSP-\d{5}$/);
    assert.equal(payload.ticket, "WSP-24817");
    assert.equal(payload.createdAt, submittedAt.toISOString());
    assert.equal(written[0]?.userId, "user-1");
  });

  it("stamps the row with the 90-day deletion date the screen promises", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    await mobileBugReportSubmitRoute(request(submission), dependencies(written));

    assert.deepEqual(written[0]?.purgeAfter, new Date("2026-10-27T09:00:00.000Z"));
  });

  it("refuses a description shorter than twenty characters", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const response = await mobileBugReportSubmitRoute(
      request({ ...submission, body: "çalışmıyor" }),
      dependencies(written),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(written, []);
  });

  it("keeps only the last 500 lines of the log", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const logExcerpt = Array.from({ length: 620 }, (_, index) => `line-${index + 1}`).join("\n");

    await mobileBugReportSubmitRoute(request({ ...submission, logExcerpt }), dependencies(written));

    const stored = String(written[0]?.logExcerpt).split("\n");
    assert.equal(stored.length, 500);
    // The tail is the part that explains the crash, so the trim comes off the front.
    assert.equal(stored[0], "line-121");
    assert.equal(stored.at(-1), "line-620");
  });

  it("does not store device details when the user unchecked them", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    await mobileBugReportSubmitRoute(
      request({ ...submission, includesDeviceInfo: false }),
      dependencies(written),
    );

    assert.equal(written[0]?.deviceInfo, undefined);
    assert.equal(written[0]?.includesDeviceInfo, false);
    // Version context is not device data and stays, so triage can still place it.
    assert.equal(written[0]?.appVersion, "0.8.15");
  });

  it("does not store a log when the user unchecked it", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    await mobileBugReportSubmitRoute(
      request({ ...submission, includesLogs: false }),
      dependencies(written),
    );

    assert.equal(written[0]?.logExcerpt, null);
  });

  it("rejects a field the 'Neler gönderilir?' list does not mention", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const response = await mobileBugReportSubmitRoute(
      request({ ...submission, contactEmail: "ada@example.com" }),
      dependencies(written),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(written, []);
  });

  it("rate limits before it writes and requires a session", async () => {
    const { mobileBugReportSubmitRoute } = await routes;
    const written: Written[] = [];

    const limited = await mobileBugReportSubmitRoute(
      request(submission),
      dependencies(written, {
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
      }),
    );
    assert.equal(limited.status, 429);
    assert.deepEqual(written, []);

    const unauthenticated = await mobileBugReportSubmitRoute(
      request(submission),
      dependencies(written, {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
