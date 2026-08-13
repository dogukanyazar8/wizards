import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, prisma, type CampaignDeliveryStatus, type CampaignSkipReason } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  CAMPAIGN_APPROVAL_THRESHOLD,
  approveNotificationCampaign,
  createNotificationCampaign,
  normalizeCampaignSegment,
  previewNotificationCampaignRecipients,
  sendNotificationCampaign,
  type CampaignApproveDependencies,
  type CampaignCreateDependencies,
  type CampaignSendDependencies,
} from "@/lib/admin/notification-campaigns";

const NOW = new Date("2026-07-27T12:00:00.000Z");

type DeliveryRow = {
  error: string | null;
  sentAt: Date | null;
  skipReason: CampaignSkipReason | null;
  status: CampaignDeliveryStatus;
  userId: string;
};

type CampaignRow = {
  actionUrl: string | null;
  approvedAt: Date | null;
  body: string;
  completedAt: Date | null;
  failedCount: number;
  id: string;
  imageUrl: string | null;
  sentCount: number;
  startedAt: Date | null;
  status: string;
  title: string;
  type: "SYSTEM" | "MODERATION";
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    clientVersion: "7.9.0",
    code: "P2002",
  });
}

function sendHarness(
  overrides: {
    campaign?: Partial<CampaignRow>;
    deliveries?: Array<Partial<DeliveryRow> & { userId: string }>;
    failFor?: string[];
    rejectDuplicatesFor?: string[];
  } = {},
) {
  const campaign: CampaignRow = {
    actionUrl: null,
    approvedAt: null,
    body: "Body",
    completedAt: null,
    failedCount: 0,
    id: "campaign-1",
    imageUrl: null,
    sentCount: 0,
    startedAt: null,
    status: "DRAFT",
    title: "Title",
    type: "SYSTEM",
    ...overrides.campaign,
  };
  const deliveries: DeliveryRow[] = (
    overrides.deliveries ?? [{ userId: "user-1" }, { userId: "user-2" }, { userId: "user-3" }]
  ).map((row) => ({
    error: null,
    sentAt: null,
    skipReason: null,
    status: "PENDING" as CampaignDeliveryStatus,
    ...row,
  }));
  const failFor = new Set(overrides.failFor ?? []);
  const rejectDuplicatesFor = new Set(overrides.rejectDuplicatesFor ?? []);
  const notifications: Array<{ dedupeKey: string | null; userId: string }> = [];
  const emitted: string[] = [];
  const audits: Array<{ action: string; metadata: Record<string, unknown> | null }> = [];

  const find = (userId: string) => deliveries.find((row) => row.userId === userId);
  const counts = () => ({
    failed: deliveries.filter((row) => row.status === "FAILED").length,
    pending: deliveries.filter((row) => row.status === "PENDING").length,
    sent: deliveries.filter((row) => row.status === "SENT").length,
    skipped: deliveries.filter((row) => row.status === "SKIPPED").length,
  });

  const dependencies: CampaignSendDependencies = {
    completeCampaign: async (_campaignId, data) => {
      Object.assign(campaign, data);
      return campaign as never;
    },
    countDeliveries: async () => counts(),
    createNotification: async (data) => {
      if (rejectDuplicatesFor.has(data.userId)) {
        throw uniqueViolation();
      }

      if (failFor.has(data.userId)) {
        throw new Error("socket exploded");
      }

      notifications.push({ dedupeKey: data.dedupeKey ?? null, userId: data.userId });

      return {
        actionUrl: data.actionUrl ?? null,
        body: data.body,
        createdAt: NOW,
        id: `notification-${notifications.length}`,
        imageUrl: data.imageUrl ?? null,
        metadata: null,
        read: false,
        readAt: null,
        title: data.title,
        type: data.type,
        userId: data.userId,
      };
    },
    emitNotification: (notification) => {
      emitted.push(notification.userId);
    },
    findCampaign: async () => campaign as never,
    freezeRecipients: async () => counts(),
    listPendingUserIds: async (_campaignId, take) =>
      deliveries
        .filter((row) => row.status === "PENDING")
        .slice(0, take)
        .map((row) => row.userId),
    markCampaignApprovalRequired: async () => {
      campaign.status = "PENDING_APPROVAL";
    },
    markCampaignSending: async (_campaignId, startedAt) => {
      campaign.startedAt = startedAt;
      campaign.status = "SENDING";
    },
    markDeliveryFailed: async (_campaignId, userId, error) => {
      const row = find(userId);
      if (row) {
        row.error = error;
        row.status = "FAILED";
      }
    },
    markDeliverySent: async (_campaignId, userId, sentAt) => {
      const row = find(userId);
      if (row) {
        row.sentAt = sentAt;
        row.status = "SENT";
      }
    },
    requeueFailedDeliveries: async () => {
      for (const row of deliveries) {
        if (row.status === "FAILED") {
          row.error = null;
          row.status = "PENDING";
        }
      }
    },
    writeAuditLog: async (entry) => {
      audits.push({ action: entry.action, metadata: entry.metadata ?? null });
    },
  };

  return { audits, campaign, deliveries, dependencies, emitted, notifications };
}

