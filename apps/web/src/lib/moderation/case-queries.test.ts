import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getModerationCaseFile } from "@/lib/moderation/case-queries";

const NOW = new Date("2026-08-12T12:00:00.000Z");

describe("moderation case file pagination", () => {
  it("bounds each relation and advances each older-record page independently", async () => {
    let query: Record<string, unknown> | undefined;
    const store = {
      moderationCase: {
        findUnique: async (args: Record<string, unknown>) => {
          query = args;
          return null;
        },
      },
    };

    const result = await getModerationCaseFile(
      "case-1",
      { evidencePage: 2, eventPage: 3, reportPage: 4 },
      store as never,
    );

    assert.equal(result, null);
    const select = query?.select as {
      evidence: { orderBy: unknown; skip: number; take: number };
      events: { orderBy: unknown; skip: number; take: number };
      reports: { orderBy: unknown; skip: number; take: number };
    };
    assert.deepEqual(
      {
        evidence: { skip: select.evidence.skip, take: select.evidence.take },
        events: { skip: select.events.skip, take: select.events.take },
        reports: { skip: select.reports.skip, take: select.reports.take },
      },
      {
        evidence: { skip: 50, take: 51 },
        events: { skip: 100, take: 51 },
        reports: { skip: 150, take: 51 },
      },
    );
    assert.deepEqual(select.evidence.orderBy, { capturedAt: "desc" });
    assert.deepEqual(select.events.orderBy, { createdAt: "desc" });
    assert.deepEqual(select.reports.orderBy, { createdAt: "desc" });
  });

  it("falls back to the first page for invalid public query values", async () => {
    let query: Record<string, unknown> | undefined;
    const store = {
      moderationCase: {
        findUnique: async (args: Record<string, unknown>) => {
          query = args;
          return null;
        },
      },
    };

    await getModerationCaseFile(
      "case-1",
      { evidencePage: Number.NaN, eventPage: Number.POSITIVE_INFINITY, reportPage: -8 },
      store as never,
    );

    const select = query?.select as {
      evidence: { skip: number };
      events: { skip: number };
      reports: { skip: number };
    };
    assert.deepEqual([select.evidence.skip, select.events.skip, select.reports.skip], [0, 0, 0]);
  });

  it("returns one bounded page and exposes older-record continuation", async () => {
    const evidence = Array.from({ length: 51 }, (_, index) => ({
      capturedAt: new Date(NOW.getTime() - index * 1000),
      dmMessageId: null,
      id: `evidence-${index}`,
      messageId: null,
      snapshot: null,
    }));
    const events = Array.from({ length: 51 }, (_, index) => ({
      actor: null,
      body: null,
      createdAt: new Date(NOW.getTime() - index * 1000),
      id: `event-${index}`,
      kind: "NOTE" as const,
      metadata: null,
    }));
    const reports = Array.from({ length: 51 }, (_, index) => ({
      createdAt: new Date(NOW.getTime() - index * 1000),
      details: null,
      id: `report-${index}`,
      reason: "SPAM" as const,
      reporter: { displayName: null, id: `reporter-${index}`, username: `reporter-${index}` },
    }));
    const store = {
      dMMessage: { findMany: async () => [] },
      message: { findMany: async () => [] },
      moderationCase: {
        count: async () => 0,
        findUnique: async () => ({
          assignee: null,
          evidence,
          events,
          firstSeenAt: null,
          id: "case-1",
          openedAt: NOW,
          priority: "MEDIUM" as const,
          publicNumber: 42,
          reportCount: 51,
          reports,
          resolution: null,
          resolvedAt: null,
          status: "OPEN" as const,
          subject: null,
          subjectHandle: "bora",
          subjectId: null,
        }),
      },
    };

    const result = await getModerationCaseFile("case-1", {}, store as never);

    assert.ok(result);
    assert.equal(result.evidence.length, 50);
    assert.equal(result.timeline.length, 100);
    assert.deepEqual(result.pagination, {
      evidence: { hasOlderRecords: true, page: 1 },
      events: { hasOlderRecords: true, page: 1 },
      reports: { hasOlderRecords: true, page: 1 },
    });
  });
});
