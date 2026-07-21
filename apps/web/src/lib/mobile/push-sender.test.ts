import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_CATEGORY_INCOMING_CALL,
  sendMobilePushForNotifications,
  sendMobilePushToUsers,
  type MobilePushSenderDeps,
} from "./push-sender";

type SentRequest = { body: string; url: string };

function createDeps(options: {
  responses?: Array<{ body?: unknown; status?: number }>;
  tokens: Array<{ token: string; userId: string }>;
}) {
  const requests: SentRequest[] = [];
  const deletedTokens: string[][] = [];
  let call = 0;

  const deps: MobilePushSenderDeps = {
    db: {
      mobilePushToken: {
        deleteMany: async ({ where }: { where: { token: { in: string[] } } }) => {
          deletedTokens.push(where.token.in);
          return { count: where.token.in.length };
        },
        findMany: async () => options.tokens,
      },
    },
    fetchFn: (async (url: string, init: { body: string }) => {
      requests.push({ body: init.body, url });
      const response = options.responses?.[call] ?? {};
      call += 1;
      const status = response.status ?? 200;
      const body = response.body ?? {
        data: (JSON.parse(init.body) as unknown[]).map(() => ({ status: "ok" })),
      };
      return {
        json: async () => body,
        ok: status >= 200 && status < 300,
        status,
      };
    }) as unknown as typeof fetch,
    logError: () => undefined,
    sleep: async () => undefined,
  };

  return { deletedTokens, deps, requests };
}

describe("sendMobilePushToUsers", () => {
  it("does not call the Expo API when no tokens exist", async () => {
    const { deps, requests } = createDeps({ tokens: [] });
    const result = await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1"],
      },
      deps,
    );
    assert.equal(requests.length, 0);
    assert.deepEqual(result, { prunedTokens: 0, sentMessages: 0 });
  });

  it("chunks messages into batches of 100", async () => {
    const tokens = Array.from({ length: 150 }, (_, index) => ({
      token: `ExpoPushToken[${index}]`,
      userId: "u1",
    }));
    const { deps, requests } = createDeps({ tokens });
    const result = await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1"],
      },
      deps,
    );
    assert.equal(requests.length, 2);
    assert.equal((JSON.parse(requests[0]!.body) as unknown[]).length, 100);
    assert.equal((JSON.parse(requests[1]!.body) as unknown[]).length, 50);
    assert.equal(result.sentMessages, 150);
  });

  it("sends channelId, categoryId, priority and data on each message", async () => {
    const { deps, requests } = createDeps({
      tokens: [{ token: "ExpoPushToken[a]", userId: "u1" }],
    });
    await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.calls,
        body: "Incoming call",
        categoryId: MOBILE_PUSH_CATEGORY_INCOMING_CALL,
        data: { conversationId: "c1", kind: "dm-call" },
        priority: "high",
        title: "Ada",
        userIds: ["u1"],
      },
      deps,
    );
    const [message] = JSON.parse(requests[0]!.body) as Array<Record<string, unknown>>;
    assert.equal(message!.to, "ExpoPushToken[a]");
    assert.equal(message!.channelId, "whispr-calls");
    assert.equal(message!.categoryId, "incoming-call");
    assert.equal(message!.priority, "high");
    assert.equal(message!.sound, "default");
    assert.deepEqual(message!.data, { conversationId: "c1", kind: "dm-call" });
  });

  it("prunes tokens that come back DeviceNotRegistered", async () => {
    const { deletedTokens, deps } = createDeps({
      responses: [
        {
          body: {
            data: [
              { status: "ok" },
              { details: { error: "DeviceNotRegistered" }, message: "gone", status: "error" },
            ],
          },
        },
      ],
      tokens: [
        { token: "ExpoPushToken[alive]", userId: "u1" },
        { token: "ExpoPushToken[dead]", userId: "u2" },
      ],
    });
    const result = await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1", "u2"],
      },
      deps,
    );
    assert.deepEqual(deletedTokens, [["ExpoPushToken[dead]"]]);
    assert.equal(result.prunedTokens, 1);
  });

  it("retries once on a 5xx and never throws on failure", async () => {
    const { deps, requests } = createDeps({
      responses: [{ status: 502 }, { status: 502 }],
      tokens: [{ token: "ExpoPushToken[a]", userId: "u1" }],
    });
    const result = await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1"],
      },
      deps,
    );
    assert.equal(requests.length, 2);
    assert.equal(result.sentMessages, 0);
  });
});

describe("sendMobilePushForNotifications", () => {
  it("sends one localized message per notification row to that row's user", async () => {
    const { deps, requests } = createDeps({
      tokens: [
        { token: "ExpoPushToken[u1]", userId: "u1" },
        { token: "ExpoPushToken[u2]", userId: "u2" },
      ],
    });
    await sendMobilePushForNotifications(
      [
        {
          actionUrl: "/channels/@me/c1",
          body: "hello",
          id: "n1",
          title: "Ada",
          type: "DM",
          userId: "u1",
        },
        {
          actionUrl: "/channels/@me/c1",
          body: "merhaba",
          id: "n2",
          title: "Ada",
          type: "DM",
          userId: "u2",
        },
      ],
      deps,
    );
    const messages = JSON.parse(requests[0]!.body) as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    const bodies = messages.map((message) => [message.to, message.body]);
    assert.deepEqual(bodies.sort(), [
      ["ExpoPushToken[u1]", "hello"],
      ["ExpoPushToken[u2]", "merhaba"],
    ]);
    assert.deepEqual(messages[0]!.data, {
      actionUrl: "/channels/@me/c1",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
  });

  it("no-ops without notifications or tokens", async () => {
    const { deps, requests } = createDeps({ tokens: [] });
    const emptyInput = await sendMobilePushForNotifications([], deps);
    const noTokens = await sendMobilePushForNotifications(
      [{ actionUrl: null, body: "b", id: "n1", title: "t", type: "SYSTEM", userId: "u1" }],
      deps,
    );
    assert.equal(requests.length, 0);
    assert.deepEqual(emptyInput, { prunedTokens: 0, sentMessages: 0 });
    assert.deepEqual(noTokens, { prunedTokens: 0, sentMessages: 0 });
  });
});
