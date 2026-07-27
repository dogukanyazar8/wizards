import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { ModerationAlertCase } from "@/lib/moderation/case-alert-service";
import {
  escalateMobileAdminCase,
  getMobileAdminCase,
  listMobileAdminCases,
  type MobileCaseStore,
} from "@/lib/moderation/mobile-case-service";

const openedAt = new Date("2026-07-27T09:00:00.000Z");

type Harness = {
  client: MobileCaseStore;
  events: Record<string, unknown>[];
  queries: Record<string, unknown>[];
  updates: Record<string, unknown>[];
};

function harness(options: { moderationCase?: Record<string, unknown> | null } = {}): Harness {
  const events: Record<string, unknown>[] = [];
  const queries: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const moderationCase =
    options.moderationCase === undefined
      ? {
          assignee: null,
          evidence: [
            {
              id: "evidence-1",
              snapshot: { content: "x".repeat(320), scope: "#genel" },
            },
          ],
          id: "case-1",
          openedAt,
          priority: "HIGH",
          publicNumber: 42,
          reportCount: 2,
          reports: [
            {
              createdAt: openedAt,
              details: null,
              id: "report-1",
              reason: "SPAM",
            },
          ],
          status: "OPEN",
          subjectHandle: "spammer",
        }
      : options.moderationCase;

  const client = {
    moderationCase: {
      findMany: async (args: Record<string, unknown>) => {
        queries.push(args);
        return moderationCase ? [{ ...moderationCase, assignee: { username: "moderator" } }] : [];
      },
      findUnique: async (args: Record<string, unknown>) => {
        queries.push(args);
        return moderationCase;
      },
      update: async (args: Record<string, unknown>) => {
        updates.push(args);
        return moderationCase;
      },
    },
    moderationCaseEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        events.push(args.data);
        return {};
      },
    },
  } as unknown as MobileCaseStore;

  return { client, events, queries, updates };
}

describe("mobile admin queue", () => {
  /**
   * The phone shows the loudest cases first and offers no filters, so the order
   * has to come from the query rather than from anything the client sorts.
   */
  it("asks the database for priority-then-age order and caps the page", async () => {
    const { client, queries } = harness();

    const cases = await listMobileAdminCases(client);

    assert.deepEqual(queries[0]?.orderBy, [{ priority: "desc" }, { openedAt: "asc" }]);
    assert.deepEqual(queries[0]?.where, { status: { in: ["OPEN", "IN_REVIEW", "APPEALED"] } });
    assert.equal(queries[0]?.take, 20);
    assert.deepEqual(cases[0], {
      assigneeHandle: "moderator",
      caseId: "case-1",
      openedAt: openedAt.toISOString(),
      priority: "HIGH",
      publicNumber: 42,
      reportCount: 2,
      status: "OPEN",
      subjectHandle: "spammer",
    });
  });

  it("truncates an evidence preview and reports a missing case as 404", async () => {
    const { client } = harness();

    const detail = await getMobileAdminCase("case-1", client);

    assert.equal(detail.evidence[0]?.preview.length, 200);
    assert.equal(detail.evidence[0]?.scope, "#genel");
    assert.equal(detail.reports[0]?.reason, "SPAM");

    const missing = harness({ moderationCase: null });
    await assert.rejects(
      () => getMobileAdminCase("case-1", missing.client),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });
});

describe("mobile escalation", () => {
  it("raises the priority, notes the handoff, and asks for a phone alert", async () => {
    const { client, events, updates } = harness();
    const alerted: ModerationAlertCase[] = [];

    const result = await escalateMobileAdminCase(
      { adminUserId: "admin-1", caseId: "case-1" },
      client,
      (moderationCase) => alerted.push(moderationCase),
    );

    assert.deepEqual(result, { caseId: "case-1", priority: "URGENT" });
    assert.deepEqual(updates[0]?.data, { priority: "URGENT" });
    assert.equal(events[0]?.body, "Masaüstünde karar bekliyor.");
    assert.deepEqual(events[0]?.metadata, { escalatedFrom: "HIGH", surface: "mobile" });
    // The alert has to carry the escalated priority, not the stored one, or the
    // eligibility check would decide this case is not urgent yet.
    assert.deepEqual(alerted, [
      {
        id: "case-1",
        openedAt,
        priority: "URGENT",
        publicNumber: 42,
        status: "OPEN",
        subjectHandle: "spammer",
      },
    ]);
  });

  it("keeps a custom note and refuses an unknown case", async () => {
    const { client, events } = harness();

    await escalateMobileAdminCase(
      { adminUserId: "admin-1", caseId: "case-1", note: "  kullanıcı ısrarcı  " },
      client,
      () => undefined,
    );

    assert.equal(events[0]?.body, "kullanıcı ısrarcı");

    const missing = harness({ moderationCase: null });
    await assert.rejects(
      () =>
        escalateMobileAdminCase(
          { adminUserId: "admin-1", caseId: "case-1" },
          missing.client,
          () => undefined,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });
});
