import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEventReminderIdempotencyKey,
  cancelEventReminderJobs,
  rescheduleEventReminderJobs,
  resolveEventReminderAvailableAt,
  scheduleEventReminderJob,
  SCHEDULED_EVENT_REMINDER_JOB_TYPE,
  type EventReminderSchedulerClient,
} from "./reminder-scheduler";

const EVENT_ID = "evt-1";
const USER_ID = "user-1";
const STARTS_AT = new Date("2026-09-01T15:00:00.000Z");
const EARLY = new Date("2026-08-21T09:00:00.000Z");

type RecordedCall = { args: Record<string, unknown>; operation: string };

function recorder(
  overrides: {
    reminders?: { minutesBefore: number; userId: string }[];
    settings?: { eventNotifications: boolean; userId: string }[];
    updateManyCount?: number;
  } = {},
) {
  const calls: RecordedCall[] = [];
  const client: EventReminderSchedulerClient = {
    outboxJob: {
      updateMany: (args) => {
        calls.push({ args: args as Record<string, unknown>, operation: "outboxJob.updateMany" });
        return Promise.resolve({ count: overrides.updateManyCount ?? 0 });
      },
      upsert: (args) => {
        calls.push({ args: args as Record<string, unknown>, operation: "outboxJob.upsert" });
        return Promise.resolve(undefined);
      },
    },
    scheduledEventReminder: {
      findMany: (args) => {
        calls.push({
          args: args as Record<string, unknown>,
          operation: "scheduledEventReminder.findMany",
        });
        return Promise.resolve(overrides.reminders ?? []);
      },
    },
    userNotificationSettings: {
      findMany: (args) => {
        calls.push({
          args: args as Record<string, unknown>,
          operation: "userNotificationSettings.findMany",
        });
        return Promise.resolve(overrides.settings ?? []);
      },
    },
  };

  return { calls, client };
}

function enqueued(calls: RecordedCall[]) {
  return calls.filter(
    (call) => call.operation === "outboxJob.upsert" || call.operation === "outboxJob.updateMany",
  );
}

