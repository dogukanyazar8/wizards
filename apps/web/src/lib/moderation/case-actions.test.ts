import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  applyModerationCaseAction,
  buildReporterDedupeKey,
  claimModerationCase,
  type ModerationCaseActionDependencies,
} from "@/lib/moderation/case-actions";

const NOW = new Date("2026-07-27T12:00:00.000Z");

type Recorded = {
  audits: Array<{ action: string; metadata?: Record<string, unknown> | null; targetId?: string }>;
  bans: Array<{ reason: string; targetUserId: string }>;
  events: Array<{ body?: string | null; caseId: string; kind: string }>;
  notifications: Array<{ body: string; dedupeKey: string; title: string; userId: string }>;
  resolutions: Array<{ evidencePurgeAt: Date; resolution: string; status: string }>;
};

function harness(
  overrides: {
    claimedRows?: number;
    moderationCase?: Partial<{
      id: string;
      publicNumber: number;
      status: string;
      subjectHandle: string;
      subjectId: string | null;
    }> | null;
    reporterIds?: string[];
  } = {},
) {
  const recorded: Recorded = {
    audits: [],
    bans: [],
    events: [],
    notifications: [],
    resolutions: [],
  };

  const moderationCase =
    overrides.moderationCase === null
      ? null
      : {
          id: "case-1",
          publicNumber: 42,
          status: "OPEN",
          subjectHandle: "bora",
          subjectId: "user-2",
          ...overrides.moderationCase,
        };

  const dependencies: ModerationCaseActionDependencies = {
    banUser: async (args) => {
      recorded.bans.push({ reason: args.reason, targetUserId: args.targetUserId });
    },
    claimCase: async () => overrides.claimedRows ?? 1,
    createEvent: async (args) => {
      recorded.events.push({ body: args.body ?? null, caseId: args.caseId, kind: args.kind });
    },
    createNotification: async (args) => {
      recorded.notifications.push({
        body: args.body,
        dedupeKey: args.dedupeKey,
        title: args.title,
        userId: args.userId,
      });
    },
    createReporterNotifications: async (notifications) => {
      const existingKeys = new Set(recorded.notifications.map((entry) => entry.dedupeKey));
      for (const notification of notifications) {
        if (!existingKeys.has(notification.dedupeKey)) {
          recorded.notifications.push(notification);
          existingKeys.add(notification.dedupeKey);
        }
      }
    },
    findCase: async () => moderationCase as never,
    listReporterIds: async () => overrides.reporterIds ?? ["user-9"],
    resolveCase: async (args) => {
      recorded.resolutions.push({
        evidencePurgeAt: args.evidencePurgeAt,
        resolution: args.resolution,
        status: args.status,
      });
    },
    writeAuditLog: async (args) => {
      recorded.audits.push({
        action: args.action,
        metadata: args.metadata ?? null,
        ...(args.targetId ? { targetId: args.targetId } : {}),
      });
    },
  };

  return { dependencies, recorded };
}

