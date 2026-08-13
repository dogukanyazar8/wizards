import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as voiceHandlers from "./voice";

describe("voice socket handler guards", () => {
  it("rate-limits voice-state watch before resolving channel permissions", async () => {
    const runWatch = (
      voiceHandlers as unknown as {
        runVoiceStatesWatch?: (input: {
          checkRateLimit(): Promise<boolean>;
          joinRooms(channelIds: string[]): Promise<void>;
          listChannelIds(): Promise<string[]>;
        }) => Promise<void>;
      }
    ).runVoiceStatesWatch;

    assert.equal(typeof runWatch, "function");
    if (!runWatch) return;

    let listCount = 0;
    let joinCount = 0;
    await runWatch({
      async checkRateLimit() {
        return false;
      },
      async joinRooms() {
        joinCount += 1;
      },
      async listChannelIds() {
        listCount += 1;
        return ["channel-1"];
      },
    });

    assert.equal(listCount, 0);
    assert.equal(joinCount, 0);
  });

  it("drops a repeated screen-share value after applying rate limit", async () => {
    const runUpdate = (
      voiceHandlers as unknown as {
        runVoiceScreenShareUpdate?: (input: {
          authorize(): Promise<void>;
          checkRateLimit(): Promise<boolean>;
          emit(): Promise<void>;
          readCurrentValue(): Promise<boolean>;
          recordUsage(): Promise<void>;
          value: boolean;
          writeValue(): Promise<void>;
        }) => Promise<void>;
      }
    ).runVoiceScreenShareUpdate;

    assert.equal(typeof runUpdate, "function");
    if (!runUpdate) return;

    const calls: string[] = [];
    let currentValue = false;
    const invoke = (value: boolean) =>
      runUpdate({
        async authorize() {
          calls.push("authorize");
        },
        async checkRateLimit() {
          calls.push("rate");
          return true;
        },
        async emit() {
          calls.push("emit");
        },
        async readCurrentValue() {
          calls.push("read");
          return currentValue;
        },
        async recordUsage() {
          calls.push("usage");
        },
        value,
        async writeValue() {
          calls.push("write");
          currentValue = value;
        },
      });

    await invoke(true);
    await invoke(true);

    assert.deepEqual(calls, [
      "rate",
      "authorize",
      "read",
      "write",
      "usage",
      "emit",
      "rate",
      "authorize",
      "read",
    ]);
  });
});
