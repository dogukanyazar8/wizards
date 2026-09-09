import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkEffectiveChannelSlowMode } from "@/lib/workspace/channel-slow-mode";
import { PermissionBits } from "@/lib/workspace/permissions";

type RecordedCheck = { channelId: string; delaySeconds: number; userId: string };

function createGate(recorded: RecordedCheck[]) {
  return async (args: { channelId: string; delaySeconds: number; userId: string }) => {
    recorded.push({
      channelId: args.channelId,
      delaySeconds: args.delaySeconds,
      userId: args.userId,
    });
    return { status: "allowed" as const };
  };
}

async function resolveDelay(serverDelaySeconds: number, channelDelaySeconds: number) {
  const recorded: RecordedCheck[] = [];
  const result = await checkEffectiveChannelSlowMode({
    channelDelaySeconds,
    channelId: "channel-1",
    check: createGate(recorded),
    permissions: PermissionBits.SEND_MESSAGES,
    redis: {} as never,
    serverDelaySeconds,
    userId: "user-1",
  });

  return { delaySeconds: recorded[0]?.delaySeconds ?? null, recorded, result };
}

describe("effective channel slow mode (SPEC-SUNUCU §8.3)", () => {
  it("applies the channel delay when only the channel defines one", async () => {
    const { delaySeconds } = await resolveDelay(0, 30);

    assert.equal(delaySeconds, 30);
  });

  it("applies the server delay when only the server defines one", async () => {
    const { delaySeconds } = await resolveDelay(60, 0);

    assert.equal(delaySeconds, 60);
  });

  it("applies the longer of the two when both define one", async () => {
    // Her iki yön de denenir: uzun olanın kanal ya da sunucu tarafında olması
    // sonucu değiştirmemeli, yoksa kural "sonuncusu kazanır"a dönerdi.
    assert.equal((await resolveDelay(60, 15)).delaySeconds, 60);
    assert.equal((await resolveDelay(15, 60)).delaySeconds, 60);
  });

  it("asks for a zero delay when both are off, which the window treats as allowed", async () => {
    const { delaySeconds, result } = await resolveDelay(0, 0);

    assert.equal(delaySeconds, 0);
    assert.deepEqual(result, { status: "allowed" });
  });

  it("lets message moderators through without consulting the window", async () => {
    const recorded: RecordedCheck[] = [];
    const result = await checkEffectiveChannelSlowMode({
      channelDelaySeconds: 30,
      channelId: "channel-1",
      check: createGate(recorded),
      permissions: PermissionBits.MANAGE_MESSAGES,
      redis: {} as never,
      serverDelaySeconds: 3_600,
      userId: "moderator-1",
    });

    assert.deepEqual(result, { status: "allowed" });
    assert.deepEqual(recorded, []);
  });

  it("lets administrators through on the same shortcut", async () => {
    const recorded: RecordedCheck[] = [];
    await checkEffectiveChannelSlowMode({
      channelDelaySeconds: 30,
      channelId: "channel-1",
      check: createGate(recorded),
      permissions: PermissionBits.ADMINISTRATOR,
      redis: {} as never,
      serverDelaySeconds: 3_600,
      userId: "admin-1",
    });

    assert.deepEqual(recorded, []);
  });

  it("passes a limited verdict back with its retry window intact", async () => {
    const result = await checkEffectiveChannelSlowMode({
      channelDelaySeconds: 5,
      channelId: "channel-1",
      check: async () => ({ retryAfterSeconds: 42, status: "limited" as const }),
      permissions: PermissionBits.SEND_MESSAGES,
      redis: {} as never,
      serverDelaySeconds: 300,
      userId: "user-1",
    });

    assert.deepEqual(result, { retryAfterSeconds: 42, status: "limited" });
  });
});
