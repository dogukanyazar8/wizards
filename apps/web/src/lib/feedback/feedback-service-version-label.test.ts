import assert from "node:assert/strict";
import test from "node:test";

import { createAdminRoadmapItem, listMobileFeedback } from "./feedback-service";

test("mobile feedback rows inherit the optional roadmap version label", async () => {
  const client = {
    feedback: {
      findMany: async () => [
        {
          createdAt: new Date("2026-07-26T10:00:00.000Z"),
          id: "feedback-1",
          message: "Sunucu seçicide arama olmalı.",
          publicNumber: 1284,
          rating: "GOOD",
          roadmapItem: { versionLabel: "v1.9" },
          status: "IN_PROGRESS",
          statusChangedAt: null,
          topic: "SUGGESTION",
        },
        {
          createdAt: new Date("2026-07-25T10:00:00.000Z"),
          id: "feedback-2",
          message: "Bağlantısız kayıt.",
          publicNumber: 1283,
          rating: "OKAY",
          roadmapItem: null,
          status: "REVIEWING",
          statusChangedAt: null,
          topic: "OTHER",
        },
      ],
    },
  } as unknown as NonNullable<Parameters<typeof listMobileFeedback>[1]>;

  const result = await listMobileFeedback("user-1", client);

  assert.deepEqual(
    result.items.map((item) => item.versionLabel),
    ["v1.9", null],
  );
});

test("admin roadmap creation stores and returns the bounded bare version label", async () => {
  let receivedVersionLabel: unknown;
  const client = {
    roadmapItem: {
      create: async ({ data }: { readonly data: { readonly versionLabel?: string | null } }) => {
        receivedVersionLabel = data.versionLabel;
        return {
          _count: { feedback: 0, votes: 0 },
          createdAt: new Date("2026-07-26T10:00:00.000Z"),
          description: null,
          featured: false,
          id: "roadmap-1",
          position: 0,
          status: "REVIEWING",
          title: "Sunucu seçicide arama",
          versionLabel: data.versionLabel ?? null,
        };
      },
    },
  } as unknown as NonNullable<Parameters<typeof createAdminRoadmapItem>[1]>;

  const result = await createAdminRoadmapItem(
    { title: "Sunucu seçicide arama", versionLabel: "v1.9" },
    client,
  );

  assert.equal(receivedVersionLabel, "v1.9");
  assert.equal(result.item.versionLabel, "v1.9");
});
