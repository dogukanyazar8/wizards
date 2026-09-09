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

/**
 * Ş13 — `filterEligible` varsayılan olarak **geçirir**.
 *
 * Gönderici artık `delivery.push` kapısını kendi içinde uyguluyor (borç B1) ve varsayılan
 * süzgeç veritabanına gider; bu dosyanın konusu kapı değil, gönderim yolu. Kapının kendi
 * davranışı aşağıda ayrı bir bloktta ölçülüyor.
 */
function createDeps(options: {
  blockedUserIds?: readonly string[];
  responses?: Array<{ body?: unknown; status?: number }>;
  tokens: Array<{ platform?: string; token: string; userId: string }>;
}) {
  const requests: SentRequest[] = [];
  const deletedTokens: string[][] = [];
  const loggedErrors: Array<{ error: unknown; scope: string }> = [];
  const pushAttempts: unknown[] = [];
  let call = 0;

  const deps: MobilePushSenderDeps = {
    db: {
      mobilePushToken: {
        deleteMany: async ({ where }: { where: { token: { in: string[] } } }) => {
          deletedTokens.push(where.token.in);
          return { count: where.token.in.length };
        },
        findMany: async () =>
          options.tokens.map((entry) => ({ platform: entry.platform ?? "android", ...entry })),
      },
      pushDeliveryAttempt: {
        createMany: async ({ data }: { data: unknown[] }) => {
          pushAttempts.push(...data);
          return { count: data.length };
        },
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
    filterEligible: async (userIds) =>
      new Set(userIds.filter((userId) => !(options.blockedUserIds ?? []).includes(userId))),
    logError: (scope, error) => {
      loggedErrors.push({ error, scope });
    },
    sleep: async () => undefined,
  };

  return { deletedTokens, deps, loggedErrors, pushAttempts, requests };
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
    assert.equal(message!.categoryId, "incomingcall");
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
          actionUrl: "/messages/c1",
          body: "hello",
          id: "n1",
          title: "Ada",
          type: "DM",
          userId: "u1",
        },
        {
          actionUrl: "/messages/c1",
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
      actionUrl: "/messages/c1",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
  });

  /**
   * Borç B1'in kabulü: kapı **her** çağıranda çalışır, çünkü göndericinin kendisinde.
   * Kapalı diyen alıcı için token bile okunmaz.
   */
  it("delivery.push kapalı olan alıcıya hiç istek çıkmıyor ve token okunmuyor", async () => {
    const { deps, requests } = createDeps({
      blockedUserIds: ["u2"],
      tokens: [
        { token: "ExpoPushToken[u1]", userId: "u1" },
        { token: "ExpoPushToken[u2]", userId: "u2" },
      ],
    });

    await sendMobilePushForNotifications(
      [
        { actionUrl: null, body: "a", id: "n1", title: "t", type: "DM", userId: "u1" },
        { actionUrl: null, body: "b", id: "n2", title: "t", type: "DM", userId: "u2" },
      ],
      deps,
    );

    const messages = JSON.parse(requests[0]!.body) as Array<Record<string, unknown>>;

    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.to, "ExpoPushToken[u1]");
  });

  it("herkes kapalıysa token hiç okunmuyor", async () => {
    let tokenReads = 0;
    const { deps, requests } = createDeps({
      blockedUserIds: ["u1"],
      tokens: [{ token: "ExpoPushToken[u1]", userId: "u1" }],
    });
    const db = deps.db as unknown as {
      mobilePushToken: { findMany: () => Promise<unknown[]> };
    };
    const original = db.mobilePushToken.findMany;

    db.mobilePushToken.findMany = async () => {
      tokenReads += 1;
      return original();
    };

    const result = await sendMobilePushForNotifications(
      [{ actionUrl: null, body: "a", id: "n1", title: "t", type: "DM", userId: "u1" }],
      deps,
    );

    assert.equal(tokenReads, 0);
    assert.equal(requests.length, 0);
    assert.deepEqual(result, { prunedTokens: 0, sentMessages: 0 });
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

describe("push ticket telemetry", () => {
  it("records and logs a batch rejected by Expo", async () => {
    const { deps, loggedErrors, pushAttempts } = createDeps({
      responses: [{ status: 400 }],
      tokens: [{ platform: "android", token: "ExpoPushToken[a]", userId: "u1" }],
    });

    await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1"],
      },
      deps,
    );

    assert.deepEqual(pushAttempts, [
      {
        errorCode: "ExpoHttp400",
        notificationId: null,
        platform: "android",
        stage: "TICKET",
        success: false,
        ticketId: null,
        userId: "u1",
      },
    ]);
    assert.equal(loggedErrors.length, 1);
    assert.equal(loggedErrors[0]?.scope, "mobile_push_batch_rejected");
  });

  it("records one accepted attempt per message with the device platform", async () => {
    const { deps, pushAttempts } = createDeps({
      responses: [{ body: { data: [{ id: "ticket-1", status: "ok" }] } }],
      tokens: [{ platform: "ios", token: "ExpoPushToken[a]", userId: "u1" }],
    });

    await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1"],
      },
      deps,
    );

    assert.deepEqual(pushAttempts, [
      {
        errorCode: null,
        notificationId: null,
        platform: "ios",
        stage: "TICKET",
        success: true,
        ticketId: "ticket-1",
        userId: "u1",
      },
    ]);
  });

  it("records the Expo error code and still prunes the dead token", async () => {
    const { deletedTokens, deps, pushAttempts } = createDeps({
      responses: [
        {
          body: {
            data: [{ details: { error: "DeviceNotRegistered" }, status: "error" }],
          },
        },
      ],
      tokens: [{ platform: "android", token: "ExpoPushToken[dead]", userId: "u1" }],
    });

    await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        body: "b",
        data: { kind: "notification" },
        title: "t",
        userIds: ["u1"],
      },
      deps,
    );

    assert.deepEqual(pushAttempts, [
      {
        errorCode: "DeviceNotRegistered",
        notificationId: null,
        platform: "android",
        stage: "TICKET",
        success: false,
        ticketId: null,
        userId: "u1",
      },
    ]);
    assert.deepEqual(deletedTokens, [["ExpoPushToken[dead]"]]);
  });

  it("keeps the notification id so a receipt can be matched back to the row", async () => {
    const { deps, pushAttempts } = createDeps({
      responses: [{ body: { data: [{ id: "ticket-9", status: "ok" }] } }],
      tokens: [{ platform: "android", token: "ExpoPushToken[a]", userId: "u1" }],
    });

    await sendMobilePushForNotifications(
      [
        {
          actionUrl: null,
          body: "b",
          id: "notification-1",
          title: "t",
          type: "MENTION",
          userId: "u1",
        },
      ],
      deps,
    );

    assert.equal((pushAttempts[0] as { notificationId: string }).notificationId, "notification-1");
  });
});
