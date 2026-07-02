import type { MobileTabId } from "../navigation/mobile-navigation";
import {
  summarizeMobileSyncHealth,
  type MobileSyncHealthSummary,
  type MobileSyncSnapshot,
} from "../sync/mobile-sync-contract";

export type VisibleMobileSyncHealthInput = {
  bootstrapSyncState: MobileSyncSnapshot;
  channelSyncState: MobileSyncSnapshot;
  currentTab: MobileTabId;
  dmSyncState: MobileSyncSnapshot;
  selectedDMConversationId: string | null;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  workspaceSyncState: MobileSyncSnapshot;
};

export function getVisibleMobileSyncHealth({
  bootstrapSyncState,
  channelSyncState,
  currentTab,
  dmSyncState,
  selectedDMConversationId,
  selectedWorkspaceChannelId,
  selectedWorkspaceServerId,
  workspaceSyncState,
}: VisibleMobileSyncHealthInput): MobileSyncHealthSummary {
  const snapshots = [bootstrapSyncState];

  if (currentTab === "messages" && selectedDMConversationId) {
    snapshots.push(dmSyncState);
  }

  if (currentTab === "overview") {
    if (selectedWorkspaceServerId) {
      snapshots.push(workspaceSyncState);
    }

    if (selectedWorkspaceChannelId) {
      snapshots.push(channelSyncState);
    }
  }

  if (currentTab === "voice" && selectedWorkspaceServerId) {
    snapshots.push(workspaceSyncState);
  }

  return summarizeMobileSyncHealth(snapshots);
}
