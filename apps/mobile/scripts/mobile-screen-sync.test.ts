import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVisibleMobileSyncHealth } from "../src/app/mobile-screen-sync";
import {
  createInitialMobileSyncSnapshot,
  markMobileSyncFailed,
  markMobileSyncSucceeded,
  type MobileSyncSnapshot,
} from "../src/sync/mobile-sync-contract";

const now = 1_782_800_000_000;

function freshSnapshot(source: MobileSyncSnapshot["source"]) {
  return markMobileSyncSucceeded(createInitialMobileSyncSnapshot(source), now);
}

function failedSnapshot(source: MobileSyncSnapshot["source"]) {
  return markMobileSyncFailed(createInitialMobileSyncSnapshot(source), now);
}

describe("mobile screen sync", () => {
  it("uses bootstrap health alone for passive screens", () => {
    const health = getVisibleMobileSyncHealth({
      bootstrapSyncState: freshSnapshot("bootstrap"),
      channelSyncState: failedSnapshot("channel"),
      currentTab: "notifications",
      dmSyncState: failedSnapshot("dm"),
      selectedDMConversationId: "dm-1",
      selectedWorkspaceChannelId: "channel-1",
      selectedWorkspaceServerId: "server-1",
      workspaceSyncState: failedSnapshot("workspace"),
    });

    assert.equal(health.status, "healthy");
  });

  it("includes the selected DM conversation sync only when a conversation is visible", () => {
    const hiddenConversationHealth = getVisibleMobileSyncHealth({
      bootstrapSyncState: freshSnapshot("bootstrap"),
      channelSyncState: freshSnapshot("channel"),
      currentTab: "messages",
      dmSyncState: failedSnapshot("dm"),
      selectedDMConversationId: null,
      selectedWorkspaceChannelId: null,
      selectedWorkspaceServerId: null,
      workspaceSyncState: freshSnapshot("workspace"),
    });
    const visibleConversationHealth = getVisibleMobileSyncHealth({
      bootstrapSyncState: freshSnapshot("bootstrap"),
      channelSyncState: freshSnapshot("channel"),
      currentTab: "messages",
      dmSyncState: failedSnapshot("dm"),
      selectedDMConversationId: "dm-1",
      selectedWorkspaceChannelId: null,
      selectedWorkspaceServerId: null,
      workspaceSyncState: freshSnapshot("workspace"),
    });

    assert.equal(hiddenConversationHealth.status, "healthy");
    assert.equal(visibleConversationHealth.status, "error");
  });

  it("includes workspace and channel health for the selected server overview", () => {
    const serverOnlyHealth = getVisibleMobileSyncHealth({
      bootstrapSyncState: freshSnapshot("bootstrap"),
      channelSyncState: failedSnapshot("channel"),
      currentTab: "overview",
      dmSyncState: freshSnapshot("dm"),
      selectedDMConversationId: null,
      selectedWorkspaceChannelId: null,
      selectedWorkspaceServerId: "server-1",
      workspaceSyncState: failedSnapshot("workspace"),
    });
    const channelHealth = getVisibleMobileSyncHealth({
      bootstrapSyncState: freshSnapshot("bootstrap"),
      channelSyncState: failedSnapshot("channel"),
      currentTab: "overview",
      dmSyncState: freshSnapshot("dm"),
      selectedDMConversationId: null,
      selectedWorkspaceChannelId: "channel-1",
      selectedWorkspaceServerId: null,
      workspaceSyncState: freshSnapshot("workspace"),
    });

    assert.equal(serverOnlyHealth.status, "error");
    assert.equal(channelHealth.status, "error");
  });
});
