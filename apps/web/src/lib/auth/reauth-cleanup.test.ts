import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS,
  buildAccountReauthChallengeCleanupWhere,
  cleanupAccountReauthChallenges,
  shouldDeleteAccountReauthChallenge,
} from "./reauth-cleanup";

const NOW = new Date("2026-05-16T12:00:00.000Z");
const oneHourMs = 60 * 60 * 1000;

describe("account re-auth challenge cleanup", () => {
  it("keeps active challenges", () => {
    assert.equal(
      shouldDeleteAccountReauthChallenge(
        {
          expiresAt: new Date(NOW.getTime() + oneHourMs),
          usedAt: null,
        },
        NOW,
      ),
      false,
    );
  });

  it("deletes old used challenges", () => {
    assert.equal(
      shouldDeleteAccountReauthChallenge(
        {
          expiresAt: new Date(NOW.getTime() - ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS - oneHourMs),
          usedAt: new Date(NOW.getTime() - ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS - oneHourMs),
        },
        NOW,
      ),
      true,
    );
  });

  it("deletes old expired unused challenges", () => {
    assert.equal(
      shouldDeleteAccountReauthChallenge(
        {
          expiresAt: new Date(NOW.getTime() - ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS - oneHourMs),
          usedAt: null,
        },
        NOW,
      ),
      true,
    );
  });

  it("keeps recent used and recent expired challenges inside the retention window", () => {
    const recentDate = new Date(NOW.getTime() - ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS + oneHourMs);

    assert.equal(
      shouldDeleteAccountReauthChallenge(
        {
          expiresAt: recentDate,
          usedAt: recentDate,
        },
        NOW,
      ),
      false,
    );
    assert.equal(
      shouldDeleteAccountReauthChallenge(
        {
          expiresAt: recentDate,
          usedAt: null,
        },
        NOW,
      ),
      false,
    );
  });

  it("uses one idempotent deleteMany predicate for retained cleanup", async () => {
    const calls: unknown[] = [];
    const count = await cleanupAccountReauthChallenges({
      delegate: {
        async deleteMany(args) {
          calls.push(args);
          return { count: 2 };
        },
      },
      now: NOW,
    });

    assert.equal(count, 2);
    assert.deepEqual(calls, [
      {
        where: buildAccountReauthChallengeCleanupWhere(NOW),
      },
    ]);
  });
});