describe("notification campaign segments", () => {
  it("caps recently-active windows to the supported retention range", () => {
    assert.deepEqual(normalizeCampaignSegment({ type: "RECENTLY_ACTIVE", days: 365 }), {
      type: "RECENTLY_ACTIVE",
      days: 90,
    });
    assert.deepEqual(normalizeCampaignSegment({ type: "RECENTLY_ACTIVE", days: 0 }), {
      type: "RECENTLY_ACTIVE",
      days: 1,
    });
  });

  it("deduplicates explicit recipient segments", () => {
    assert.deepEqual(
      normalizeCampaignSegment({ type: "USER_IDS", userIds: ["u1", "u2", "u1", ""] }),
      { type: "USER_IDS", userIds: ["u1", "u2"] },
    );
  });
});

function createDependencies(recipientCount: number) {
  const created: Array<Record<string, unknown>> = [];
  const audits: string[] = [];

  const dependencies: CampaignCreateDependencies = {
    countRecipients: async () => recipientCount,
    createCampaign: async (data) => {
      created.push(data);
      return { id: "campaign-1", status: data.status } as never;
    },
    writeAuditLog: async (entry) => {
      audits.push(entry.action);
    },
  };

  return { audits, created, dependencies };
}

describe("createNotificationCampaign", () => {
  it("parks an oversized audience in PENDING_APPROVAL", async () => {
    const { created, dependencies } = createDependencies(CAMPAIGN_APPROVAL_THRESHOLD + 1);

    const campaign = await createNotificationCampaign(
      "admin-1",
      { body: "Body", segment: { type: "ALL_USERS" }, title: "Title" },
      dependencies,
    );

    assert.equal(campaign.status, "PENDING_APPROVAL");
    assert.equal(created[0]?.status, "PENDING_APPROVAL");
  });

  it("leaves a small audience as a draft the author can send alone", async () => {
    const { dependencies } = createDependencies(CAMPAIGN_APPROVAL_THRESHOLD - 1);

    const campaign = await createNotificationCampaign(
      "admin-1",
      { body: "Body", segment: { type: "ALL_USERS" }, title: "Title" },
      dependencies,
    );

    assert.equal(campaign.status, "DRAFT");
  });
});

describe("previewNotificationCampaignRecipients", { concurrency: false }, () => {
  it("counts recipients in the database without materializing user ids", async () => {
    const originalCount = prisma.user.count;
    const originalFindMany = prisma.user.findMany;
    (prisma.user as unknown as { count: () => Promise<number> }).count = async () => 7;
    (prisma.user as unknown as { findMany: () => Promise<never> }).findMany = async () => {
      throw new Error("recipient preview must use count");
    };

    try {
      assert.deepEqual(await previewNotificationCampaignRecipients({ type: "ALL_USERS" }), {
        recipientCount: 7,
      });
    } finally {
      (prisma.user as unknown as { count: typeof originalCount }).count = originalCount;
      (prisma.user as unknown as { findMany: typeof originalFindMany }).findMany = originalFindMany;
    }
  });
});

