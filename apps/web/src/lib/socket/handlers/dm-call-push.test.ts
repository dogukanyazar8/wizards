import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobilePushSenderDeps } from "@/lib/mobile/push-sender";

import { sendDMCallPush } from "./dm";

function createDeps(tokens: Array<{ token: string; userId: string }>) {
  const pushAttempts: unknown[] = [];
  const requests: string[] = [];

  const deps: MobilePushSenderDeps = {
    db: {
      mobilePushToken: {
        deleteMany: async () => ({ count: 0 }),
        findMany: async () => tokens.map((entry) => ({ platform: "android", ...entry })),
      },
      pushDeliveryAttempt: {
        createMany: async ({ data }: { data: unknown[] }) => {
          pushAttempts.push(...data);
          return { count: data.length };
        },
      },
    },
    fetchFn: (async (_url: string, init: { body: string }) => {
      requests.push(init.body);
      return {
        json: async () => ({
          data: (JSON.parse(init.body) as unknown[]).map(() => ({ status: "ok" })),
        }),
        ok: true,
        status: 200,
      };
    }) as unknown as typeof fetch,
    logError: () => undefined,
    sleep: async () => undefined,
  };

  return { deps, requests };
}

describe("sendDMCallPush", () => {
  it("rings each callee on the calls channel with a localized body", async () => {
    const { deps, requests } = createDeps([{ token: "ExpoPushToken[callee]", userId: "callee-1" }]);

    await sendDMCallPush({
      callerName: "Ada",
      callerUserId: "caller-1",
      conversationId: "conversation-1",
      deps,
      recipients: [{ locale: "tr", userId: "callee-1" }],
      ringTtlMs: 45_000,
      video: true,
    });

    assert.equal(requests.length, 1);
    const [message] = JSON.parse(requests[0]!) as Array<Record<string, unknown>>;
    assert.equal(message!.to, "ExpoPushToken[callee]");
    assert.equal(message!.channelId, "whispr-calls");
    assert.equal(message!.categoryId, "incomingcall");
    assert.equal(message!.priority, "high");
    assert.equal(message!.title, "Ada");
    assert.equal(message!.body, "Gelen görüntülü arama");
    assert.deepEqual(message!.data, {
      callType: "video",
      conversationId: "conversation-1",
      fromUserId: "caller-1",
      kind: "dm-call",
      ringTtlMs: "45000",
    });
  });

  it("uses the voice body for audio-only calls and falls back to English", async () => {
    const { deps, requests } = createDeps([{ token: "ExpoPushToken[callee]", userId: "callee-1" }]);

    await sendDMCallPush({
      callerName: "Ada",
      callerUserId: "caller-1",
      conversationId: "conversation-1",
      deps,
      recipients: [{ locale: null, userId: "callee-1" }],
      ringTtlMs: 45_000,
      video: false,
    });

    const [message] = JSON.parse(requests[0]!) as Array<Record<string, unknown>>;
    assert.equal(message!.body, "Incoming voice call");
    assert.deepEqual((message!.data as Record<string, unknown>).callType, "voice");
  });
});
