import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationType } from "@wizards/db";
import {
  CAMPAIGN_FREQUENCY_LIMIT,
  CAMPAIGN_FREQUENCY_WINDOW_MS,
  freezeCampaignRecipients,
  selectFrequencyCappedUserIds,
  type CampaignDeliveryDependencies,
  type CampaignDeliveryDraft,
} from "@/lib/admin/campaign-delivery";

const NOW = new Date("2026-07-27T12:00:00.000Z");

type CampaignRow = {
  frozenAt: Date | null;
  segment: unknown;
  type: NotificationType;
};

function harness(
  overrides: {
    campaign?: Partial<CampaignRow>;
    recentSendCounts?: Array<{ count: number; userId: string }>;
    recipientIds?: string[];
    stored?: CampaignDeliveryDraft[];
  } = {},
) {
  const campaign: CampaignRow = {
    frozenAt: null,
    segment: { type: "ALL_USERS" },
    type: "SYSTEM",
    ...overrides.campaign,
  };
  const stored: CampaignDeliveryDraft[] = [...(overrides.stored ?? [])];
  const calls: string[] = [];

  const dependencies: CampaignDeliveryDependencies = {
    countDeliveries: async () => {
      calls.push("count");
      return {
        failed: stored.filter((row) => row.status === "FAILED").length,
        pending: stored.filter((row) => row.status === "PENDING").length,
        sent: stored.filter((row) => row.status === "SENT").length,
        skipped: stored.filter((row) => row.status === "SKIPPED").length,
      };
    },
    countRecentDeliveries: async (userIds, since) => {
      calls.push(`recent:${since.toISOString()}:${userIds.length}`);
      return overrides.recentSendCounts ?? [];
    },
    findCampaign: async () => campaign,
    freeze: async (_campaignId, rows, frozenAt) => {
      calls.push(`freeze:${rows.length}`);
      stored.push(...rows);
      campaign.frozenAt = frozenAt;
    },
    resolveRecipientIds: async () => {
      calls.push("resolve");
      return overrides.recipientIds ?? ["user-1", "user-2", "user-3"];
    },
  };

  return { calls, campaign, dependencies, stored };
}

describe("campaign frequency cap", () => {
  it("caps a user who already received the daily maximum", () => {
    const capped = selectFrequencyCappedUserIds([
      { count: CAMPAIGN_FREQUENCY_LIMIT, userId: "user-1" },
      { count: CAMPAIGN_FREQUENCY_LIMIT - 1, userId: "user-2" },
      { count: CAMPAIGN_FREQUENCY_LIMIT + 3, userId: "user-3" },
    ]);

    assert.deepEqual([...capped].sort(), ["user-1", "user-3"]);
  });
});

describe("freezeCampaignRecipients", () => {
  it("resolves the segment once and writes a pending row per recipient", async () => {
    const { calls, campaign, dependencies, stored } = harness();

    const counts = await freezeCampaignRecipients("campaign-1", { dependencies, now: NOW });

    assert.deepEqual(counts, { failed: 0, pending: 3, sent: 0, skipped: 0 });
    assert.deepEqual(
      stored.map((row) => [row.userId, row.status, row.skipReason ?? null]),
      [
        ["user-1", "PENDING", null],
        ["user-2", "PENDING", null],
        ["user-3", "PENDING", null],
      ],
    );
    assert.equal(campaign.frozenAt?.toISOString(), NOW.toISOString());
    assert.deepEqual(
      calls.filter((call) => call === "resolve"),
      ["resolve"],
    );
  });

  it("records frequency-capped recipients as skipped instead of dropping them", async () => {
    const { dependencies, stored, calls } = harness({
      recentSendCounts: [{ count: CAMPAIGN_FREQUENCY_LIMIT, userId: "user-2" }],
    });

    const counts = await freezeCampaignRecipients("campaign-1", { dependencies, now: NOW });

    assert.deepEqual(counts, { failed: 0, pending: 2, sent: 0, skipped: 1 });
    assert.deepEqual(
      stored.find((row) => row.userId === "user-2"),
      {
        campaignId: "campaign-1",
        skipReason: "FREQUENCY_CAP",
        status: "SKIPPED",
        userId: "user-2",
      },
    );
    assert.ok(
      calls.includes(
        `recent:${new Date(NOW.getTime() - CAMPAIGN_FREQUENCY_WINDOW_MS).toISOString()}:3`,
      ),
      "frequency lookup must use the 24 hour window",
    );
  });

  it("exempts moderation campaigns from the frequency cap", async () => {
    const { calls, dependencies, stored } = harness({
      campaign: { type: "MODERATION" },
      recentSendCounts: [{ count: CAMPAIGN_FREQUENCY_LIMIT + 5, userId: "user-2" }],
    });

    const counts = await freezeCampaignRecipients("campaign-1", { dependencies, now: NOW });

    assert.deepEqual(counts, { failed: 0, pending: 3, sent: 0, skipped: 0 });
    assert.ok(stored.every((row) => row.status === "PENDING"));
    assert.ok(!calls.some((call) => call.startsWith("recent:")));
  });

  it("is idempotent once the list is frozen", async () => {
    const { calls, dependencies, stored } = harness({
      campaign: { frozenAt: new Date("2026-07-27T11:00:00.000Z") },
      stored: [
        { campaignId: "campaign-1", status: "SENT", userId: "user-1" },
        { campaignId: "campaign-1", status: "PENDING", userId: "user-2" },
      ],
    });

    const counts = await freezeCampaignRecipients("campaign-1", { dependencies, now: NOW });

    assert.deepEqual(counts, { failed: 0, pending: 1, sent: 1, skipped: 0 });
    assert.equal(stored.length, 2);
    assert.ok(!calls.includes("resolve"));
    assert.ok(!calls.some((call) => call.startsWith("freeze:")));
  });

  it("refuses to freeze a campaign that no longer exists", async () => {
    const { dependencies } = harness();

    await assert.rejects(
      freezeCampaignRecipients("missing", {
        dependencies: { ...dependencies, findCampaign: async () => null },
        now: NOW,
      }),
      /not found/iu,
    );
  });
});
