import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  captureEvidenceForReport,
  purgeExpiredEvidence,
  type EvidencePurgeStore,
  type EvidenceStore,
} from "@/lib/moderation/evidence-service";

type Harness = {
  captured: Array<Record<string, unknown>>;
  client: EvidenceStore;
};

function harness(
  options: {
    dmMessage?: boolean;
    isParticipant?: boolean;
    isMember?: boolean;
    message?: boolean;
  } = {},
): Harness {
  const captured: Array<Record<string, unknown>> = [];

  const client = {
    dMMessage: {
      findUnique: async () =>
        options.dmMessage
          ? {
              attachments: [],
              author: { id: "user-2", username: "bora" },
              content: "gizli mesaj",
              conversationId: "conversation-1",
              createdAt: new Date("2026-07-27T10:00:00.000Z"),
            }
          : null,
    },
    dMParticipant: {
      findFirst: async () => (options.isParticipant ? { id: "participant-1" } : null),
    },
    message: {
      findUnique: async () =>
        options.message
          ? {
              attachments: [{ url: "https://cdn.test/a.png" }],
              author: { id: "user-2", username: "bora" },
              channel: { id: "channel-1", name: "genel", serverId: "server-1" },
              content: "taciz içeren mesaj",
              createdAt: new Date("2026-07-27T10:00:00.000Z"),
            }
          : null,
    },
    moderationEvidence: {
      create: async (args: { data: Record<string, unknown> }) => {
        captured.push(args.data);
        return {};
      },
    },
    serverMember: {
      findFirst: async () => (options.isMember ? { id: "member-1" } : null),
    },
  } as unknown as EvidenceStore;

  return { captured, client };
}

const baseInput = {
  caseId: "case-1",
  reportId: "report-1",
  reporterId: "user-9",
};

describe("evidence capture", () => {
  it("snapshots a channel message the reporter can see", async () => {
    const { captured, client } = harness({ isMember: true, message: true });

    const result = await captureEvidenceForReport({ ...baseInput, messageId: "message-1" }, client);

    assert.deepEqual(result, { captured: true });
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0]?.snapshot, {
      attachments: ["https://cdn.test/a.png"],
      authorHandle: "bora",
      authorId: "user-2",
      content: "taciz içeren mesaj",
      scope: "#genel",
      sentAt: "2026-07-27T10:00:00.000Z",
      source: "channel",
    });
  });

  it("refuses to snapshot a message the reporter cannot reach", async () => {
    const { captured, client } = harness({ isMember: false, message: true });

    const result = await captureEvidenceForReport({ ...baseInput, messageId: "message-1" }, client);

    assert.deepEqual(result, { captured: false }, "the report is still filed, the pointer is not");
    assert.deepEqual(captured, []);
  });

  it("snapshots a direct message only for a participant", async () => {
    const allowed = harness({ dmMessage: true, isParticipant: true });
    const refused = harness({ dmMessage: true, isParticipant: false });

    assert.deepEqual(
      await captureEvidenceForReport({ ...baseInput, dmMessageId: "dm-1" }, allowed.client),
      { captured: true },
    );
    assert.equal((allowed.captured[0]?.snapshot as { source: string }).source, "dm");

    assert.deepEqual(
      await captureEvidenceForReport({ ...baseInput, dmMessageId: "dm-1" }, refused.client),
      { captured: false },
    );
    assert.deepEqual(refused.captured, []);
  });

  it("captures nothing when the report names no message", async () => {
    const { captured, client } = harness({ isMember: true, message: true });

    assert.deepEqual(await captureEvidenceForReport(baseInput, client), { captured: false });
    assert.deepEqual(captured, []);
  });

  it("drops a pointer to a message that no longer exists", async () => {
    const { captured, client } = harness({ isMember: true, message: false });

    assert.deepEqual(await captureEvidenceForReport({ ...baseInput, messageId: "gone" }, client), {
      captured: false,
    });
    assert.deepEqual(captured, []);
  });
});

describe("evidence purge", () => {
  it("drops the snapshots but leaves the cases standing", async () => {
    const deleted: string[][] = [];
    const cleared: string[][] = [];

    const client: EvidencePurgeStore = {
      moderationCase: {
        findMany: async () => [{ id: "case-1" }, { id: "case-2" }],
        updateMany: async (args) => {
          cleared.push(args.where.id.in);
          return { count: args.where.id.in.length };
        },
      },
      moderationEvidence: {
        deleteMany: async (args) => {
          deleted.push(args.where.caseId.in);
          return { count: 3 };
        },
      },
    };

    const result = await purgeExpiredEvidence(
      { now: new Date("2026-07-27T12:00:00.000Z") },
      client,
    );

    assert.deepEqual(result, { casesPurged: 2, evidenceDeleted: 3 });
    assert.deepEqual(deleted, [["case-1", "case-2"]]);
    assert.deepEqual(cleared, [["case-1", "case-2"]]);
  });

  it("does nothing when no case has reached its purge date", async () => {
    const client: EvidencePurgeStore = {
      moderationCase: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      moderationEvidence: {
        deleteMany: async () => ({ count: 0 }),
      },
    };

    assert.deepEqual(await purgeExpiredEvidence({}, client), {
      casesPurged: 0,
      evidenceDeleted: 0,
    });
  });
});
