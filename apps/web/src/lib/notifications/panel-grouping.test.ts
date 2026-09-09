import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppNotification } from "@wizards/types";

import { groupNotificationsByDay, resolveNotifDayBucket } from "@/lib/notifications/panel-grouping";

function notification(id: string, createdAt: string): AppNotification {
  return { body: "", createdAt, id, kind: "system", read: false, title: id };
}

describe("bildirim paneli — gün kovası", () => {
  it("izleyicinin saat diliminde hesaplanır (tuzak #7)", () => {
    // 24 Ağustos 23:30 Istanbul = 20:30 UTC. Aynı an New York'ta 24 Ağustos 16:30.
    const createdAt = new Date("2026-08-24T20:30:00.000Z");
    const now = new Date("2026-08-25T06:00:00.000Z"); // Istanbul 09:00, New York 02:00.

    assert.equal(
      resolveNotifDayBucket(createdAt, { now, timeZone: "Europe/Istanbul" }),
      "yesterday",
    );
    // New York'ta `now` hâlâ 25 Ağustos 02:00, kayıt ise 24 Ağustos 16:30 → yine dün.
    assert.equal(
      resolveNotifDayBucket(createdAt, { now, timeZone: "America/New_York" }),
      "yesterday",
    );
  });

  it("aynı an iki bölgede farklı kovaya düşebilir", () => {
    // 25 Ağustos 02:30 Istanbul = 24 Ağustos 23:30 UTC = 24 Ağustos 19:30 New York.
    const createdAt = new Date("2026-08-24T23:30:00.000Z");
    const now = new Date("2026-08-25T05:00:00.000Z"); // Istanbul 08:00, New York 01:00.

    assert.equal(resolveNotifDayBucket(createdAt, { now, timeZone: "Europe/Istanbul" }), "today");
    assert.equal(
      resolveNotifDayBucket(createdAt, { now, timeZone: "America/New_York" }),
      "yesterday",
    );
  });

  it("iki günden eskisi `older`", () => {
    assert.equal(
      resolveNotifDayBucket(new Date("2026-08-20T09:00:00.000Z"), {
        now: new Date("2026-08-24T09:00:00.000Z"),
        timeZone: "Europe/Istanbul",
      }),
      "older",
    );
  });

  it("ileri tarihli satır `today` sayılır, listenin dibine gönderilmez", () => {
    assert.equal(
      resolveNotifDayBucket(new Date("2026-08-26T09:00:00.000Z"), {
        now: new Date("2026-08-24T09:00:00.000Z"),
        timeZone: "Europe/Istanbul",
      }),
      "today",
    );
  });

  it("tanınmayan saat dilimi UTC'ye düşer, atmaz", () => {
    assert.equal(
      resolveNotifDayBucket(new Date("2026-08-24T09:00:00.000Z"), {
        now: new Date("2026-08-24T09:00:00.000Z"),
        timeZone: "Mars/Olympus",
      }),
      "today",
    );
  });
});

describe("bildirim paneli — gruplama", () => {
  const options = { now: new Date("2026-08-24T12:00:00.000Z"), timeZone: "Europe/Istanbul" };

  it("etiket enum döner, Türkçe metin değil", () => {
    const groups = groupNotificationsByDay(
      [notification("n1", "2026-08-24T06:41:00.000Z")],
      options,
    );

    assert.deepEqual(
      groups.map((group) => group.label),
      ["today"],
    );
  });

  it("kovalar bugün → dün → daha eski sırasında çizilir", () => {
    const groups = groupNotificationsByDay(
      [
        notification("n5", "2026-08-18T18:30:00.000Z"),
        notification("n1", "2026-08-24T06:41:00.000Z"),
        notification("n3", "2026-08-23T13:05:00.000Z"),
      ],
      options,
    );

    assert.deepEqual(
      groups.map((group) => group.label),
      ["today", "yesterday", "older"],
    );
  });

  it("boş kova çizilmez (panel ilk sayfada `older` yoksa göstermez)", () => {
    const groups = groupNotificationsByDay(
      [notification("n1", "2026-08-24T06:41:00.000Z")],
      options,
    );

    assert.equal(groups.length, 1);
  });

  it("grup içi sıra girişin sırasıdır", () => {
    const groups = groupNotificationsByDay(
      [
        notification("n1", "2026-08-24T06:41:00.000Z"),
        notification("n2", "2026-08-24T06:18:00.000Z"),
        notification("n3", "2026-08-24T05:52:00.000Z"),
      ],
      options,
    );

    assert.deepEqual(
      groups[0]?.items.map((item) => item.id),
      ["n1", "n2", "n3"],
    );
  });

  it("ayrıştırılamayan damga satırı düşürmez", () => {
    const groups = groupNotificationsByDay([notification("n1", "bozuk")], options);

    assert.deepEqual(
      groups.map((group) => group.label),
      ["today"],
    );
    assert.equal(groups[0]?.items.length, 1);
  });

  it("referans NOTIFS dizisinin iki grubu yeniden üretilir", () => {
    // `Ayarlar-referans.dc.html` altı kayıt taşıyor: dördü `Bugün`, ikisi `Dün`.
    const groups = groupNotificationsByDay(
      [
        notification("n1", "2026-08-24T06:41:00.000Z"),
        notification("n2", "2026-08-24T06:18:00.000Z"),
        notification("n3", "2026-08-24T05:52:00.000Z"),
        notification("n4", "2026-08-24T11:45:00.000Z"),
        notification("n5", "2026-08-23T18:30:00.000Z"),
        notification("n6", "2026-08-23T13:05:00.000Z"),
      ],
      options,
    );

    assert.deepEqual(
      groups.map((group) => [group.label, group.items.length]),
      [
        ["today", 4],
        ["yesterday", 2],
      ],
    );
  });
});
