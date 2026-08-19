import { createHash } from "node:crypto";

import type { AppSocket } from "@/lib/socket/context";

type VoiceStateViewerSocket = {
  data: Partial<AppSocket["data"]>;
  join(room: string): Promise<void> | void;
  leave(room: string): Promise<void> | void;
};

export function getVoiceStateViewerRoomName(channelId: string) {
  return `voice-viewers:${channelId}`;
}

export function getAuthSessionSocketRoomName(sessionId: string) {
  const digest = createHash("sha256").update(sessionId).digest("base64url");
  return `auth-session:${digest}`;
}

export function getVoiceParticipantRoomName(channelId: string) {
  return `voice:${channelId}`;
}

export async function joinVoiceStateViewerRoomsForServer(
  socket: VoiceStateViewerSocket,
  serverId: string,
  channelIds: string[],
) {
  const uniqueChannelIds = Array.from(new Set(channelIds.filter(Boolean)));
  let trackedChannelsByServer = socket.data.voiceStateViewerChannelsByServer;
  if (!(trackedChannelsByServer instanceof Map)) {
    trackedChannelsByServer = new Map<string, Set<string>>();
    socket.data.voiceStateViewerChannelsByServer = trackedChannelsByServer;
  }

  const nextChannelIds = new Set(uniqueChannelIds);
  const currentChannelIds = trackedChannelsByServer.get(serverId);
  if (
    currentChannelIds?.size === nextChannelIds.size &&
    [...currentChannelIds].every((channelId) => nextChannelIds.has(channelId))
  ) {
    return;
  }

  await leaveVoiceStateViewerRoomsForServer(socket, serverId);

  const trackedChannelIds = new Set<string>();

  for (const channelId of uniqueChannelIds) {
    await socket.join(getVoiceStateViewerRoomName(channelId));
    trackedChannelIds.add(channelId);
  }

  if (trackedChannelIds.size > 0) {
    trackedChannelsByServer.set(serverId, trackedChannelIds);
  }
}

export async function leaveVoiceStateViewerRoomsForServer(
  socket: Pick<VoiceStateViewerSocket, "data" | "leave">,
  serverId: string,
  fallbackChannelIds: string[] = [],
) {
  const trackedChannelsByServer = socket.data.voiceStateViewerChannelsByServer;
  const channelIds =
    trackedChannelsByServer instanceof Map
      ? (trackedChannelsByServer.get(serverId) ?? new Set(fallbackChannelIds))
      : new Set(fallbackChannelIds);
  if (!channelIds || channelIds.size === 0) {
    return;
  }

  for (const channelId of channelIds) {
    await socket.leave(getVoiceStateViewerRoomName(channelId));
  }

  if (trackedChannelsByServer instanceof Map) {
    trackedChannelsByServer.delete(serverId);
  }
}
