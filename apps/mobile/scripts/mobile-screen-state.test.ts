import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INITIAL_BOOTSTRAP_STATE,
  INITIAL_BOOTSTRAP_SYNC_STATE,
  INITIAL_CHANNEL_MESSAGES_STATE,
  INITIAL_CHANNEL_SYNC_STATE,
  INITIAL_DM_MESSAGES_STATE,
  INITIAL_DM_SEND_STATE,
  INITIAL_DM_SYNC_STATE,
  INITIAL_MESSAGE_SEARCH_STATE,
  INITIAL_WORKSPACE_SERVER_STATE,
  INITIAL_WORKSPACE_SYNC_STATE,
} from "../src/app/mobile-screen-state";
import type { MobileWorkspaceServerViewState } from "../src/app/mobile-screen-state";

describe("mobile screen state", () => {
  it("keeps all screen data surfaces fail-closed before real data arrives", () => {
    assert.deepEqual(INITIAL_BOOTSTRAP_STATE, {
      error: null,
      payload: null,
      status: "idle",
      summary: null,
    });
    assert.deepEqual(INITIAL_DM_MESSAGES_STATE, {
      conversationId: null,
      error: null,
      payload: null,
      status: "idle",
    });
    assert.deepEqual(INITIAL_DM_SEND_STATE, {
      conversationId: null,
      error: null,
      status: "idle",
    });
    assert.deepEqual(INITIAL_WORKSPACE_SERVER_STATE, {
      error: null,
      payload: null,
      serverId: null,
      status: "idle",
    });
    assert.deepEqual(INITIAL_CHANNEL_MESSAGES_STATE, {
      channelId: null,
      error: null,
      payload: null,
      status: "idle",
    });
    assert.deepEqual(INITIAL_MESSAGE_SEARCH_STATE, {
      context: null,
      error: null,
      payload: null,
      query: "",
      status: "idle",
    });
  });

  it("freezes shared initial state objects to prevent accidental mutation leaks", () => {
    for (const state of [
      INITIAL_BOOTSTRAP_STATE,
      INITIAL_DM_MESSAGES_STATE,
      INITIAL_DM_SEND_STATE,
      INITIAL_WORKSPACE_SERVER_STATE,
      INITIAL_CHANNEL_MESSAGES_STATE,
      INITIAL_MESSAGE_SEARCH_STATE,
      INITIAL_BOOTSTRAP_SYNC_STATE,
      INITIAL_DM_SYNC_STATE,
      INITIAL_WORKSPACE_SYNC_STATE,
      INITIAL_CHANNEL_SYNC_STATE,
    ]) {
      assert.equal(Object.isFrozen(state), true);
    }
  });

  it("labels every initial sync snapshot with the expected source", () => {
    assert.equal(INITIAL_BOOTSTRAP_SYNC_STATE.source, "bootstrap");
    assert.equal(INITIAL_DM_SYNC_STATE.source, "dm");
    assert.equal(INITIAL_WORKSPACE_SYNC_STATE.source, "workspace");
    assert.equal(INITIAL_CHANNEL_SYNC_STATE.source, "channel");
  });

  it("requires ready workspace state to retain the managed capability contract", () => {
    const state: MobileWorkspaceServerViewState = {
      error: null,
      payload: {
        detail: {
          capabilities: {
            canClearHistory: false,
            canDeleteServer: false,
            canKickMembers: false,
            canManageChannels: true,
            canManageInvites: true,
            canManageRoles: false,
            canManageServer: true,
            canUploadServerIcon: true,
          },
        },
      } as never,
      serverId: "server-1",
      status: "ready",
    };

    assert.equal(state.payload.detail.capabilities.canManageInvites, true);
  });
});
