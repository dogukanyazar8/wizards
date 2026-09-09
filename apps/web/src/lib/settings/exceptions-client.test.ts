import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  canRemoveException,
  canUpdateException,
  fetchNotificationExceptions,
  NotificationExceptionUnsupportedError,
  removeException,
  updateException,
} from "@/lib/settings/exceptions-client";

/**
 * Ş4 §A2 kabulü: "Yeni yazma ucu açılmadı; `updateException` üç mevcut uca yönlendiriyor."
 *
 * Test ağı taklit ediyor ve **çağrılan adresi** doğruluyor — sözleşmenin kendisi adres.
 */

type RecordedCall = { body: unknown; method: string; url: string };

const originalFetch = globalThis.fetch;

function stubFetch(status = 200): RecordedCall[] {
  const calls: RecordedCall[] = [];

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      method: init?.method ?? "GET",
      url: String(input),
    });

    return Promise.resolve(
      new Response(JSON.stringify({ items: [], truncated: false }), {
        headers: { "Content-Type": "application/json" },
        status,
      }),
    );
  }) as typeof globalThis.fetch;

  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("okuma", () => {
  it("tek uçtan okur", async () => {
    const calls = stubFetch();

    assert.deepEqual(await fetchNotificationExceptions(), { items: [], truncated: false });
    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      ["GET /api/v1/users/me/notification-exceptions"],
    );
  });

  it("başarısız yanıtta hata verir", async () => {
    stubFetch(500);

    await assert.rejects(fetchNotificationExceptions(), /Failed to fetch/u);
  });
});

describe("yazma kendi kaynağına gider", () => {
  it("kanal düzeyini kanal ucuna yazar", async () => {
    const calls = stubFetch();

    await updateException("channel", "c1", { level: "mentions" });

    assert.deepEqual(calls, [
      {
        body: { level: "mentions" },
        method: "PATCH",
        url: "/api/v1/channels/c1/notification-settings",
      },
    ]);
  });

  it("kanalda `off` ucun `muted` düzeyine iner", async () => {
    const calls = stubFetch();

    await updateException("channel", "c1", { level: "off" });

    assert.deepEqual(calls[0]?.body, { level: "muted" });
  });

  it("DM düzeyini DM bildirim ucuna yazar", async () => {
    const calls = stubFetch();

    await updateException("dm", "d1", { level: "muted" });

    assert.deepEqual(calls, [
      { body: { notifyLevel: "NONE" }, method: "PATCH", url: "/api/v1/dm/d1/notify" },
    ]);
  });

  it("kimliği adres parçası olarak kaçırır", async () => {
    const calls = stubFetch();

    await updateException("dm", "d/1?x=1", { level: "all" });

    assert.equal(calls[0]?.url, "/api/v1/dm/d%2F1%3Fx%3D1/notify");
  });

  it("hiçbir çağrı yeni bir uca gitmez", async () => {
    const calls = stubFetch();

    await updateException("channel", "c1", { level: "all" });
    await updateException("dm", "d1", { level: "mentions" });

    for (const call of calls) {
      assert.ok(
        !call.url.includes("notification-exceptions"),
        `yazma okuma ucuna gitti: ${call.url}`,
      );
    }
  });

  it("başarısız yanıtta hata verir", async () => {
    stubFetch(403);

    await assert.rejects(updateException("dm", "d1", { level: "all" }), /Failed to update/u);
  });
});

describe("karşılığı olmayan yazmalar", () => {
  it("sunucu kapsamı için uç yok — TODO(api)", async () => {
    const calls = stubFetch();

    assert.equal(canUpdateException("server"), false);
    await assert.rejects(
      updateException("server", "s1", { level: "muted" }),
      NotificationExceptionUnsupportedError,
    );
    assert.deepEqual(calls, []);
  });

  it("`important` düzeyi hiçbir uçta yazılamaz", async () => {
    stubFetch();

    await assert.rejects(
      updateException("channel", "c1", { level: "important" }),
      NotificationExceptionUnsupportedError,
    );
    await assert.rejects(
      updateException("dm", "d1", { level: "important" }),
      NotificationExceptionUnsupportedError,
    );
  });

  it("kaldırma yalnız DM'de destekleniyor", async () => {
    const calls = stubFetch();

    assert.equal(canRemoveException("dm"), true);
    assert.equal(canRemoveException("channel"), false);
    assert.equal(canRemoveException("server"), false);

    await removeException("dm", "d1");

    assert.deepEqual(calls, [
      { body: { notifyLevel: "ALL" }, method: "PATCH", url: "/api/v1/dm/d1/notify" },
    ]);

    await assert.rejects(removeException("channel", "c1"), NotificationExceptionUnsupportedError);
    assert.equal(calls.length, 1);
  });
});
