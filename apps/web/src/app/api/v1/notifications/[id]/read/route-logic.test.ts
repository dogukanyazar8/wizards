import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  notificationReadRoute,
  type NotificationReadRouteDependencies,
} from "@/app/api/v1/notifications/[id]/read/route-logic";

const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000001";
const COUNTS = { all: 2, mentions: 1, replies: 0, system: 1 };

function createDependencies(
  overrides: Partial<NotificationReadRouteDependencies> = {},
): NotificationReadRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => {},
    setRead: async () => COUNTS,
    ...overrides,
  };
}

function request(body?: unknown, method = "POST") {
  return new Request(`https://whispr.test/api/v1/notifications/${NOTIFICATION_ID}/read`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

describe("POST /api/v1/notifications/[id]/read", () => {
  it("gövdesiz çağrı `{ read: true }` gibi davranır (eski istemci)", async () => {
    const calls: [string, string, boolean][] = [];
    const response = await notificationReadRoute(
      request(undefined, "PATCH"),
      { id: NOTIFICATION_ID },
      createDependencies({
        setRead: async (userId, id, read) => {
          calls.push([userId, id, read]);
          return COUNTS;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [["user-1", NOTIFICATION_ID, true]]);
  });

  it("`{ read: false }` okunmuşu okunmamışa çevirir", async () => {
    const calls: boolean[] = [];
    const response = await notificationReadRoute(
      request({ read: false }),
      { id: NOTIFICATION_ID },
      createDependencies({
        setRead: async (_userId, _id, read) => {
          calls.push(read);
          return COUNTS;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [false]);
    assert.deepEqual(await response.json(), { counts: COUNTS, read: false });
  });

  it("yanıt güncel sayacı taşır — istemci ikinci istek atmaz", async () => {
    const response = await notificationReadRoute(
      request({ read: true }),
      { id: NOTIFICATION_ID },
      createDependencies(),
    );

    assert.deepEqual(await response.json(), { counts: COUNTS, read: true });
  });

  it("kimliği UUID olmayan satır 400 döner", async () => {
    const response = await notificationReadRoute(
      request({ read: true }),
      { id: "not-a-uuid" },
      createDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("`read` boolean değilse 400 döner", async () => {
    const response = await notificationReadRoute(
      request({ read: "evet" }),
      { id: NOTIFICATION_ID },
      createDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("kimlik bütçeden, bütçe yazmadan önce çözülür", async () => {
    const order: string[] = [];
    await notificationReadRoute(
      request({ read: true }),
      { id: NOTIFICATION_ID },
      createDependencies({
        authenticate: async () => {
          order.push("auth");
          return "user-1";
        },
        enforceRateLimit: async () => {
          order.push("rate");
        },
        setRead: async () => {
          order.push("write");
          return COUNTS;
        },
      }),
    );

    assert.deepEqual(order, ["auth", "rate", "write"]);
  });
});
