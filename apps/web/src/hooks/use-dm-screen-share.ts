"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  LocalTrack,
  LocalVideoTrack,
  Room,
  Track,
  type RemoteVideoTrack,
} from "livekit-client";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { fetchLiveKitToken } from "@/lib/voice/client";
import {
  getScreenShareCaptureOptions,
  getScreenSharePublishOptions,
} from "@/lib/voice/screen-share";
import { useVoiceStore } from "@/store/voice-store";

export type IncomingDMScreenShare = {
  conversationId: string;
  countdown: number;
  displayName: string | null;
  userId: string;
  username: string;
};

export type ActiveDMScreenShare = {
  displayName: string | null;
  isLocal: boolean;
  track: LocalVideoTrack | RemoteVideoTrack | null;
  userId: string;
  username: string;
};

type UseDMScreenShareInput = {
  conversationId: string;
  currentUserDisplayName: string;
  currentUserId: string;
  currentUserUsername: string;
};

function isScreenShareSupported() {
  return Boolean(
    typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia,
  );
}

function isScreenSharePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "AbortError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|aborterror|securityerror/i.test(
      error.message,
    )
  );
}

async function stopRoomTracks(room: Room) {
  const localTracks = room.localParticipant
    .getTrackPublications()
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => track instanceof LocalTrack);

  await Promise.all(
    localTracks.map((track) =>
      room.localParticipant.unpublishTrack(track, false).catch(() => undefined),
    ),
  );

  for (const track of localTracks) {
    track.stop();
    track.detach();
  }

  await room.disconnect(true).catch(() => undefined);
}

function findScreenShareTrack(room: Room, localUserId: string): ActiveDMScreenShare | null {
  for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
    const publication = participant
      .getTrackPublications()
      .find(
        (candidate) =>
          candidate.source === Track.Source.ScreenShare &&
          !candidate.isMuted &&
          candidate.videoTrack,
      );

    if (!publication?.videoTrack) {
      continue;
    }

    const metadata = parseParticipantMetadata(participant.metadata);
    const username =
      metadata.username ??
      metadata.displayName ??
      participant.name ??
      participant.identity;

    return {
      displayName: metadata.displayName ?? participant.name ?? null,
      isLocal: participant.identity === localUserId,
      track: publication.videoTrack,
      userId: participant.identity,
      username,
    };
  }

  return null;
}

function parseParticipantMetadata(metadata: string | undefined) {
  if (!metadata) {
    return {} as { displayName?: string | null; username?: string | null };
  }

  try {
    return JSON.parse(metadata) as {
      displayName?: string | null;
      username?: string | null;
    };
  } catch {
    return {} as { displayName?: string | null; username?: string | null };
  }
}

