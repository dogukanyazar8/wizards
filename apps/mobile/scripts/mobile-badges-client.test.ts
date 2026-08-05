import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  BADGE_QUERY_STALE_TIME_MS,
  buildOwnBadgesPath,
  buildUserBadgesPath,
  fetchOwnBadges,
  fetchUserBadges,
} from "../src/social/mobile-badges-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

function stubClient(payload: unknown) {
  const paths: string[] = [];
  const client: MobileApiClient = {
    requestJson: async <TResponse>(path: string) => {
      paths.push(path);
      return payload as TResponse;
    },
  };

  return { client, paths };
}

describe("mobile badges client", () => {
  it("builds the badge paths the mobile routes answer on", () => {
    assert.equal(buildUserBadgesPath("abc"), "/api/v1/mobile/users/abc/badges");
    // An id is a path segment, so it is encoded rather than pasted in.
    assert.equal(buildUserBadgesPath("a/b?c"), "/api/v1/mobile/users/a%2Fb%3Fc/badges");
    assert.equal(buildOwnBadgesPath(), "/api/v1/mobile/account/badges");
  });

  it("parses a peer badge payload and refuses a broken one", async () => {
    const earned = { earnedAt: "2026-08-05T10:00:00.000Z", expiresAt: null, id: "staff", tier: 1 };
    const { client, paths } = stubClient({ badges: [earned] });

    assert.deepEqual(await fetchUserBadges(client, "user-1"), { badges: [earned] });
    assert.deepEqual(paths, ["/api/v1/mobile/users/user-1/badges"]);

    // An id this build does not know is a payload from a newer server; failing
    // loudly beats drawing a chip with no glyph behind it.
    await assert.rejects(
      fetchUserBadges(stubClient({ badges: [{ ...earned, id: "moderator" }] }).client, "user-1"),
    );
    await assert.rejects(fetchUserBadges(stubClient({ badges: {} }).client, "user-1"));
  });

  it("parses the own-badges payload with its progress list", async () => {
    const { client, paths } = stubClient({
      badges: [],
      progress: [{ id: "streak", nextThreshold: 30, tier: 1, value: 9 }],
    });

    assert.deepEqual(await fetchOwnBadges(client), {
      badges: [],
      progress: [{ id: "streak", nextThreshold: 30, tier: 1, value: 9 }],
    });
    assert.deepEqual(paths, ["/api/v1/mobile/account/badges"]);

    // `progress` is required: a "Rozetlerim" screen with no ladder is a bug,
    // not an empty state.
    await assert.rejects(fetchOwnBadges(stubClient({ badges: [] }).client));
  });

  it("keeps the badge keys under the root a sign-out wipes", () => {
    for (const key of [mobileQueryKeys.badges.own(), mobileQueryKeys.badges.user("user-1")]) {
      assert.equal(key[0], mobileQueryKeys.all[0]);
    }

    assert.deepEqual(mobileQueryKeys.badges.user("user-1"), ["mobile", "badges", "user", "user-1"]);
    assert.notDeepEqual(mobileQueryKeys.badges.own(), mobileQueryKeys.profile());
  });

  it("shares one freshness window with the web client", () => {
    assert.equal(BADGE_QUERY_STALE_TIME_MS, 5 * 60 * 1000);
  });
});