describe("approveNotificationCampaign", () => {
  function approveHarness(
    overrides: Partial<{
      approvedAt: Date | null;
      createdById: string | null;
      status: string;
    }> = {},
  ) {
    const campaign = {
      approvedAt: null as Date | null,
      approvedById: null as string | null,
      createdById: "admin-1",
      id: "campaign-1",
      status: "PENDING_APPROVAL",
      ...overrides,
    };
    const audits: Array<{ action: string; metadata: Record<string, unknown> | null }> = [];

    const dependencies: CampaignApproveDependencies = {
      approve: async (_campaignId, data) => {
        Object.assign(campaign, data);
        return campaign as never;
      },
      findCampaign: async () => campaign as never,
      writeAuditLog: async (entry) => {
        audits.push({ action: entry.action, metadata: entry.metadata ?? null });
      },
    };

    return { audits, campaign, dependencies };
  }

  it("stamps the approver and audits the decision", async () => {
    const harness = approveHarness();

    await approveNotificationCampaign("admin-2", "campaign-1", harness.dependencies);

    assert.equal(harness.campaign.approvedById, "admin-2");
    assert.ok(harness.campaign.approvedAt instanceof Date);
    assert.deepEqual(
      harness.audits.map((entry) => entry.action),
      ["notification_campaign.approve"],
    );
  });

  it("refuses a self-approval", async () => {
    const harness = approveHarness();

    await assert.rejects(
      approveNotificationCampaign("admin-1", "campaign-1", harness.dependencies),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );

    assert.equal(harness.campaign.approvedById, null);
    assert.deepEqual(harness.audits, []);
  });

  it("refuses to approve a campaign that is not waiting for approval", async () => {
    const harness = approveHarness({ status: "DRAFT" });

    await assert.rejects(
      approveNotificationCampaign("admin-2", "campaign-1", harness.dependencies),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  });

  it("refuses to approve the same campaign twice", async () => {
    const harness = approveHarness({ approvedAt: NOW });

    await assert.rejects(
      approveNotificationCampaign("admin-2", "campaign-1", harness.dependencies),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  });
});

describe("sendNotificationCampaign", () => {
  it("resumes a campaign left in SENDING after a worker interruption", async () => {
    const harness = sendHarness({ campaign: { status: "SENDING" } });

    await sendNotificationCampaign(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      harness.dependencies,
    );

    assert.equal(harness.campaign.status, "SENT");
    assert.equal(harness.notifications.length, 3);
  });

  it("creates and marks a pending batch with bulk operations", async () => {
    const harness = sendHarness();
    const createOne = harness.dependencies.createNotification;
    let createBatches = 0;
    let markedBatches = 0;

    await sendNotificationCampaign({ adminUserId: "admin-1", campaignId: "campaign-1" }, {
      ...harness.dependencies,
      createNotification: async () => {
        throw new Error("single create is fallback only");
      },
      createNotificationsBatch: async (inputs) => {
        createBatches += 1;
        return Promise.all(inputs.map((input) => createOne(input)));
      },
      markDeliveriesSent: async (campaignId, userIds, sentAt) => {
        markedBatches += 1;
        for (const userId of userIds) {
          await harness.dependencies.markDeliverySent(campaignId, userId, sentAt);
        }
      },
    } as CampaignSendDependencies);

    assert.equal(createBatches, 1);
    assert.equal(markedBatches, 1);
    assert.equal(harness.campaign.status, "SENT");
  });

  it("does not notify a recipient twice when a failed campaign is sent again", async () => {
    const first = sendHarness({ failFor: ["user-3"] });

    await sendNotificationCampaign(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      first.dependencies,
    );

    assert.deepEqual(
      first.deliveries.map((row) => [row.userId, row.status]),
      [
        ["user-1", "SENT"],
        ["user-2", "SENT"],
        ["user-3", "FAILED"],
      ],
    );
    assert.equal(first.campaign.status, "FAILED");
    assert.deepEqual(
      first.notifications.map((row) => row.userId),
      ["user-1", "user-2"],
    );

    const retry = sendHarness({
      campaign: { status: "FAILED" },
      deliveries: [
        { sentAt: NOW, status: "SENT", userId: "user-1" },
        { sentAt: NOW, status: "SENT", userId: "user-2" },
        { error: "socket exploded", status: "FAILED", userId: "user-3" },
      ],
    });

    await sendNotificationCampaign(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      retry.dependencies,
    );

    assert.deepEqual(
      retry.notifications.map((row) => row.userId),
      ["user-3"],
      "already delivered recipients must not receive a second notification",
    );
    assert.deepEqual(retry.emitted, ["user-3"]);
    assert.equal(retry.campaign.status, "SENT");
  });

  it("writes the campaign dedupe key and treats a unique violation as delivered", async () => {
    const harness = sendHarness({ rejectDuplicatesFor: ["user-2"] });

    await sendNotificationCampaign(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      harness.dependencies,
    );

    assert.deepEqual(
      harness.notifications.map((row) => row.dedupeKey),
      ["campaign:campaign-1:user-1", "campaign:campaign-1:user-3"],
    );
    assert.equal(harness.deliveries[1]?.status, "SENT");
    assert.equal(harness.deliveries[1]?.error, null);
    assert.deepEqual(harness.emitted, ["user-1", "user-3"]);
  });

  it("derives the counters from the delivery ledger instead of resetting them", async () => {
    const harness = sendHarness({
      campaign: { failedCount: 1, sentCount: 2, status: "FAILED" },
      deliveries: [
        { sentAt: NOW, status: "SENT", userId: "user-1" },
        { sentAt: NOW, status: "SENT", userId: "user-2" },
        { status: "PENDING", userId: "user-3" },
        { skipReason: "FREQUENCY_CAP", status: "SKIPPED", userId: "user-4" },
      ],
    });

    await sendNotificationCampaign(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      harness.dependencies,
    );

    assert.equal(harness.campaign.sentCount, 3);
    assert.equal(harness.campaign.failedCount, 0);
    assert.equal(harness.campaign.status, "SENT");
    assert.deepEqual(harness.audits, [
      {
        action: "notification_campaign.send",
        metadata: { failed: 0, pending: 0, sent: 3, skipped: 1 },
      },
    ]);
  });

  it("requires a second approval once the frozen audience passes the threshold", async () => {
    const harness = sendHarness();
    const audience = CAMPAIGN_APPROVAL_THRESHOLD + 1;

    await assert.rejects(
      sendNotificationCampaign(
        { adminUserId: "admin-1", campaignId: "campaign-1" },
        {
          ...harness.dependencies,
          freezeRecipients: async () => ({
            failed: 0,
            pending: audience,
            sent: 0,
            skipped: 0,
          }),
        },
      ),
      (error: unknown) =>
        error instanceof ApiError && error.status === 409 && error.code === "APPROVAL_REQUIRED",
    );

    assert.deepEqual(harness.notifications, []);
    assert.equal(harness.campaign.status, "PENDING_APPROVAL");
    assert.deepEqual(harness.audits, [
      {
        action: "notification_campaign.approval_required",
        metadata: { audienceSize: audience },
      },
    ]);
  });

  it("sends an approved oversized campaign", async () => {
    const harness = sendHarness({ campaign: { approvedAt: NOW, status: "PENDING_APPROVAL" } });

    await sendNotificationCampaign(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      {
        ...harness.dependencies,
        freezeRecipients: async () => ({
          failed: 0,
          pending: CAMPAIGN_APPROVAL_THRESHOLD + 1,
          sent: 0,
          skipped: 0,
        }),
      },
    );

    assert.equal(harness.notifications.length, 3);
    assert.equal(harness.campaign.status, "SENT");
  });

  it("refuses to send a campaign that is still waiting for approval", async () => {
    const harness = sendHarness({ campaign: { status: "PENDING_APPROVAL" } });

    await assert.rejects(
      sendNotificationCampaign(
        { adminUserId: "admin-1", campaignId: "campaign-1" },
        harness.dependencies,
      ),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );

    assert.deepEqual(harness.notifications, []);
  });

  it("refuses to resend a campaign that already completed", async () => {
    const harness = sendHarness({ campaign: { status: "SENT" } });

    await assert.rejects(
      sendNotificationCampaign(
        { adminUserId: "admin-1", campaignId: "campaign-1" },
        harness.dependencies,
      ),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  });
});
