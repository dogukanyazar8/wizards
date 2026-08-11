import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INVITE_CODE_CHARSET } from "@wizards/types";

import { ApiError } from "@/lib/api";

import { generateUniqueInviteCode, INVITE_CODE_ATTEMPTS } from "./code";

function bytesFrom(values: readonly number[]) {
  return () => Uint8Array.from(values);
}

describe("generateUniqueInviteCode", () => {
  it("maps each random byte onto the unambiguous charset", async () => {
    const code = await generateUniqueInviteCode({
      isTaken: async () => false,
      length: 4,
      randomBytes: bytesFrom([0, 1, 2, 31]),
    });

    assert.equal(code, "ABC9");
  });

  it("emits exactly the requested length even when more bytes arrive", async () => {
    const code = await generateUniqueInviteCode({
      isTaken: async () => false,
      length: 12,
      randomBytes: (size) => Uint8Array.from({ length: size }, (_unused, index) => index),
    });

    assert.equal(code.length, 12);
    for (const character of code) {
      assert.ok(INVITE_CODE_CHARSET.includes(character), `${character} is outside the charset`);
    }
  });

  it("retries until the collision check clears", async () => {
    const seen: string[] = [];
    let call = 0;

    const code = await generateUniqueInviteCode({
      isTaken: async (candidate) => {
        seen.push(candidate);
        return seen.length < 3;
      },
      length: 2,
      randomBytes: () => {
        call += 1;
        return Uint8Array.from([call, call]);
      },
    });

    assert.equal(seen.length, 3);
    assert.equal(code, seen[2]);
  });

  it("gives up rather than looping forever when every candidate collides", async () => {
    let attempts = 0;

    await assert.rejects(
      generateUniqueInviteCode({
        isTaken: async () => {
          attempts += 1;
          return true;
        },
        length: 8,
        randomBytes: bytesFrom([0, 0, 0, 0, 0, 0, 0, 0]),
      }),
      (error: unknown) => error instanceof ApiError && error.status === 500,
    );

    assert.equal(attempts, INVITE_CODE_ATTEMPTS);
  });

  it("draws one byte per character, so the entropy is not silently halved", async () => {
    const requested: number[] = [];

    await generateUniqueInviteCode({
      isTaken: async () => false,
      length: 12,
      randomBytes: (size) => {
        requested.push(size);
        return Uint8Array.from({ length: size }, () => 0);
      },
    });

    assert.deepEqual(requested, [12]);
  });
});
