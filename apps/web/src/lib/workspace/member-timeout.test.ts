import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  MEMBER_TIMEOUT_FORBIDDEN_CODE,
  assertMemberNotTimedOut,
  isMemberTimedOut,
} from "./member-timeout";

const NOW = new Date("2026-08-25T12:00:00.000Z");

function reader(communicationDisabledUntil: Date | null, calls: unknown[] = []) {
  return {
    serverMember: {
      findUnique: async (args: unknown) => {
        calls.push(args);
        return { communicationDisabledUntil };
      },
    },
  };
}

describe("member timeout gate", () => {
  it("reads the column as a deadline, not a flag", () => {
    assert.equal(isMemberTimedOut(null, NOW), false);
    assert.equal(isMemberTimedOut(undefined, NOW), false);
    // Süresi geçmiş bir kolon zaman aşımı değildir: temizleyen bir cron yok, karşılaştırma var.
    assert.equal(isMemberTimedOut(new Date("2026-08-25T11:59:59.000Z"), NOW), false);
    assert.equal(isMemberTimedOut(new Date("2026-08-25T12:00:00.000Z"), NOW), false);
    assert.equal(isMemberTimedOut(new Date("2026-08-25T12:00:01.000Z"), NOW), true);
  });

  it("accepts the serialized column shape the API hands back", () => {
    assert.equal(isMemberTimedOut("2026-08-25T12:00:01.000Z", NOW), true);
    assert.equal(isMemberTimedOut("2026-08-25T11:00:00.000Z", NOW), false);
    // Ayrıştırılamayan bir değer kimseyi susturmaz.
    assert.equal(isMemberTimedOut("yarın", NOW), false);
  });

  it("stops a timed-out member from sending, through the existing permission error family", async () => {
    await assert.rejects(
      () =>
        assertMemberNotTimedOut("server-1", "user-1", reader(new Date("2099-01-01T00:00:00.000Z"))),
      (error) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === MEMBER_TIMEOUT_FORBIDDEN_CODE,
    );
  });

  it("lets everyone else through, including a member whose timeout has expired", async () => {
    await assertMemberNotTimedOut("server-1", "user-1", reader(null));
    await assertMemberNotTimedOut(
      "server-1",
      "user-1",
      reader(new Date("2020-01-01T00:00:00.000Z")),
    );
  });

  it("asks for one member row by its unique key and nothing else", async () => {
    const calls: unknown[] = [];
    await assertMemberNotTimedOut("server-1", "user-1", reader(null, calls));

    assert.deepEqual(calls, [
      {
        select: { communicationDisabledUntil: true },
        where: { userId_serverId: { serverId: "server-1", userId: "user-1" } },
      },
    ]);
  });

  it("does not treat a missing membership as a timeout", async () => {
    await assertMemberNotTimedOut("server-1", "user-1", {
      serverMember: { findUnique: async () => null },
    });
  });
});
