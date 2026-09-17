"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useSocket } from "@/hooks/use-socket";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import { useAppStore } from "@/lib/store";
import { masterOutputGain } from "@/lib/voice/output-volume";
import { useVoiceStore } from "@/store/voice-store";
import {
  resolveSoundEffectPath,
  SOUND_PROFILE_PATHS,
  type SoundEffectKey,
  type SoundProfileKey,
  useSoundStore,
} from "@/store/sound-store";

type SoundEffectsProviderProps = {
  children: ReactNode;
  currentUserId: string;
};

function toAudioVolume(volume: number) {
  return Math.min(1, Math.max(0, volume / 100));
}

export function SoundEffectsProvider({ children, currentUserId }: SoundEffectsProviderProps) {
  const socket = useSocket();
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const hasTrackedActiveChannelRef = useRef(false);
  const previousActiveChannelIdRef = useRef<string | null>(null);
  const activeChannelId = useVoiceStore((state) => state.activeChannelId);
  const streamerModeActive = useAppStore(
    (state) => state.desktopStreamerModeEnabled || state.desktopStreamerModeDetected,
  );
  const {
    notificationVolume,
    voiceJoinEnabled,
    voiceJoinSoundFile,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveSoundFile,
    voiceLeaveVolume,
  } = useSoundStore(
    useShallow((state) => ({
      notificationVolume: state.notificationVolume,
      voiceJoinEnabled: state.voiceJoinEnabled,
      voiceJoinSoundFile: state.voiceJoinSoundFile,
      voiceJoinVolume: state.voiceJoinVolume,
      voiceLeaveEnabled: state.voiceLeaveEnabled,
      voiceLeaveSoundFile: state.voiceLeaveSoundFile,
      voiceLeaveVolume: state.voiceLeaveVolume,
    })),
  );

  const settingsQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const getAudio = useCallback((effect: SoundEffectKey, profile?: SoundProfileKey | string) => {
    const source = resolveSoundEffectPath(effect, profile);
    const cacheKey = `${effect}:${source}`;
    let audio = audioCacheRef.current.get(cacheKey);

    if (!audio) {
      audio = new Audio(source);
      audio.preload = "auto";
      audioCacheRef.current.set(cacheKey, audio);
    }

    return audio;
  }, []);

  const playSound = useCallback(
    (effect: SoundEffectKey, volume: number, profile?: SoundProfileKey | string) => {
      if (streamerModeActive || typeof window === "undefined" || volume <= 0) {
        return;
      }

      const baseAudio = getAudio(effect, profile);
      const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
      audio.volume =
        toAudioVolume(volume) * masterOutputGain(useVoiceStore.getState().masterOutputVolume);
      audio.play().catch(() => {
        // Browser autoplay policies can reject playback until the user interacts.
      });
    },
    [getAudio, streamerModeActive],
  );

  useEffect(() => {
    const warmUpAudio = () => {
      Object.entries(SOUND_PROFILE_PATHS).forEach(([profile, source]) => {
        const effect = source.includes("voice-join")
          ? "voiceJoin"
          : source.includes("voice-leave")
            ? "voiceLeave"
            : "notification";
        getAudio(effect, profile).load();
      });
    };

    window.addEventListener("pointerdown", warmUpAudio, { once: true });
    window.addEventListener("keydown", warmUpAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", warmUpAudio);
      window.removeEventListener("keydown", warmUpAudio);
    };
  }, [getAudio]);

  useEffect(() => {
    const previousActiveChannelId = previousActiveChannelIdRef.current;

    if (!hasTrackedActiveChannelRef.current) {
      hasTrackedActiveChannelRef.current = true;
      previousActiveChannelIdRef.current = activeChannelId;
      return;
    }

    if (previousActiveChannelId === activeChannelId) {
      return;
    }

    previousActiveChannelIdRef.current = activeChannelId;

    if (activeChannelId && voiceJoinEnabled) {
      playSound("voiceJoin", voiceJoinVolume, voiceJoinSoundFile);
      return;
    }

    if (previousActiveChannelId && voiceLeaveEnabled) {
      playSound("voiceLeave", voiceLeaveVolume, voiceLeaveSoundFile);
    }
  }, [
    activeChannelId,
    playSound,
    voiceJoinEnabled,
    voiceJoinSoundFile,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveSoundFile,
    voiceLeaveVolume,
  ]);

  useEffect(() => {
    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave" | "update";
      channelId: string;
      participants: Array<{ userId: string }>;
      userId: string;
    }) => {
      if (activeChannelId !== data.channelId) {
        return;
      }

      const currentUserStillInChannel = data.participants.some(
        (participant) => participant.userId === currentUserId,
      );

      if (data.action === "join") {
        if (data.userId !== currentUserId && currentUserStillInChannel && voiceJoinEnabled) {
          playSound("voiceJoin", voiceJoinVolume, voiceJoinSoundFile);
        }
        return;
      }

      if (
        data.action === "leave" &&
        currentUserStillInChannel &&
        data.userId !== currentUserId &&
        voiceLeaveEnabled
      ) {
        playSound("voiceLeave", voiceLeaveVolume, voiceLeaveSoundFile);
      }
    };

    socket.on("voice:state:update", handleVoiceStateUpdate);

    return () => {
      socket.off("voice:state:update", handleVoiceStateUpdate);
    };
  }, [
    activeChannelId,
    currentUserId,
    playSound,
    socket,
    voiceJoinEnabled,
    voiceJoinSoundFile,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveSoundFile,
    voiceLeaveVolume,
  ]);

  useEffect(() => {
    const handleIncomingNotification = () => {
      if (settingsQuery.data?.notificationSound === false) {
        return;
      }

      playSound("notification", notificationVolume, settingsQuery.data?.notificationSoundFile);
    };

    socket.on("notification:new", handleIncomingNotification);
    socket.on("voice:invite:received", handleIncomingNotification);

    return () => {
      socket.off("notification:new", handleIncomingNotification);
      socket.off("voice:invite:received", handleIncomingNotification);
    };
  }, [
    notificationVolume,
    playSound,
    settingsQuery.data?.notificationSound,
    settingsQuery.data?.notificationSoundFile,
    socket,
  ]);

  return children;
}
