import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  addMobileGroupMembers,
  createMobileGroup,
  MOBILE_GROUP_INVALIDATIONS,
  removeMobileGroupMember,
  updateMobileGroup,
} from "../src/dm/mobile-group-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

type Call = { options: unknown; path: string };

function conversationResponse(id = "dm-group-1") {
  return {
    conversation: {
      iconUrl: null,
      id,
      lastMessage: null,
      lastMessageAt: "2026-08-07T10:00:00.000Z",
      name: "Takım",
      ownerId: "user-1",
      participants: [],
      type: "GROUP_DM",
    },
  };
}

function createClient(response: unknown): { calls: Call[]; client: MobileApiClient } {
  const calls: Call[] = [];
  const client: MobileApiClient = {
    requestJson: async <TResponse>(path: string, options?: unknown) => {
      calls.push({ options, path });
      return response as TResponse;
    },
  };
  return { calls, client };
}

describe("Faz 5 §15.1 mobile group client", () => {
  it("posts a create request to the mobile group collection", async () => {
    const { calls, client } = createClient(conversationResponse());

    const conversation = await createMobileGroup(client, {
      name: "Takım",
      userIds: ["user-2", "user-3"],
    });

    assert.equal(conversation.id, "dm-group-1");
    assert.equal(calls[0]?.path, "/api/v1/mobile/dm/groups");
    assert.deepEqual(calls[0]?.options, {
      body: { name: "Takım", userIds: ["user-2", "user-3"] },
      method: "POST",
    });
  });

  it("escapes the conversation id in every path segment it builds", async () => {
    const { calls, client } = createClient(conversationResponse());

    await addMobileGroupMembers(client, "dm/../admin", ["user-9"]);
    await updateMobileGroup(client, "dm/../admin", { name: null });

    assert.equal(calls[0]?.path, "/api/v1/mobile/dm/groups/dm%2F..%2Fadmin/members");
    assert.equal(calls[1]?.path, "/api/v1/mobile/dm/groups/dm%2F..%2Fadmin");
  });

  it("escapes the target user id when removing a member", async () => {
    const { calls, client } = createClient(undefined);

    await removeMobileGroupMember(client, "dm-group-1", "user/../1");

    assert.equal(calls[0]?.path, "/api/v1/mobile/dm/groups/dm-group-1/members/user%2F..%2F1");
    assert.deepEqual(calls[0]?.options, { method: "DELETE" });
  });

  it("refuses a response whose conversation does not match the shared schema", async () => {
    const { client } = createClient({ conversation: { id: "dm-group-1" } });

    await assert.rejects(() =>
      createMobileGroup(client, { name: "Yayın Ekibi", userIds: ["user-2", "user-3"] }),
    );
  });

  it("invalidates the group detail only after a role change", () => {
    assert.deepEqual(MOBILE_GROUP_INVALIDATIONS.role("dm-group-1"), [
      mobileQueryKeys.groupDetails("dm-group-1"),
    ]);
  });
});
