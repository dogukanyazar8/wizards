import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  submitUserReport,
  USER_REPORT_REASONS,
  type CreateUserReport,
} from "./user-report-submission";

function recorder(): { calls: unknown[]; createReport: CreateUserReport } {
  const calls: unknown[] = [];

  return {
    calls,
    createReport: async (input) => {
      calls.push(input);
      return { reportId: "report-1" };
    },
  };
}

describe("shared user report submission", () => {
  it("maps every contract reason onto a stored enum", () => {
    assert.deepEqual(USER_REPORT_REASONS, {
      harassment: "HARASSMENT",
      impersonation: "IMPERSONATION",
      inappropriate: "INAPPROPRIATE",
      other: "OTHER",
      spam: "SPAM",
    });
  });

  // Karar K12. The record must not remember which client filed it, so the two
  // routes produce byte-identical input to the case writer.
  it("builds the same record whichever front door called it", async () => {
    const web = recorder();
    const mobile = recorder();

    await submitUserReport(
      { body: { details: "  ", reason: "spam" }, reporterId: "user-1", subjectId: "user-2" },
      web.createReport,
    );
    await submitUserReport(
      { body: { details: "  ", reason: "spam" }, reporterId: "user-1", subjectId: "user-2" },
      mobile.createReport,
    );

    assert.deepEqual(web.calls, mobile.calls);
    assert.deepEqual(web.calls, [
      { details: "  ", reason: "SPAM", reporterId: "user-1", subjectId: "user-2" },
    ]);
  });

  it("stores a missing detail as null rather than undefined", async () => {
    const { calls, createReport } = recorder();

    await submitUserReport(
      { body: { reason: "harassment" }, reporterId: "user-1", subjectId: "user-2" },
      createReport,
    );

    assert.deepEqual(calls, [
      { details: null, reason: "HARASSMENT", reporterId: "user-1", subjectId: "user-2" },
    ]);
  });

  it("carries evidence pointers only when the body had them", async () => {
    const { calls, createReport } = recorder();

    await submitUserReport(
      {
        body: { dmMessageId: "dm-9", reason: "inappropriate" },
        reporterId: "user-1",
        subjectId: "user-2",
      },
      createReport,
    );

    assert.deepEqual(calls, [
      {
        details: null,
        dmMessageId: "dm-9",
        reason: "INAPPROPRIATE",
        reporterId: "user-1",
        subjectId: "user-2",
      },
    ]);
  });

  // The guard lives in the case writer, not in each route, so both doors get it.
  it("lets the self-report refusal through untouched", async () => {
    await assert.rejects(
      () =>
        submitUserReport(
          { body: { reason: "spam" }, reporterId: "user-1", subjectId: "user-1" },
          async () => {
            throw new ApiError("Cannot report yourself", 400, "SELF_REPORT");
          },
        ),
      (error: unknown) =>
        error instanceof ApiError && error.status === 400 && error.code === "SELF_REPORT",
    );
  });

  // The response is a receipt, not a lookup anyone holding a user id can
  // trigger: nothing about the reported account travels back.
  it("returns only the report id", async () => {
    const result = await submitUserReport(
      { body: { reason: "other" }, reporterId: "user-1", subjectId: "user-2" },
      async () => ({ reportId: "report-9" }),
    );

    assert.deepEqual(result, { reportId: "report-9" });
  });

  it("refuses to answer at all if the writer ever starts returning more", async () => {
    await assert.rejects(() =>
      submitUserReport(
        { body: { reason: "other" }, reporterId: "user-1", subjectId: "user-2" },
        async () =>
          ({ email: "leak@whispr.test", reportId: "report-9", username: "leak" }) as never,
      ),
    );
  });
});
