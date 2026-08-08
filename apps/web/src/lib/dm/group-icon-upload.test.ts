import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertGroupIconUploadAllowed, GroupIconUploadInputSchema } from "./group-icon-upload";

describe("group icon upload authorization", () => {
  it("treats a missing conversation id as the create-time case", async () => {
    const calls: string[] = [];

    await assertGroupIconUploadAllowed(
      { conversationId: null, userId: "user-1" },
      {
        loadConversation: async (conversationId) => {
          calls.push(conversationId);
          return null;
        },
      },
    );

    assert.deepEqual(calls, []);
    assert.deepEqual(GroupIconUploadInputSchema.parse({}), { conversationId: null });
  });

  it("lets the owner replace an existing group's photo", async () => {
    await assertGroupIconUploadAllowed(
      { conversationId: "group-1", userId: "user-1" },
      {
        loadConversation: async () => ({ ownerId: "user-1", type: "GROUP_DM" }),
      },
    );
  });

  // Without this check any member — or any stranger holding the id — could
  // presign an upload against somebody else's group.
  it("rejects a member who does not own the group", async () => {
    await assert.rejects(
      () =>
        assertGroupIconUploadAllowed(
          { conversationId: "group-1", userId: "user-2" },
          {
            loadConversation: async () => ({ ownerId: "user-1", type: "GROUP_DM" }),
          },
        ),
      /You cannot change this group's photo\./,
    );
  });

  it("rejects a one-to-one conversation and an id that resolves to nothing", async () => {
    await assert.rejects(() =>
      assertGroupIconUploadAllowed(
        { conversationId: "dm-1", userId: "user-1" },
        {
          loadConversation: async () => ({ ownerId: null, type: "DM" }),
        },
      ),
    );
    await assert.rejects(() =>
      assertGroupIconUploadAllowed(
        { conversationId: "missing", userId: "user-1" },
        {
          loadConversation: async () => null,
        },
      ),
    );
  });
});
