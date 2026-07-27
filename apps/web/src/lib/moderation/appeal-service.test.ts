import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import {
  openModerationAppeal,
  resolveModerationAppeal,
  type AppealStore,
} from "@/lib/moderation/appeal-service";

const NOW = new Date("2026-07-27T12:00:00.000Z");

function harness(
  options: {
    actionedCase?: boolean;
    alreadyAppealed?: boolean;
    status?: string;
  } = {},
) {
  const events: Array<{ body: string | null; kind: string }> = [];
  const updates: Array<Record<string, unknown>> = [];

  const client = {
    moderationCase: {
      findFirst: async () =>
        options.actionedCase === false ? null : { id: "case-1", publicNumber: 42 },
      findUnique: async () => ({ id: "case-1", status: options.status ?? "APPEALED" }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return {};
      },
    },
    moderationCaseEvent: {
      create: async (args: { data: { body: string | null; kind: string } }) => {
        events.push({ body: args.data.body, kind: args.data.kind });
        return {};
      },
      findFirst: async () => (options.alreadyAppealed ? { id: "event-1" } : null),
    },
  } as unknown as AppealStore;

  return { client, events, updates };
}

describe("opening an appeal", () => {
  it("moves the person's own actioned case back to APPEALED", async () => {
    const { client, events, updates } = harness();

    const result = await openModerationAppeal(
      { body: "Yanlışlıkla engellendim.", userId: "user-2" },
      client,
    );

    assert.deepEqual(result, { caseId: "case-1", publicNumber: 42 });
    assert.equal(updates[0]?.status, "APPEALED");
    assert.deepEqual(events, [{ body: "Yanlışlıkla engellendim.", kind: "APPEAL_OPENED" }]);
  });

  it("refuses an empty appeal", async () => {
    const { client, updates } = harness();

    await assert.rejects(
      () => openModerationAppeal({ body: "   ", userId: "user-2" }, client),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
    assert.deepEqual(updates, []);
  });

  it("refuses a second appeal on the same decision", async () => {
    const { client, updates } = harness({ alreadyAppealed: true });

    await assert.rejects(
      () => openModerationAppeal({ body: "Tekrar bakın.", userId: "user-2" }, client),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
    assert.deepEqual(updates, []);
  });

  it("refuses an appeal when nothing was decided", async () => {
    const { client } = harness({ actionedCase: false });

    await assert.rejects(
      () => openModerationAppeal({ body: "Neden engellendim?", userId: "user-2" }, client),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });
});

describe("resolving an appeal", () => {
  it("grants an appeal by dismissing the case", async () => {
    const { client, events, updates } = harness();

    const result = await resolveModerationAppeal(
      {
        adminUserId: "admin-1",
        caseId: "case-1",
        note: "Yanlış eşleşme.",
        now: NOW,
        resolution: "granted",
      },
      client,
    );

    assert.equal(result.status, "DISMISSED");
    assert.equal(updates[0]?.status, "DISMISSED");
    assert.deepEqual(
      events.map((event) => event.kind),
      ["APPEAL_RESOLVED"],
    );
  });

  it("rejecting an appeal restores the original action", async () => {
    const { client, updates } = harness();

    const result = await resolveModerationAppeal(
      {
        adminUserId: "admin-1",
        caseId: "case-1",
        note: "Karar yerinde.",
        now: NOW,
        resolution: "rejected",
      },
      client,
    );

    assert.equal(result.status, "ACTIONED");
    assert.equal(updates[0]?.status, "ACTIONED");
  });

  it("refuses to resolve a case with no open appeal", async () => {
    const { client } = harness({ status: "ACTIONED" });

    await assert.rejects(
      () =>
        resolveModerationAppeal(
          {
            adminUserId: "admin-1",
            caseId: "case-1",
            note: "Karar yerinde.",
            resolution: "rejected",
          },
          client,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  });
});
