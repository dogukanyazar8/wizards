import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processScheduledEventCreatedNotificationsJob,
  processScheduledEventReminderJob,
  ScheduledEventCreatedNotificationsPayloadSchema,
  ScheduledEventReminderPayloadSchema,
  type EventNotificationDependencies,
} from "./notifications";

const EVENT_ID = "evt-1";
const USER_ID = "user-1";
const START = new Date("2026-09-01T15:00:00.000Z");
const NOW = new Date("2026-09-01T14:50:00.000Z");

type Written = { body: string; dedupeKey: string; title: string; type: string; userId: string };

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    channelId: "chn-1",
    creatorId: "owner-1",
    id: EVENT_ID,
    name: "Tasarım Kritiği",
    scheduledStartAt: START,
    server: { id: "srv-1", name: "Whispr Topluluğu" },
    serverId: "srv-1",
    status: "SCHEDULED" as const,
    ...overrides,
  };
}

function dependencies(
  overrides: {
    event?: ReturnType<typeof eventRow> | null;
    members?: { user: { id: string; locale: string | null } }[];
    reminder?: { enabled: boolean; minutesBefore: number } | null;
    settings?: { eventNotifications: boolean; userId: string }[];
    user?: { locale: string | null } | null;
  } = {},
) {
  const written: Written[] = [];
  const pushed: string[] = [];

  const deps: EventNotificationDependencies = {
    createNotifications: (rows) => {
      const created = rows.map((row, index) => ({
        ...row,
        id: `ntf-${written.length + index}`,
      }));
      written.push(
        ...created.map((row) => ({
          body: row.body,
          dedupeKey: row.dedupeKey,
          title: row.title,
          type: row.type,
          userId: row.userId,
        })),
      );
      return Promise.resolve(created);
    },
    findEvent: () => Promise.resolve(overrides.event === undefined ? eventRow() : overrides.event),
    findReminder: () =>
      Promise.resolve(
        overrides.reminder === undefined
          ? { enabled: true, minutesBefore: 10 }
          : overrides.reminder,
      ),
    findUser: () =>
      Promise.resolve(overrides.user === undefined ? { locale: "tr" } : overrides.user),
    listNotifiableMemberIds: () =>
      Promise.resolve((overrides.members ?? []).map((member) => member.user)),
    now: () => NOW,
    push: (rows) => {
      pushed.push(...rows.map((row) => row.userId));
      return Promise.resolve();
    },
    readEventNotificationsEnabled: (userIds) =>
      Promise.resolve(
        new Set(
          (overrides.settings ?? [])
            .filter((row) => !row.eventNotifications)
            .map((row) => row.userId)
            .filter((userId) => userIds.includes(userId)),
        ),
      ),
  };

  return { deps, pushed, written };
}

