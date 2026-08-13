import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CampaignSendPayloadSchema,
  enqueueCampaignSendJob,
  OUTBOX_JOB_TYPES,
  processCampaignSendJob,
  type CampaignSendJobDependencies,
} from "@/lib/outbox/service";
import { NotificationCampaignCreateRequestSchema } from "@/lib/admin/notification-campaign-input";

const TOMORROW = new Date("2026-07-28T09:00:00.000Z");

function jobDependencies(status: string | null) {
  const sends: Array<{ adminUserId: string; campaignId: string }> = [];

  const dependencies: CampaignSendJobDependencies = {
    findCampaignStatus: async () => (status === null ? null : { status }),
    sendCampaign: async (args) => {
      sends.push(args);
      return {};
    },
  };

  return { dependencies, sends };
}

describe("scheduled campaign job", () => {
  it("requeues a terminal campaign job when an admin retries the campaign", async () => {
    const updates: Array<{ data: Record<string, unknown>; where: unknown }> = [];
    let upserts = 0;

    await enqueueCampaignSendJob(
      {
        outboxJob: {
          updateMany: async (args: never) => {
            updates.push(args as unknown as { data: Record<string, unknown>; where: unknown });
            return { count: 1 };
          },
          upsert: async () => {
            upserts += 1;
            return {};
          },
        },
      } as never,
      { adminUserId: "admin-1", campaignId: "campaign-1", scheduledAt: TOMORROW },
    );

    assert.equal(upserts, 0);
    assert.deepEqual(updates[0]?.where, {
      idempotencyKey: "campaign-send:campaign-1",
      status: { in: ["COMPLETED", "FAILED"] },
    });
    assert.equal(updates[0]?.data.status, "PENDING");
    assert.equal(updates[0]?.data.availableAt, TOMORROW);
  });

  it("books the send for its scheduled instant rather than sending now", async () => {
    const upserts: Array<{ create: Record<string, unknown>; where: unknown }> = [];

    await enqueueCampaignSendJob(
      {
        outboxJob: {
          upsert: async (args: never) => {
            upserts.push(args as unknown as { create: Record<string, unknown>; where: unknown });
            return {};
          },
        },
      } as never,
      { adminUserId: "admin-1", campaignId: "campaign-1", scheduledAt: TOMORROW },
    );

    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.create.availableAt, TOMORROW);
    assert.equal(upserts[0]?.create.type, OUTBOX_JOB_TYPES.campaignSend);
    assert.deepEqual(upserts[0]?.create.payload, {
      adminUserId: "admin-1",
      campaignId: "campaign-1",
    });
  });

  it("sends when the drain finally reaches the job", async () => {
    const { dependencies, sends } = jobDependencies("DRAFT");

    const result = await processCampaignSendJob(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      dependencies,
    );

    assert.deepEqual(result, { skipped: false });
    assert.deepEqual(sends, [{ adminUserId: "admin-1", campaignId: "campaign-1" }]);
  });

  it("skips a campaign that was cancelled after it was booked", async () => {
    const { dependencies, sends } = jobDependencies("CANCELLED");

    const result = await processCampaignSendJob(
      { adminUserId: "admin-1", campaignId: "campaign-1" },
      dependencies,
    );

    assert.deepEqual(result, { skipped: true });
    assert.deepEqual(sends, []);
  });

  it("skips a campaign that no longer exists", async () => {
    const { dependencies, sends } = jobDependencies(null);

    assert.deepEqual(
      await processCampaignSendJob({ adminUserId: "admin-1", campaignId: "gone" }, dependencies),
      { skipped: true },
    );
    assert.deepEqual(sends, []);
  });

  it("keeps the payload minimal enough to survive a redeploy", () => {
    assert.deepEqual(
      CampaignSendPayloadSchema.parse({
        adminUserId: "admin-1",
        campaignId: "campaign-1",
        extra: "ignored",
      }),
      { adminUserId: "admin-1", campaignId: "campaign-1" },
    );
  });
});

describe("campaign scheduling input", () => {
  it("refuses a campaign that is both sent now and booked for later", () => {
    const parsed = NotificationCampaignCreateRequestSchema.safeParse({
      body: "b",
      scheduledAt: TOMORROW.toISOString(),
      segment: { type: "ALL_USERS" },
      sendNow: true,
      title: "t",
    });

    assert.equal(parsed.success, false);
  });

  it("accepts a booking on its own", () => {
    const parsed = NotificationCampaignCreateRequestSchema.safeParse({
      body: "b",
      scheduledAt: TOMORROW.toISOString(),
      segment: { type: "ALL_USERS" },
      title: "t",
    });

    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.scheduledAt?.toISOString(), TOMORROW.toISOString());
  });
});
