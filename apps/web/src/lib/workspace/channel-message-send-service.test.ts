import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ApiError } from "@/lib/api";
import { assertChannelSlowModeAllowsSend } from "@/lib/workspace/channel-message-send-service";
import { PermissionBits } from "@/lib/workspace/permissions";

function slowModeError(error: unknown) {
  assert.ok(error instanceof ApiError, "Expected an ApiError");
  return { code: error.code, message: error.message, status: error.status };
}

describe("REST channel message send — slow mode gate (Ş1 §2)", () => {
  it("blocks with the existing SLOW_MODE code rather than a new one", async () => {
    await assert.rejects(
      () =>
        assertChannelSlowModeAllowsSend({
          channelDelaySeconds: 30,
          channelId: "channel-1",
          checkSlowMode: async () => ({ retryAfterSeconds: 12, status: "limited" }),
          permissions: PermissionBits.SEND_MESSAGES,
          redis: {} as never,
          serverDelaySeconds: 0,
          userId: "user-1",
        }),
      (error: unknown) => {
        assert.deepEqual(slowModeError(error), {
          code: "SLOW_MODE",
          message: "Slow mode is active. Please wait before sending another message.",
          status: 429,
        });
        return true;
      },
    );
  });

  it("fails closed when the slow-mode window cannot be read", async () => {
    await assert.rejects(
      () =>
        assertChannelSlowModeAllowsSend({
          channelDelaySeconds: 0,
          channelId: "channel-1",
          checkSlowMode: async () => ({ error: new Error("redis down"), status: "unavailable" }),
          permissions: PermissionBits.SEND_MESSAGES,
          redis: {} as never,
          serverDelaySeconds: 60,
          userId: "user-1",
        }),
      (error: unknown) => {
        assert.equal(slowModeError(error).code, "RATE_LIMIT_UNAVAILABLE");
        assert.equal(slowModeError(error).status, 503);
        return true;
      },
    );
  });

  it("resolves the effective delay from both columns before consulting the window", async () => {
    const seen: number[] = [];
    const check = async (args: { delaySeconds: number }) => {
      seen.push(args.delaySeconds);
      return { status: "allowed" as const };
    };

    await assertChannelSlowModeAllowsSend({
      channelDelaySeconds: 15,
      channelId: "channel-1",
      checkSlowMode: check,
      permissions: PermissionBits.SEND_MESSAGES,
      redis: {} as never,
      serverDelaySeconds: 600,
      userId: "user-1",
    });
    await assertChannelSlowModeAllowsSend({
      channelDelaySeconds: 900,
      channelId: "channel-1",
      checkSlowMode: check,
      permissions: PermissionBits.SEND_MESSAGES,
      redis: {} as never,
      serverDelaySeconds: 60,
      userId: "user-1",
    });

    assert.deepEqual(seen, [600, 900]);
  });

  it("lets a message moderator through without reading the window", async () => {
    let consulted = false;

    await assertChannelSlowModeAllowsSend({
      channelDelaySeconds: 3_600,
      channelId: "channel-1",
      checkSlowMode: async () => {
        consulted = true;
        return { retryAfterSeconds: 3_600, status: "limited" };
      },
      permissions: PermissionBits.MANAGE_MESSAGES,
      redis: {} as never,
      serverDelaySeconds: 3_600,
      userId: "moderator-1",
    });

    assert.equal(consulted, false);
  });
});

/**
 * Zaman aşımı kapısının kendi davranışı `member-timeout.test.ts` içinde ölçülüyor; burada
 * ölçülen tek şey **kablolama**: `sendChannelMessage` bağımlılık enjeksiyonu almıyor, o yüzden
 * kapının yerini kanıtlamanın yolu kaynağı okumak. Sıra önemli — kapı mesaj yazıldıktan sonra
 * çağrılsaydı susturulmuş üye yine de gönderirdi.
 */
describe("REST channel message send — timeout gate wiring (Ş2 §4)", () => {
  it("calls the timeout gate after permission resolution and before the message is written", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./channel-message-send-service.ts", import.meta.url)),
      "utf8",
    );
    const gate = source.indexOf("await assertMemberNotTimedOut(channel.serverId, args.userId)");
    const permission = source.indexOf("requireChannelPermissionForUser(");
    const write = source.indexOf("await createMessageWithClientNonce(");

    assert.ok(gate !== -1, "the timeout gate is missing from the REST send path");
    assert.ok(permission !== -1 && permission < gate);
    assert.ok(write !== -1 && gate < write);
  });
});
