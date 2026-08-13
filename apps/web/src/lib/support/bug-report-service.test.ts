import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  BUG_REPORT_TICKET_ATTEMPTS,
  isUniqueConstraintError,
  purgeExpiredBugReports,
  resolveBugReportPurgeDate,
  submitMobileBugReport,
  trimBugReportLog,
  type MobileBugReportServiceDependencies,
} from "./bug-report-service";

const submittedAt = new Date("2026-07-29T09:00:00.000Z");

const input = {
  body: "Sesli kanalda mikrofon açıkken kimse beni duymuyor.",
  category: "voice" as const,
  includesDeviceInfo: false,
  includesLogs: false,
  includesScreenshot: false,
  userId: "user-1",
};

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function service(
  overrides: Partial<MobileBugReportServiceDependencies> = {},
): MobileBugReportServiceDependencies {
  return {
    createBugReport: async () => ({ createdAt: submittedAt }),
    createBugReportWithScreenshotClaim: async (data) => ({
      createdAt: submittedAt,
      screenshotUrl: data.screenshotUrl ?? null,
    }),
    deleteExpiredBugReports: async () => ({ count: 0 }),
    isUniqueTicketViolation: isUniqueConstraintError,
    now: () => submittedAt,
    randomTicketSequence: () => 24_817,
    ...overrides,
  };
}

describe("bug report service", () => {
  it("draws a new ticket when the first one is already taken", async () => {
    const taken = new Set(["WSP-24817", "WSP-00042"]);
    const sequences = [24_817, 42, 90_125];
    const attempted: string[] = [];

    const result = await submitMobileBugReport(
      input,
      service({
        createBugReport: async (data) => {
          const ticket = String(data.ticket);
          attempted.push(ticket);

          if (taken.has(ticket)) {
            throw uniqueViolation();
          }

          return { createdAt: submittedAt };
        },
        randomTicketSequence: () => sequences.shift() ?? 0,
      }),
    );

    assert.deepEqual(attempted, ["WSP-24817", "WSP-00042", "WSP-90125"]);
    assert.equal(result.ticket, "WSP-90125");
  });

  it("gives up with a retryable error rather than looping forever", async () => {
    let attempts = 0;

    await assert.rejects(
      submitMobileBugReport(
        input,
        service({
          createBugReport: async () => {
            attempts += 1;
            throw uniqueViolation();
          },
        }),
      ),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 503 &&
        error.code === "BUG_REPORT_TICKET_UNAVAILABLE",
    );

    assert.equal(attempts, BUG_REPORT_TICKET_ATTEMPTS);
  });

  it("does not swallow a failure that is not a ticket collision", async () => {
    let attempts = 0;

    await assert.rejects(
      submitMobileBugReport(
        input,
        service({
          createBugReport: async () => {
            attempts += 1;
            throw new Error("connection reset");
          },
        }),
      ),
      /connection reset/,
    );

    // A retry loop here would have hidden the real fault behind a 503.
    assert.equal(attempts, 1);
  });

  it("pads a short sequence into the five-digit ticket the toast prints", async () => {
    const result = await submitMobileBugReport(input, service({ randomTicketSequence: () => 7 }));

    assert.equal(result.ticket, "WSP-00007");
  });

  it("stores the claimed screenshot only while its attachment toggle is enabled", async () => {
    const written: Array<{ screenshotUrl?: string | null }> = [];
    const capture = service({
      createBugReport: async (data) => {
        written.push(data);
        return { createdAt: submittedAt };
      },
      createBugReportWithScreenshotClaim: async (data, claim) => {
        assert.deepEqual(claim, {
          claimId: "550e8400-e29b-41d4-a716-446655440000",
          now: submittedAt,
          userId: "user-1",
        });
        written.push({ ...data, screenshotUrl: "https://cdn.whispr.test/report.png" });
        return {
          createdAt: submittedAt,
          screenshotUrl: "https://cdn.whispr.test/report.png",
        };
      },
    });

    await submitMobileBugReport(
      {
        ...input,
        includesScreenshot: true,
        screenshotUploadKey: "550e8400-e29b-41d4-a716-446655440000",
      },
      capture,
    );
    await submitMobileBugReport(
      {
        ...input,
        includesScreenshot: false,
        screenshotUploadKey: "550e8400-e29b-41d4-a716-446655440001",
      },
      capture,
    );

    assert.equal(written[0]?.screenshotUrl, "https://cdn.whispr.test/report.png");
    assert.equal(written[1]?.screenshotUrl, null);
  });

  it("dates the row ninety days out", () => {
    assert.deepEqual(
      resolveBugReportPurgeDate(new Date("2026-07-29T09:00:00.000Z")),
      new Date("2026-10-27T09:00:00.000Z"),
    );
    // Crossing a year boundary is arithmetic, not string work.
    assert.deepEqual(
      resolveBugReportPurgeDate(new Date("2026-12-01T00:00:00.000Z")),
      new Date("2027-03-01T00:00:00.000Z"),
    );
  });

  it("keeps a log that is already short untouched", () => {
    assert.equal(trimBugReportLog("a\nb\nc"), "a\nb\nc");
  });

  it("deletes only the reports whose ninety days are up", async () => {
    const asked: Date[] = [];
    const result = await purgeExpiredBugReports(
      service({
        deleteExpiredBugReports: async (before) => {
          asked.push(before);
          return { count: 3 };
        },
      }),
    );

    assert.deepEqual(asked, [submittedAt]);
    assert.deepEqual(result, { deleted: 3 });
  });

  it("recognises a unique-constraint failure without a live Prisma error class", () => {
    assert.equal(isUniqueConstraintError(uniqueViolation()), true);
    assert.equal(isUniqueConstraintError(new Error("nope")), false);
    assert.equal(isUniqueConstraintError({ code: "P2025" }), false);
    assert.equal(isUniqueConstraintError(null), false);
  });
});
