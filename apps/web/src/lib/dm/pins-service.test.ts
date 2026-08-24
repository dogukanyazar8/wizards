import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DM_PINNED_MESSAGE_MAX } from "@wizards/types";
import {
  listConversationPins,
  pinConversationMessage,
  unpinConversationMessage,
  type PinRow,
  type PinsServiceDependencies,
} from "./pins-service";

const NOW = new Date("2026-08-20T09:00:00.000Z");

function pinRow(messageId: string, message: Partial<PinRow["message"]> = {}): PinRow {
  return {
    messageId,
    pinnedAt: NOW,
    pinnedById: "user-1",
    message: {
      author: { displayName: "Selin Aksoy", username: "selin" },
      content: `${messageId} içeriği`,
      createdAt: NOW,
      deletedAt: null,
      expiresAt: null,
      ...message,
    },
  };
}

type Calls = {
  deleted: { conversationId: string; messageId: string }[];
  inserted: { conversationId: string; messageId: string; pinnedById: string }[];
};

function buildDependencies(overrides: Partial<PinsServiceDependencies> = {}): {
  calls: Calls;
  dependencies: PinsServiceDependencies;
} {
  const calls: Calls = { deleted: [], inserted: [] };

  const dependencies: PinsServiceDependencies = {
    deletePin: async (input) => {
      calls.deleted.push(input);
      return 1;
    },
    insertPin: async (input) => {
      calls.inserted.push(input);
    },
    loadContext: async () => ({ canPin: true, historyFromAt: null, isGroup: true }),
    loadPinnableMessage: async () => ({ createdAt: NOW }),
    loadPins: async () => [],
    now: () => NOW,
    ...overrides,
  };

  return { calls, dependencies };
}