describe("moderation case claiming", () => {
  it("assigns an unclaimed case and starts the response clock", async () => {
    const { dependencies, recorded } = harness();

    const result = await claimModerationCase(
      { adminUserId: "admin-1", caseId: "case-1", now: NOW },
      dependencies,
    );

    assert.equal(result.caseId, "case-1");
    assert.deepEqual(
      recorded.events.map((event) => event.kind),
      ["ASSIGNED"],
    );
    assert.deepEqual(
      recorded.audits.map((audit) => audit.action),
      ["moderation.case.claim"],
    );
  });

  it("refuses the second claim instead of stealing the case", async () => {
    const { dependencies, recorded } = harness({ claimedRows: 0 });

    await assert.rejects(
      () =>
        claimModerationCase({ adminUserId: "admin-2", caseId: "case-1", now: NOW }, dependencies),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
    assert.deepEqual(recorded.events, []);
    assert.deepEqual(recorded.audits, []);
  });

  it("reports a missing case as not found", async () => {
    const { dependencies } = harness({ moderationCase: null });

    await assert.rejects(
      () =>
        claimModerationCase({ adminUserId: "admin-1", caseId: "case-1", now: NOW }, dependencies),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });

  it("refuses every decided case even when it was never assigned", async () => {
    const originalFindUnique = prisma.moderationCase.findUnique;
    const originalUpdateMany = prisma.moderationCase.updateMany;
    const originalCreateEvent = prisma.moderationCaseEvent.create;
    const originalCreateAudit = prisma.adminAuditLog.create;
    const originalCount = prisma.moderationCase.count;

    try {
      for (const status of ["ACTIONED", "DISMISSED", "CLOSED", "APPEALED"] as const) {
        (prisma.moderationCase.findUnique as unknown as { call: unknown }) = (async () => ({
          id: "case-1",
          publicNumber: 42,
          status,
          subjectHandle: "bora",
          subjectId: "user-2",
        })) as never;
        (prisma.moderationCase.updateMany as unknown as { call: unknown }) = (async (query: {
          where?: { status?: { notIn?: string[] } };
        }) => ({
          count: query.where?.status?.notIn?.includes(status) ? 0 : 1,
        })) as never;
        (prisma.moderationCaseEvent.create as unknown as { call: unknown }) =
          (async () => ({})) as never;
        (prisma.adminAuditLog.create as unknown as { call: unknown }) = (async () => ({})) as never;
        (prisma.moderationCase.count as unknown as { call: unknown }) = (async () => 0) as never;

        await assert.rejects(
          () =>
            claimModerationCase({
              adminUserId: "admin-1",
              caseId: "case-1",
              now: NOW,
            }),
          (error: unknown) => error instanceof ApiError && error.status === 409,
          status,
        );
      }
    } finally {
      prisma.moderationCase.findUnique = originalFindUnique;
      prisma.moderationCase.updateMany = originalUpdateMany;
      prisma.moderationCaseEvent.create = originalCreateEvent;
      prisma.adminAuditLog.create = originalCreateAudit;
      prisma.moderationCase.count = originalCount;
    }
  });
});

describe("moderation case actions", () => {
  it("requires a written resolution", async () => {
    const { dependencies, recorded } = harness();

    await assert.rejects(
      () =>
        applyModerationCaseAction(
          {
            action: "dismiss",
            adminUserId: "admin-1",
            caseId: "case-1",
            now: NOW,
            resolution: "   ",
          },
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
    assert.deepEqual(recorded.resolutions, []);
  });

  it("delegates a ban to the existing ban service rather than writing its own", async () => {
    const { dependencies, recorded } = harness();

    await applyModerationCaseAction(
      {
        action: "ban",
        adminUserId: "admin-1",
        caseId: "case-1",
        now: NOW,
        resolution: "Tekrarlanan taciz.",
      },
      dependencies,
    );

    assert.deepEqual(recorded.bans, [{ reason: "Tekrarlanan taciz.", targetUserId: "user-2" }]);
    assert.deepEqual(
      recorded.resolutions.map((entry) => entry.status),
      ["ACTIONED"],
    );
    assert.deepEqual(
      recorded.events.map((event) => event.kind),
      ["ACTION_TAKEN"],
    );
    assert.deepEqual(
      recorded.audits.map((audit) => audit.action),
      ["moderation.case.action"],
    );
  });

  it("warns the subject without touching the ban service", async () => {
    const { dependencies, recorded } = harness();

    await applyModerationCaseAction(
      {
        action: "warn",
        adminUserId: "admin-1",
        caseId: "case-1",
        now: NOW,
        resolution: "İlk uyarı verildi.",
      },
      dependencies,
    );

    assert.deepEqual(recorded.bans, []);
    assert.ok(
      recorded.notifications.some((notification) => notification.userId === "user-2"),
      "the subject must hear about the warning",
    );
  });

  it("tells reporters the outcome without leaking what was done", async () => {
    const { dependencies, recorded } = harness({ reporterIds: ["user-9", "user-10"] });

    await applyModerationCaseAction(
      {
        action: "dismiss",
        adminUserId: "admin-1",
        caseId: "case-1",
        now: NOW,
        resolution: "Kural ihlali bulunamadı.",
      },
      dependencies,
    );

    const reporterNotifications = recorded.notifications.filter((notification) =>
      notification.dedupeKey.startsWith("modcase:case-1:reporter:"),
    );

    assert.deepEqual(
      reporterNotifications.map((notification) => notification.dedupeKey),
      ["modcase:case-1:reporter:user-9", "modcase:case-1:reporter:user-10"],
    );

    for (const notification of reporterNotifications) {
      assert.doesNotMatch(notification.body, /Kural ihlali bulunamadı/u);
      assert.doesNotMatch(notification.body, /ban|engel|uyar/iu);
    }

    assert.deepEqual(
      recorded.resolutions.map((entry) => entry.status),
      ["DISMISSED"],
    );
  });

  it("keeps a resolved case closed", async () => {
    const { dependencies } = harness({ moderationCase: { status: "ACTIONED" } });

    await assert.rejects(
      () =>
        applyModerationCaseAction(
          {
            action: "warn",
            adminUserId: "admin-1",
            caseId: "case-1",
            now: NOW,
            resolution: "Tekrar.",
          },
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  });

  it("rejects a second action while an appeal is open", async () => {
    const { dependencies, recorded } = harness({ moderationCase: { status: "APPEALED" } });

    await assert.rejects(
      () =>
        applyModerationCaseAction(
          {
            action: "ban",
            adminUserId: "admin-1",
            caseId: "case-1",
            now: NOW,
            resolution: "Tekrar uygulanmasın.",
          },
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
    assert.deepEqual(recorded.bans, []);
    assert.deepEqual(recorded.resolutions, []);
  });

  it("does not fail reporter fan-out when a dedupe key already exists", async () => {
    const { dependencies, recorded } = harness({ reporterIds: ["user-9", "user-9"] });

    await applyModerationCaseAction(
      {
        action: "dismiss",
        adminUserId: "admin-1",
        caseId: "case-1",
        now: NOW,
        resolution: "Kural ihlali yok.",
      },
      dependencies,
    );

    assert.equal(
      recorded.notifications.filter((entry) => entry.dedupeKey.includes(":reporter:")).length,
      1,
    );
  });

  it("cannot ban a subject whose account is gone", async () => {
    const { dependencies, recorded } = harness({ moderationCase: { subjectId: null } });

    await assert.rejects(
      () =>
        applyModerationCaseAction(
          {
            action: "ban",
            adminUserId: "admin-1",
            caseId: "case-1",
            now: NOW,
            resolution: "Hesap silinmiş.",
          },
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
    assert.deepEqual(recorded.bans, []);
  });

  it("names the reporter notification key after the case and reader", () => {
    assert.equal(buildReporterDedupeKey("case-1", "user-9"), "modcase:case-1:reporter:user-9");
  });
});

describe("evidence retention", () => {
  it("starts the six-month evidence clock when a case closes", async () => {
    const { dependencies, recorded } = harness();

    await applyModerationCaseAction(
      {
        action: "dismiss",
        adminUserId: "admin-1",
        caseId: "case-1",
        now: NOW,
        resolution: "Kural ihlali yok.",
      },
      dependencies,
    );

    assert.equal(
      recorded.resolutions[0]?.evidencePurgeAt.toISOString(),
      new Date(NOW.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});
