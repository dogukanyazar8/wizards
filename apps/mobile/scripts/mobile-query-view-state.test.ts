import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  toMobileBootstrapViewState,
  toMobileChannelMessagesViewState,
  toMobileMessageSearchViewState,
  toMobileSyncSnapshot,
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

describe("mobile query view-state adapters", () => {
  it("derives bootstrap readiness without a duplicate fetch state machine", () => {
    const payload = { home: { directMessages: { recent: [], unreadCount: 0 }, servers: { recent: [] } } };
    const state = toMobileBootstrapViewState(
      { ...idleQuery, data: payload as never, dataUpdatedAt: 42, isPending: false },
      () => ({ directMessageCount: 0, serverCount: 0 }) as never,
      "failed",
    );

    assert.equal(state.status, "ready");
    assert.equal(state.payload, payload);
  });

  it("flattens channel pages and keeps the newest duplicate", () => {
    const state = toMobileChannelMessagesViewState(
      {
        ...idleQuery,
        data: ({
          pages: [
            { messages: [{ id: "2", content: "new" } as never] },
            {
              messages: [
                { id: "1", content: "old" } as never,
                { id: "2", content: "old" } as never,
              ],
            },
          ],
        } as unknown) as never,
        isPending: false,
      },
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
      toMobileSyncSnapshot({ ...idleQuery, isFetching: true }, "workspace").status,
      "syncing",
    );
    const failed = toMobileSyncSnapshot(
      { ...idleQuery, errorUpdatedAt: 84, failureCount: 2, isError: true, isPending: false },
      "workspace",
    );
    assert.equal(failed.status, "error");
    assert.equal(failed.failureCount, 2);
    assert.equal(failed.lastFailedAt, 84);
  });
});