describe("sabitlenenleri listeleme", () => {
  it("katılımcı olmayana varlık sızdırmayan 404 verir", async () => {
    const { dependencies } = buildDependencies({ loadContext: async () => null });

    await assert.rejects(
      () => listConversationPins("conv-1", "stranger", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
  });

  it("history ve expiry sınırlarını take öncesi load sorgusuna taşır", async () => {
    const historyFromAt = new Date("2026-08-10T00:00:00.000Z");
    const seen: unknown[] = [];
    const { dependencies } = buildDependencies({
      loadContext: async () => ({ canPin: true, historyFromAt, isGroup: true }),
      loadPins: async (input: unknown) => {
        seen.push(input);
        return [];
      },
    });

    await listConversationPins("conv-1", "user-1", dependencies);

    assert.deepEqual(seen, [{ conversationId: "conv-1", historyFromAt, now: NOW }]);
  });

  it("expired mesajı savunma katmanında da çizmez", async () => {
    const { dependencies } = buildDependencies({
      loadPins: async () => [pinRow("msg-expired", { expiresAt: NOW })],
    });

    assert.deepEqual(await listConversationPins("conv-1", "user-1", dependencies), []);
  });

  it("silinmiş mesajı çizmez", async () => {
    // Liste "silinmiş mesaj" yer tutucusu gösteriyor; şeritte alıntılamak
    // silinmiş içeriği ekrana geri koymak olurdu.
    const { dependencies } = buildDependencies({
      loadPins: async () => [pinRow("msg-1"), pinRow("msg-2", { deletedAt: NOW })],
    });

    const pins = await listConversationPins("conv-1", "user-1", dependencies);

    assert.deepEqual(
      pins.map((pin) => pin.messageId),
      ["msg-1"],
    );
  });

  it("geçmiş penceresinin öncesindeki sabiti gizler", async () => {
    // Sabitlenmiş olması, sonradan katılan üyenin okumasına izin verilmeyen bir
    // mesajı görünür kılmaz.
    const older = new Date("2026-08-01T09:00:00.000Z");
    const { dependencies } = buildDependencies({
      loadContext: async () => ({
        canPin: false,
        historyFromAt: new Date("2026-08-10T00:00:00.000Z"),
        isGroup: true,
      }),
      loadPins: async () => [pinRow("msg-new"), pinRow("msg-old", { createdAt: older })],
    });

    const pins = await listConversationPins("conv-1", "late-joiner", dependencies);

    assert.deepEqual(
      pins.map((pin) => pin.messageId),
      ["msg-new"],
    );
  });

  it("yetkisi olmayanda kaldırma bayrağı kapalıdır", async () => {
    const { dependencies } = buildDependencies({
      loadContext: async () => ({ canPin: false, historyFromAt: null, isGroup: true }),
      loadPins: async () => [pinRow("msg-1")],
    });

    const [pin] = await listConversationPins("conv-1", "member", dependencies);

    assert.equal(pin?.removable, false);
  });

  it("uzun içeriği kırpar ve tek satıra indirir", async () => {
    const { dependencies } = buildDependencies({
      loadPins: async () => [
        pinRow("msg-1", {
          author: { displayName: null, username: "selin" },
          content: `  çok   satırlı

${"a".repeat(200)}  `,
        }),
      ],
    });

    const [pin] = await listConversationPins("conv-1", "user-1", dependencies);

    assert.ok(pin);
    assert.equal(pin.excerpt.includes("\n"), false);
    assert.ok(pin.excerpt.endsWith("…"));
    // displayName yoksa kullanıcı adı gösterilir.
    assert.equal(pin.authorName, "selin");
  });
});

describe("sabitleme", () => {
  it("1:1 DM'de her iki taraf sabitleyebilir", async () => {
    const { calls, dependencies } = buildDependencies({
      loadContext: async () => ({ canPin: true, historyFromAt: null, isGroup: false }),
    });

    await pinConversationMessage("conv-1", "msg-1", "user-2", dependencies);

    assert.deepEqual(calls.inserted, [
      { conversationId: "conv-1", messageId: "msg-1", pinnedById: "user-2" },
    ]);
  });

  it("grupta yetkisi olmayanı reddeder", async () => {
    const { calls, dependencies } = buildDependencies({
      loadContext: async () => ({ canPin: false, historyFromAt: null, isGroup: true }),
    });

    await assert.rejects(
      () => pinConversationMessage("conv-1", "msg-1", "member", dependencies),
      (error: { status?: number }) => {
        assert.equal(error.status, 403);
        return true;
      },
    );
    assert.deepEqual(calls.inserted, []);
  });

  it("başka konuşmanın mesajını sabitlemez", async () => {
    // Yabancı bir mesaj kimliği, üyelerin okumasına izin verilmeyen içeriği
    // sabitlerdi; foreign key bunu memnuniyetle kabul ederdi.
    const { dependencies } = buildDependencies({ loadPinnableMessage: async () => null });

    await assert.rejects(
      () => pinConversationMessage("conv-1", "msg-elsewhere", "user-1", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
  });

  it("history ve expiry sınırlarını sabitlenebilir mesaj sorgusuna taşır", async () => {
    const historyFromAt = new Date("2026-08-10T00:00:00.000Z");
    const seen: unknown[] = [];
    const { dependencies } = buildDependencies({
      loadContext: async () => ({ canPin: true, historyFromAt, isGroup: true }),
      loadPinnableMessage: async (input) => {
        seen.push(input);
        return null;
      },
    });

    await assert.rejects(() => pinConversationMessage("conv-1", "msg-old", "user-1", dependencies));
    assert.deepEqual(seen, [
      { conversationId: "conv-1", historyFromAt, messageId: "msg-old", now: NOW },
    ]);
  });

  it("tavanda yeni sabit kabul etmez", async () => {
    const full = Array.from({ length: DM_PINNED_MESSAGE_MAX }, (_unused, index) =>
      pinRow(`msg-${index}`),
    );
    const { calls, dependencies } = buildDependencies({ loadPins: async () => full });

    await assert.rejects(
      () => pinConversationMessage("conv-1", "msg-new", "user-1", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, "PINS_FULL");
        return true;
      },
    );
    assert.deepEqual(calls.inserted, []);
  });

  it("tavanda zaten sabitli mesajı yeniden sabitlemeyi reddetmez", async () => {
    // Hiçbir şey eklenmiyor; tavan bir ekleme kuralıdır, bir yazma yasağı değil.
    const full = Array.from({ length: DM_PINNED_MESSAGE_MAX }, (_unused, index) =>
      pinRow(`msg-${index}`),
    );
    const { calls, dependencies } = buildDependencies({ loadPins: async () => full });

    await pinConversationMessage("conv-1", "msg-0", "user-1", dependencies);

    assert.equal(calls.inserted.length, 1);
  });
});

describe("sabitlemeyi kaldırma", () => {
  it("sabitli olmayan mesajda 404 verir", async () => {
    const { dependencies } = buildDependencies({ deletePin: async () => 0 });

    await assert.rejects(
      () => unpinConversationMessage("conv-1", "msg-1", "user-1", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
  });

  it("yetkisi olmayan kaldıramaz", async () => {
    const { calls, dependencies } = buildDependencies({
      loadContext: async () => ({ canPin: false, historyFromAt: null, isGroup: true }),
    });

    await assert.rejects(() => unpinConversationMessage("conv-1", "msg-1", "member", dependencies));
    assert.deepEqual(calls.deleted, []);
  });

  it("expired, deleted veya history dışı hedefi kaldırmaz", async () => {
    const { calls, dependencies } = buildDependencies({ loadPinnableMessage: async () => null });

    await assert.rejects(
      () => unpinConversationMessage("conv-1", "msg-hidden", "user-1", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
    assert.deepEqual(calls.deleted, []);
  });

  it("kaldırdıktan sonra kalan listeyi döndürür", async () => {
    let removed = false;
    const { dependencies } = buildDependencies({
      deletePin: async () => {
        removed = true;
        return 1;
      },
      loadPins: async () => (removed ? [pinRow("msg-2")] : []),
    });

    const pins = await unpinConversationMessage("conv-1", "msg-1", "user-1", dependencies);

    assert.deepEqual(
      pins.map((pin) => pin.messageId),
      ["msg-2"],
    );
  });
});