describe("events notifications — hatırlatma işleyicisi", () => {
  it("yükü doğrular", () => {
    assert.deepEqual(
      ScheduledEventReminderPayloadSchema.parse({
        eventId: EVENT_ID,
        minutesBefore: 10,
        userId: USER_ID,
      }),
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
    );
  });

  it("bildirim satırı yazar ve push gönderir", async () => {
    const { deps, pushed, written } = dependencies();

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
      deps,
    );

    assert.equal(written.length, 1);
    assert.equal(written[0]?.title, "Etkinlik yaklaşıyor");
    assert.equal(written[0]?.body, "Tasarım Kritiği başlamasına 10 dk kaldı");
    // Aynı anahtarla ikinci kez drenaj eden bir iş satırı çoğaltmaz.
    assert.equal(written[0]?.dedupeKey, `event-reminder:${EVENT_ID}:${USER_ID}:${START.getTime()}`);
    assert.deepEqual(pushed, [USER_ID]);
  });

  it("kullanıcının dilinde yazar", async () => {
    const { deps, written } = dependencies({
      reminder: { enabled: true, minutesBefore: 30 },
      user: { locale: "en" },
    });

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 30, userId: USER_ID },
      deps,
    );

    assert.equal(written[0]?.title, "Event starting soon");
    assert.equal(written[0]?.body, "Tasarım Kritiği starts in 30 min");
  });

  it("teslim anındaki tercih kazanır, yükteki bayat dakika değil", async () => {
    // Kullanıcı iş yazıldıktan sonra 10'dan 30'a çekti; iş yeniden zamanlandı ama metin yine
    // satırdan okunur — yükteki sayı bir yedek, otorite değil.
    const { deps, written } = dependencies({ reminder: { enabled: true, minutesBefore: 30 } });

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
      deps,
    );

    assert.equal(written[0]?.body, "Tasarım Kritiği başlamasına 30 dk kaldı");
  });

  it("iptal edilmiş etkinlik için hiçbir şey yazmaz", async () => {
    const { deps, written } = dependencies({ event: eventRow({ status: "CANCELLED" }) });

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
      deps,
    );

    assert.deepEqual(written, []);
  });

  it("silinmiş etkinlik için hiçbir şey yazmaz", async () => {
    const { deps, written } = dependencies({ event: null });

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
      deps,
    );

    assert.deepEqual(written, []);
  });

  it("hatırlatma arada kapatıldıysa yazmaz — kuyruktaki iş tercihi geçersiz kılamaz", async () => {
    const { deps, written } = dependencies({ reminder: { enabled: false, minutesBefore: 10 } });

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
      deps,
    );

    assert.deepEqual(written, []);
  });

  it("eventNotifications arada kapatıldıysa yazmaz", async () => {
    const { deps, written } = dependencies({
      settings: [{ eventNotifications: false, userId: USER_ID }],
    });

    await processScheduledEventReminderJob(
      { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
      deps,
    );

    assert.deepEqual(written, []);
  });
});

describe("events notifications — oluşturma fan-out'u", () => {
  it("yükü doğrular", () => {
    assert.deepEqual(ScheduledEventCreatedNotificationsPayloadSchema.parse({ eventId: EVENT_ID }), {
      eventId: EVENT_ID,
    });
  });

  it("sahibi dışındaki üyelere yazar", async () => {
    const { deps, pushed, written } = dependencies({
      members: [
        { user: { id: "member-1", locale: "tr" } },
        { user: { id: "member-2", locale: "en" } },
      ],
    });

    await processScheduledEventCreatedNotificationsJob({ eventId: EVENT_ID }, deps);

    assert.deepEqual(
      written.map((row) => row.userId),
      ["member-1", "member-2"],
    );
    assert.equal(written[0]?.title, "Yeni etkinlik");
    assert.equal(written[1]?.title, "New event");
    assert.deepEqual(
      written.map((row) => row.dedupeKey),
      [`event-created:${EVENT_ID}:member-1`, `event-created:${EVENT_ID}:member-2`],
    );
    assert.deepEqual(pushed, ["member-1", "member-2"]);
  });

  it("eventNotifications kapalı üyeye yazmaz", async () => {
    const { deps, written } = dependencies({
      members: [
        { user: { id: "member-1", locale: "tr" } },
        { user: { id: "member-2", locale: "tr" } },
      ],
      settings: [{ eventNotifications: false, userId: "member-2" }],
    });

    await processScheduledEventCreatedNotificationsJob({ eventId: EVENT_ID }, deps);

    assert.deepEqual(
      written.map((row) => row.userId),
      ["member-1"],
    );
  });

  it("iptal edilmiş etkinlik için fan-out yapmaz", async () => {
    const { deps, written } = dependencies({
      event: eventRow({ status: "CANCELLED" }),
      members: [{ user: { id: "member-1", locale: "tr" } }],
    });

    await processScheduledEventCreatedNotificationsJob({ eventId: EVENT_ID }, deps);

    assert.deepEqual(written, []);
  });

  it("alıcı kalmazsa hiç yazmaz", async () => {
    const { deps, written } = dependencies({ members: [] });

    await processScheduledEventCreatedNotificationsJob({ eventId: EVENT_ID }, deps);

    assert.deepEqual(written, []);
  });
});
