import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  toMobileBootstrapViewState,
  toMobileChannelMessagesViewState,
  toMobileMessageSearchViewState,
  toMobileSyncSnapshot,
  toMobileWorkspaceViewState,
  type MobileQueryViewInput,
} from "../src/app/mobile-query-view-state";

const idleQuery = {
  data: undefined,
  dataUpdatedAt: 0,
  errorUpdatedAt: 0,
  failureCount: 0,
  isError: false,
  isFetching: false,
  isPending: true,
};

/**
 * The adapters take narrow slices of a query result, so a fresh object literal
 * at the call site trips excess-property checking. Widening here keeps the
 * fixtures readable and still exercises the real call shape.
 */
function asQueryInput<TData>(
  overrides: Partial<MobileQueryViewInput<TData>>,
): MobileQueryViewInput<TData> {
  return { ...idleQuery, ...overrides } as MobileQueryViewInput<TData>;
}

describe("mobile query view-state adapters", () => {
  it("derives bootstrap readiness without a duplicate fetch state machine", () => {
    const payload = {
      home: { directMessages: { recent: [], unreadCount: 0 }, servers: { recent: [] } },
    };
    const state = toMobileBootstrapViewState(
      asQueryInput({ data: payload as never, dataUpdatedAt: 42, isPending: false }),
      () => ({ directMessageCount: 0, serverCount: 0 }) as never,
      "failed",
    );

    assert.equal(state.status, "ready");
    assert.equal(state.payload, payload);
  });

  it("flattens channel pages and keeps the newest duplicate", () => {
    const state = toMobileChannelMessagesViewState(
      asQueryInput({
        data: {
          pages: [
            { messages: [{ id: "2", content: "new" } as never] },
            {
              messages: [
                { id: "1", content: "old" } as never,
                { id: "2", content: "old" } as never,
              ],
            },
          ],
        } as unknown as never,
        isPending: false,
      }),
      "channel-1",
      "failed",
    );

    assert.equal(state.status, "ready");
    assert.deepEqual(
      state.payload?.messages.map(({ content, id }) => ({ content, id })),
      [
        { id: "1", content: "old" },
        { id: "2", content: "new" },
      ],
    );
  });

  it("keeps raw search text out of state until a valid query is submitted", () => {
    const state = toMobileMessageSearchViewState(
      idleQuery,
      { conversationId: "", query: "", scope: "dm" },
      "failed",
    );

    assert.deepEqual(state, {
      context: null,
      error: null,
      payload: null,
      query: "",
      status: "idle",
    });
  });

  it("maps query activity and failure into sync health", () => {
    assert.equal(
      toMobileSyncSnapshot(asQueryInput({ isFetching: true }), "workspace").status,
      "syncing",
    );
    const failed = toMobileSyncSnapshot(
      asQueryInput({ errorUpdatedAt: 84, failureCount: 2, isError: true, isPending: false }),
      "workspace",
    );
    assert.equal(failed.status, "error");
    assert.equal(failed.failureCount, 2);
    assert.equal(failed.lastFailedAt, 84);
  });

  it("preserves managed workspace capabilities through the query view state", () => {
    const payload = {
      detail: {
        capabilities: {
          canClearHistory: false,
          canDeleteServer: false,
          canKickMembers: false,
          canManageChannels: true,
          canManageInvites: true,
          canManageMessages: true,
          canManageRoles: false,
          canManageServer: true,
          canUploadServerIcon: true,
        },
      },
    } as never;
    const state = toMobileWorkspaceViewState(
      asQueryInput({ data: payload, isPending: false }),
      "server-1",
      "failed",
    );

    assert.equal(state.status, "ready");
    assert.equal(state.payload?.detail.capabilities.canManageInvites, true);
  });
});