export function useDMScreenShare({
  conversationId,
  currentUserDisplayName,
  currentUserId,
  currentUserUsername,
}: UseDMScreenShareInput) {
  const { t } = useI18n();
  const socket = useSocket();
  const roomRef = useRef<Room | null>(null);
  const isSharingRef = useRef(false);
  const [activeShare, setActiveShare] = useState<ActiveDMScreenShare | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [error, setError] = useState<string | null>(null);
  const [incomingShare, setIncomingShare] = useState<IncomingDMScreenShare | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const clearRoom = useCallback(async (emitStop: boolean) => {
    const room = roomRef.current;
    roomRef.current = null;
    setConnectionState(ConnectionState.Disconnected);
    setActiveShare(null);

    if (room) {
      room.removeAllListeners();
      await stopRoomTracks(room);
    }

    if (emitStop) {
      socket.emit("dm:screenshare:stop", { conversationId });
    }

    isSharingRef.current = false;
  }, [conversationId, socket]);

  const syncActiveShare = useCallback(() => {
    const room = roomRef.current;
    setActiveShare(room ? findScreenShareTrack(room, currentUserId) : null);
  }, [currentUserId]);

  const connectRoom = useCallback(async () => {
    const tokenResponse = await fetchLiveKitToken({ conversationId });
    const nextRoom = new Room();
    roomRef.current = nextRoom;

    const handleTrackUpdate = () => {
      syncActiveShare();
    };

    nextRoom.on("connectionStateChanged", (state) => {
      setConnectionState(state);
    });
    nextRoom.on("participantConnected", handleTrackUpdate);
    nextRoom.on("participantDisconnected", handleTrackUpdate);
    nextRoom.on("participantMetadataChanged", handleTrackUpdate);
    nextRoom.on("participantNameChanged", handleTrackUpdate);
    nextRoom.on("localTrackPublished", handleTrackUpdate);
    nextRoom.on("localTrackUnpublished", handleTrackUpdate);
    nextRoom.on("trackPublished", handleTrackUpdate);
    nextRoom.on("trackUnpublished", handleTrackUpdate);
    nextRoom.on("trackSubscribed", handleTrackUpdate);
    nextRoom.on("trackUnsubscribed", handleTrackUpdate);

    await nextRoom.connect(tokenResponse.url, tokenResponse.token);
    setConnectionState(nextRoom.state);
    syncActiveShare();
    return nextRoom;
  }, [conversationId, syncActiveShare]);

  const startShare = useCallback(async () => {
    if (isStarting || isSharingRef.current) {
      return;
    }

    if (!isScreenShareSupported()) {
      setError(t("screenShare.errors.notSupported"));
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      await clearRoom(false);
      const nextRoom = await connectRoom();
      const currentQuality = useVoiceStore.getState().screenShareQuality;
      const publication = await nextRoom.localParticipant.setScreenShareEnabled(
        true,
        getScreenShareCaptureOptions(currentQuality),
        getScreenSharePublishOptions(currentQuality),
      );
      const localTrack = publication?.track;

      if (localTrack instanceof LocalVideoTrack) {
        localTrack.mediaStreamTrack.addEventListener(
          "ended",
          () => {
            void clearRoom(true);
          },
          { once: true },
        );
      }

      isSharingRef.current = true;
      setActiveShare({
        displayName: currentUserDisplayName,
        isLocal: true,
        track: localTrack instanceof LocalVideoTrack ? localTrack : null,
        userId: currentUserId,
        username: currentUserUsername,
      });
      socket.emit("dm:screenshare:start", { conversationId });
    } catch (startError) {
      await clearRoom(false);
      setError(
        isScreenSharePermissionDenied(startError)
          ? t("screenShare.errors.permissionDenied")
          : t("screenShare.errors.startFailed"),
      );
    } finally {
      setIsStarting(false);
    }
  }, [
    clearRoom,
    connectRoom,
    conversationId,
    currentUserDisplayName,
    currentUserId,
    currentUserUsername,
    isStarting,
    socket,
    t,
  ]);

  const acceptIncomingShare = useCallback(async () => {
    const incoming = incomingShare;
    if (!incoming) {
      return;
    }

    setIncomingShare(null);
    setError(null);
    socket.emit("dm:screenshare:accept", {
      conversationId,
      fromUserId: incoming.userId,
    });

    try {
      await clearRoom(false);
      await connectRoom();
      syncActiveShare();
    } catch {
      await clearRoom(false);
      setError(t("dm.screenShare.errors.connectFailed"));
    }
  }, [clearRoom, connectRoom, conversationId, incomingShare, socket, syncActiveShare, t]);

  const declineIncomingShare = useCallback(() => {
    const incoming = incomingShare;
    if (!incoming) {
      return;
    }

    socket.emit("dm:screenshare:decline", {
      conversationId,
      fromUserId: incoming.userId,
    });
    setIncomingShare(null);
  }, [conversationId, incomingShare, socket]);

  const stopSharing = useCallback(async () => {
    await clearRoom(true);
  }, [clearRoom]);

  const stopViewing = useCallback(async () => {
    await clearRoom(false);
  }, [clearRoom]);

  useEffect(() => {
    const handleStarted = (data: {
      conversationId: string;
      displayName: string | null;
      userId: string;
      username: string;
    }) => {
      if (data.conversationId !== conversationId || data.userId === currentUserId) {
        return;
      }

      setIncomingShare({
        ...data,
        countdown: 10,
      });
    };

    const handleDeclined = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId !== conversationId || !isSharingRef.current) {
        return;
      }

      setError(t("dm.screenShare.declined"));
      void clearRoom(true);
    };

    const handleStopped = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId !== conversationId || data.userId === currentUserId) {
        return;
      }

      setIncomingShare(null);
      setError(t("dm.screenShare.stopped"));
      void clearRoom(false);
    };

    socket.on("dm:screenshare:started", handleStarted);
    socket.on("dm:screenshare:declined", handleDeclined);
    socket.on("dm:screenshare:stopped", handleStopped);

    return () => {
      socket.off("dm:screenshare:started", handleStarted);
      socket.off("dm:screenshare:declined", handleDeclined);
      socket.off("dm:screenshare:stopped", handleStopped);
    };
  }, [clearRoom, conversationId, currentUserId, socket, t]);

  const incomingShareUserId = incomingShare?.userId;

  useEffect(() => {
    if (!incomingShareUserId) {
      return;
    }

    const interval = setInterval(() => {
      setIncomingShare((current) =>
        current
          ? {
              ...current,
              countdown: Math.max(0, current.countdown - 1),
            }
          : current,
      );
    }, 1000);

    const timeout = setTimeout(() => {
      socket.emit("dm:screenshare:decline", {
        conversationId,
        fromUserId: incomingShareUserId,
      });
      setIncomingShare(null);
    }, 10_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [conversationId, incomingShareUserId, socket]);

  useEffect(() => {
    return () => {
      const shouldEmitStop = isSharingRef.current;
      void clearRoom(shouldEmitStop);
    };
  }, [clearRoom]);

  return {
    acceptIncomingShare,
    activeShare,
    clearError: () => setError(null),
    connectionState,
    declineIncomingShare,
    error,
    incomingShare,
    isStarting,
    startShare,
    stopSharing,
    stopViewing,
  };
}