describe("events reminder-scheduler — K5 outbox zamanlaması", () => {
  describe("anahtar ve zaman", () => {
    it("idempotencyKey startsAt taşır", () => {
      assert.equal(
        buildEventReminderIdempotencyKey({
          eventId: EVENT_ID,
          startsAt: STARTS_AT,
          userId: USER_ID,
        }),
        `evt-reminder:${EVENT_ID}:${USER_ID}:${STARTS_AT.getTime()}`,
      );
    });

    it("saat değişince anahtar değişir — eskisi başka bir satırdır", () => {
      const before = buildEventReminderIdempotencyKey({
        eventId: EVENT_ID,
        startsAt: STARTS_AT,
        userId: USER_ID,
      });
      const after = buildEventReminderIdempotencyKey({
        eventId: EVENT_ID,
        startsAt: new Date(STARTS_AT.getTime() + 60 * 60_000),
        userId: USER_ID,
      });

      assert.notEqual(before, after);
    });

    it("availableAt = startsAt − minutesBefore", () => {
      assert.equal(
        resolveEventReminderAvailableAt(STARTS_AT, 10).toISOString(),
        "2026-09-01T14:50:00.000Z",
      );
    });
  });

  describe("scheduleEventReminderJob", () => {
    it("gelecekteki hatırlatmayı kuyruğa yazar", async () => {
      const { calls, client } = recorder();

      const result = await scheduleEventReminderJob(client, {
        enabled: true,
        eventId: EVENT_ID,
        eventNotificationsEnabled: true,
        minutesBefore: 10,
        now: EARLY,
        startsAt: STARTS_AT,
        userId: USER_ID,
      });

      assert.deepEqual(result, { reason: null, scheduled: true });

      const upsert = calls.find((call) => call.operation === "outboxJob.upsert");
      assert.ok(upsert, "iş yazılmalı");
      assert.deepEqual(upsert.args.create, {
        availableAt: new Date("2026-09-01T14:50:00.000Z"),
        idempotencyKey: `evt-reminder:${EVENT_ID}:${USER_ID}:${STARTS_AT.getTime()}`,
        payload: { eventId: EVENT_ID, minutesBefore: 10, userId: USER_ID },
        type: SCHEDULED_EVENT_REMINDER_JOB_TYPE,
      });
    });

    it("availableAt <= now ise iş YAZILMAZ (tuzak #8) ve scheduled:false döner", async () => {
      const { calls, client } = recorder();

      // Etkinlik 5 dk sonra, tercih 10 dk: `availableAt` geçmişte kalır. Yazılsaydı worker
      // onu **hemen** gönderir ve kullanıcı "başlamasına 10 dk" diyen bildirimi geç alırdı.
      const result = await scheduleEventReminderJob(client, {
        enabled: true,
        eventId: EVENT_ID,
        eventNotificationsEnabled: true,
        minutesBefore: 10,
        now: new Date(STARTS_AT.getTime() - 5 * 60_000),
        startsAt: STARTS_AT,
        userId: USER_ID,
      });

      assert.deepEqual(result, { reason: "past", scheduled: false });
      assert.deepEqual(enqueued(calls), []);
    });

    it("availableAt tam now ise de yazılmaz (sınır dâhil)", async () => {
      const { calls, client } = recorder();

      const result = await scheduleEventReminderJob(client, {
        enabled: true,
        eventId: EVENT_ID,
        eventNotificationsEnabled: true,
        minutesBefore: 10,
        now: new Date("2026-09-01T14:50:00.000Z"),
        startsAt: STARTS_AT,
        userId: USER_ID,
      });

      assert.equal(result.scheduled, false);
      assert.deepEqual(enqueued(calls), []);
    });

    it("eventNotifications=false kullanıcı için hiç iş yazılmaz", async () => {
      const { calls, client } = recorder();

      const result = await scheduleEventReminderJob(client, {
        enabled: true,
        eventId: EVENT_ID,
        eventNotificationsEnabled: false,
        minutesBefore: 10,
        now: EARLY,
        startsAt: STARTS_AT,
        userId: USER_ID,
      });

      assert.deepEqual(result, { reason: "notifications-off", scheduled: false });
      assert.deepEqual(
        calls.filter((call) => call.operation === "outboxJob.upsert"),
        [],
      );
    });

    it("enabled:false mevcut PENDING işi CANCELLED'a çeker", async () => {
      const { calls, client } = recorder({ updateManyCount: 1 });

      const result = await scheduleEventReminderJob(client, {
        enabled: false,
        eventId: EVENT_ID,
        eventNotificationsEnabled: true,
        minutesBefore: 10,
        now: EARLY,
        startsAt: STARTS_AT,
        userId: USER_ID,
      });

      assert.deepEqual(result, { reason: "disabled", scheduled: false });

      const cancel = calls.find((call) => call.operation === "outboxJob.updateMany");
      assert.deepEqual(cancel?.args.data, { status: "CANCELLED" });
      assert.deepEqual(cancel?.args.where, {
        idempotencyKey: { startsWith: `evt-reminder:${EVENT_ID}:${USER_ID}:` },
        status: "PENDING",
        type: SCHEDULED_EVENT_REMINDER_JOB_TYPE,
      });
      assert.equal(
        calls.some((call) => call.operation === "outboxJob.upsert"),
        false,
      );
    });

    it("daha önce iptal edilmiş aynı anahtar yeniden PENDING olur — upsert tek başına yetmez", async () => {
      // `enqueueOutboxJob` `update: {}` ile çalışır: aynı anahtar CANCELLED durursa upsert
      // onu diriltmez ve kullanıcı hatırlatmayı geri açtığında sessizce hiçbir şey almaz.
      const { calls, client } = recorder({ updateManyCount: 1 });

      const result = await scheduleEventReminderJob(client, {
        enabled: true,
        eventId: EVENT_ID,
        eventNotificationsEnabled: true,
        minutesBefore: 30,
        now: EARLY,
        startsAt: STARTS_AT,
        userId: USER_ID,
      });

      assert.deepEqual(result, { reason: null, scheduled: true });

      const requeue = calls.find((call) => call.operation === "outboxJob.updateMany");
      const requeueData = requeue?.args.data as Record<string, unknown>;
      assert.equal(requeueData.status, "PENDING");
      assert.equal(requeueData.attempts, 0);
      assert.deepEqual(requeueData.availableAt, new Date("2026-09-01T14:30:00.000Z"));
      // Teslimattaki bir işin kiralaması ezilmez.
      assert.deepEqual((requeue?.args.where as { status: unknown }).status, {
        in: ["PENDING", "CANCELLED", "COMPLETED", "FAILED"],
      });
      assert.equal(
        calls.some((call) => call.operation === "outboxJob.upsert"),
        false,
      );
    });
  });

  describe("cancelEventReminderJobs", () => {
    it("etkinliğin bütün bekleyen işlerini iptal eder", async () => {
      const { calls, client } = recorder({ updateManyCount: 4 });

      const cancelled = await cancelEventReminderJobs(client, { eventId: EVENT_ID });

      assert.equal(cancelled, 4);
      assert.deepEqual(calls[0]?.args.where, {
        idempotencyKey: { startsWith: `evt-reminder:${EVENT_ID}:` },
        status: "PENDING",
        type: SCHEDULED_EVENT_REMINDER_JOB_TYPE,
      });
    });

    it("tek kullanıcıya daraltılabilir", async () => {
      const { calls, client } = recorder({ updateManyCount: 1 });

      await cancelEventReminderJobs(client, { eventId: EVENT_ID, userId: USER_ID });

      assert.deepEqual((calls[0]?.args.where as { idempotencyKey: unknown }).idempotencyKey, {
        startsWith: `evt-reminder:${EVENT_ID}:${USER_ID}:`,
      });
    });
  });

  describe("rescheduleEventReminderJobs — saat değişti", () => {
    it("eskileri iptal eder, yeni anahtarla yeniden yazar", async () => {
      const movedTo = new Date("2026-09-01T18:00:00.000Z");
      const { calls, client } = recorder({
        reminders: [
          { minutesBefore: 10, userId: "user-1" },
          { minutesBefore: 60, userId: "user-2" },
        ],
        settings: [
          { eventNotifications: true, userId: "user-1" },
          { eventNotifications: false, userId: "user-2" },
        ],
      });

      const result = await rescheduleEventReminderJobs(client, {
        eventId: EVENT_ID,
        now: EARLY,
        startsAt: movedTo,
      });

      // `user-2` bildirimleri kapattı: yeni iş **hiç** yazılmaz.
      assert.deepEqual(result, { cancelled: 0, scheduled: 1, skipped: 1 });

      const cancel = calls.find((call) => call.operation === "outboxJob.updateMany");
      assert.deepEqual((cancel?.args.where as { idempotencyKey: unknown }).idempotencyKey, {
        startsWith: `evt-reminder:${EVENT_ID}:`,
      });

      const writes = calls.filter((call) => call.operation === "outboxJob.upsert");
      assert.equal(writes.length, 1);
      // Yeni saat yeni anahtar üretir; eski anahtar toplu iptalde kaldı.
      assert.equal(
        (writes[0]?.args.create as { idempotencyKey: string }).idempotencyKey,
        `evt-reminder:${EVENT_ID}:user-1:${movedTo.getTime()}`,
      );
      assert.deepEqual(
        (writes[0]?.args.create as { availableAt: Date }).availableAt,
        new Date("2026-09-01T17:50:00.000Z"),
      );
    });

    it("yalnız enabled satırlar okunur", async () => {
      const { calls, client } = recorder({ reminders: [], settings: [] });

      await rescheduleEventReminderJobs(client, {
        eventId: EVENT_ID,
        now: EARLY,
        startsAt: STARTS_AT,
      });

      const read = calls.find((call) => call.operation === "scheduledEventReminder.findMany");
      assert.deepEqual(read?.args.where, { enabled: true, eventId: EVENT_ID });
    });

    it("saat geçmişe çekilirse yeni iş yazılmaz ama eskiler yine iptal edilir", async () => {
      const { calls, client } = recorder({
        reminders: [{ minutesBefore: 10, userId: USER_ID }],
        settings: [{ eventNotifications: true, userId: USER_ID }],
        updateManyCount: 2,
      });

      const result = await rescheduleEventReminderJobs(client, {
        eventId: EVENT_ID,
        now: EARLY,
        startsAt: new Date(EARLY.getTime() + 60_000),
      });

      assert.deepEqual(result, { cancelled: 2, scheduled: 0, skipped: 1 });
      assert.equal(
        calls.some((call) => call.operation === "outboxJob.upsert"),
        false,
      );
    });
  });
});
