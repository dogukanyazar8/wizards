import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPresenceFriendUserIds,
  getPresenceServerIds,
  invalidatePresenceAudienceCache,
} from "./service";

describe("presence audience cache", () => {
  it("reuses friend and server ids until a friends update invalidates them", async () => {
    const hashes = new Map<string, Map<string, string>>();
    let friendshipReads = 0;
    let membershipReads = 0;
    const redis = {
      async expire() {
        return 1;
      },
      async hdel(key: string, ...fields: string[]) {
        const hash = hashes.get(key);
        for (const field of fields) hash?.delete(field);
        return fields.length;
      },
      async hget(key: string, field: string) {
        return hashes.get(key)?.get(field) ?? null;
      },
      async hset(key: string, field: string, value: string) {
        const hash = hashes.get(key) ?? new Map<string, string>();
        hash.set(field, value);
        hashes.set(key, hash);
        return 1;
      },
    };
    const dependencies = {
      findFriendships: async () => {
        friendshipReads += 1;
        return [
          { receiverId: "user-2", senderId: "user-1" },
          { receiverId: "user-1", senderId: "user-3" },
        ];
      },
      findServerMemberships: async () => {
        membershipReads += 1;
        return [{ serverId: "server-1" }, { serverId: "server-2" }];
      },
      redis,
    };

    assert.deepEqual(await getPresenceFriendUserIds("user-1", dependencies), ["user-2", "user-3"]);
    assert.deepEqual(await getPresenceFriendUserIds("user-1", dependencies), ["user-2", "user-3"]);
    assert.deepEqual(await getPresenceServerIds("user-1", dependencies), ["server-1", "server-2"]);
    assert.deepEqual(await getPresenceServerIds("user-1", dependencies), ["server-1", "server-2"]);
    assert.equal(friendshipReads, 1);
    assert.equal(membershipReads, 1);

    await invalidatePresenceAudienceCache(["user-1"], redis);
    await getPresenceFriendUserIds("user-1", dependencies);

    assert.equal(friendshipReads, 2);
  });
});
