import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  assertGroupAdmin,
  assertGroupConversation,
  assertGroupOwner,
  assertGroupPermission,
  countGroupAdmins,
  loadGroupAuthContext,
  toGroupAuthContext,
  type GroupAuthConversationRow,
} from "./group-permissions";

const JOINED_AT = new Date("2026-08-01T09:00:00.000Z");

function conversationRow(
  overrides: Partial<GroupAuthConversationRow> = {},
): GroupAuthConversationRow {
  return {
    historyVisibility: "LAST_30D",
    id: "conversation-1",
    ownerId: "owner-1",
    participants: [
      {
        historyFromAt: null,
        joinedAt: JOINED_AT,
        notifyLevel: "ALL",
        pinnedStripDismissedId: null,
        role: "OWNER",
        userId: "owner-1",
      },
    ],
    permAddMembers: "ALL",
    permEditInfo: "ADMINS",
    permPinMessage: "ADMINS",
    permSendMessage: "ALL",
    pinnedMessageId: null,
    type: "GROUP_DM",
    ...overrides,
  };
}

function contextFor(
  role: "OWNER" | "ADMIN" | "MEMBER",
  overrides: Partial<GroupAuthConversationRow> = {},
) {
  return toGroupAuthContext(
    conversationRow({
      participants: [
        {
          historyFromAt: null,
          joinedAt: JOINED_AT,
          notifyLevel: "ALL",
          pinnedStripDismissedId: null,
          role,
          userId: "actor-1",
        },
      ],
      ...overrides,
    }),
    "actor-1",
  );
}

function expectApiError(run: () => void, status: number, code: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ApiError, `Expected an ApiError, got ${String(error)}`);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

describe("toGroupAuthContext", () => {
  it("projects the conversation's four permissions onto the four actions", () => {
    const context = toGroupAuthContext(
      conversationRow({
        permAddMembers: "ADMINS",
        permEditInfo: "ALL",
        permPinMessage: "ALL",
        permSendMessage: "ADMINS",
      }),
      "owner-1",
    );

    assert.deepEqual(context.permissions, {
      addMembers: "ADMINS",
      editInfo: "ALL",
      pinMessage: "ALL",
      sendMessage: "ADMINS",
    });
  });

  it("reads the caller's own membership row", () => {
    const context = contextFor("ADMIN");

    assert.equal(context.role, "ADMIN");
    assert.equal(context.userId, "actor-1");
    assert.deepEqual(context.joinedAt, JOINED_AT);
  });

  it("marks a 1:1 conversation as not a group", () => {
    const context = toGroupAuthContext(conversationRow({ ownerId: null, type: "DM" }), "owner-1");

    assert.equal(context.isGroup, false);
  });

  it("refuses to build a context for somebody who is not in the conversation", () => {
    // Fail closed: an empty participant filter is exactly what a non-member's
    // query returns, and treating it as MEMBER would hand them member rights.
    expectApiError(
      () => toGroupAuthContext(conversationRow({ participants: [] }), "stranger-1"),
      403,
      "FORBIDDEN",
    );
  });
});

describe("assertGroupPermission", () => {
  it("lets a plain member through an ALL permission", () => {
    assert.doesNotThrow(() => assertGroupPermission(contextFor("MEMBER"), "sendMessage"));
  });

  it("stops a plain member at an ADMINS permission", () => {
    expectApiError(() => assertGroupPermission(contextFor("MEMBER"), "editInfo"), 403, "FORBIDDEN");
  });

  it("lets an admin through an ADMINS permission", () => {
    assert.doesNotThrow(() => assertGroupPermission(contextFor("ADMIN"), "editInfo"));
    assert.doesNotThrow(() => assertGroupPermission(contextFor("ADMIN"), "pinMessage"));
  });

  it("stops a member whose group locked sending down to admins", () => {
    expectApiError(
      () =>
        assertGroupPermission(contextFor("MEMBER", { permSendMessage: "ADMINS" }), "sendMessage"),
      403,
      "FORBIDDEN",
    );
  });

  it("always passes on a 1:1 DM — permissions are a group concept", () => {
    const context = toGroupAuthContext(conversationRow({ ownerId: null, type: "DM" }), "owner-1");

    for (const action of ["sendMessage", "addMembers", "editInfo", "pinMessage"] as const) {
      assert.doesNotThrow(() => assertGroupPermission(context, action));
    }
  });
});

describe("assertGroupAdmin / assertGroupOwner", () => {
  it("accepts the owner everywhere an admin is accepted", () => {
    assert.doesNotThrow(() => assertGroupAdmin(contextFor("OWNER")));
    assert.doesNotThrow(() => assertGroupOwner(contextFor("OWNER")));
  });

  it("accepts an admin as an admin but not as the owner", () => {
    assert.doesNotThrow(() => assertGroupAdmin(contextFor("ADMIN")));
    expectApiError(() => assertGroupOwner(contextFor("ADMIN")), 403, "NOT_GROUP_OWNER");
  });

  it("rejects a plain member on both", () => {
    expectApiError(() => assertGroupAdmin(contextFor("MEMBER")), 403, "NOT_GROUP_ADMIN");
    expectApiError(() => assertGroupOwner(contextFor("MEMBER")), 403, "NOT_GROUP_OWNER");
  });

  it("rejects a 1:1 conversation before it looks at any role", () => {
    const context = toGroupAuthContext(conversationRow({ ownerId: null, type: "DM" }), "owner-1");

    expectApiError(() => assertGroupAdmin(context), 400, "NOT_A_GROUP");
    expectApiError(() => assertGroupOwner(context), 400, "NOT_A_GROUP");
    expectApiError(() => assertGroupConversation(context), 400, "NOT_A_GROUP");
  });
});

describe("countGroupAdmins", () => {
  it("counts the owner and the admins, not the members", () => {
    assert.equal(
      countGroupAdmins([
        { role: "OWNER", userId: "u1" },
        { role: "ADMIN", userId: "u2" },
        { role: "MEMBER", userId: "u3" },
      ]),
      2,
    );
  });

  it("can be told to ignore one person — 'who is left if this one goes'", () => {
    assert.equal(
      countGroupAdmins(
        [
          { role: "OWNER", userId: "u1" },
          { role: "MEMBER", userId: "u2" },
        ],
        "u1",
      ),
      0,
    );
  });
});

describe("loadGroupAuthContext", () => {
  it("reads the conversation and the caller's membership in one query", async () => {
    let calls = 0;
    const context = await loadGroupAuthContext("conversation-1", "owner-1", {
      loadConversation: async (conversationId, userId) => {
        calls += 1;
        assert.equal(conversationId, "conversation-1");
        // The membership row is filtered inside the same read, not fetched
        // afterwards — two findUnique calls would double the round trips on
        // every write path in the package.
        assert.equal(userId, "owner-1");
        return conversationRow();
      },
    });

    assert.equal(calls, 1);
    assert.equal(context.role, "OWNER");
    assert.equal(context.isGroup, true);
  });

  it("answers 404 when the conversation does not exist", async () => {
    await assert.rejects(
      loadGroupAuthContext("missing", "owner-1", { loadConversation: async () => null }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
  });

  it("answers 403 when the caller is not a participant", async () => {
    await assert.rejects(
      loadGroupAuthContext("conversation-1", "stranger-1", {
        loadConversation: async () => conversationRow({ participants: [] }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        return true;
      },
    );
  });
});
