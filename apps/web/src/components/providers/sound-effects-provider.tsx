"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useSocket } from "@/hooks/use-socket";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import { useVoiceStore } from "@/store/voice-store";
import {
  SOUND_EFFECT_PATHS,
  type SoundEffectKey,
  useSoundStore,
} from "@/store/sound-store";

type SoundEffectsProviderProps = {
  children: ReactNode;
  currentUserId: string;
};

function toAudioVolume(volume: number) {
  return Math.min(1, Math.max(0, volume / 100));
}

export function SoundEffectsProvider({
  children,
  currentUserId,
}: SoundEffectsProviderProps) {
  const socket = useSocket();
  const audioCacheRef = useRef<Map<SoundEffectKey, HTMLAudioElement>>(new Map());
  const hasTrackedActiveChannelRef = useRef(false);
  const previousActiveChannelIdRef = useRef<string | null>(null);
  const activeChannelId = useVoiceStore((state) => state.activeChannelId);
  const {
    notificationVolume,
    voiceJoinEnabled,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveVolume,
  } = useSoundStore(
    useShallow((state) => ({
      notificationVolume: state.notificationVolume,
      voiceJoinEnabled: state.voiceJoinEnabled,
      voiceJoinVolume: state.voiceJoinVolume,
      voiceLeaveEnabled: state.voiceLeaveEnabled,
      voiceLeaveVolume: state.voiceLeaveVolume,
    })),
  );

  const settingsQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const getAudio = useCallback((effect: SoundEffectKey) => {
    let audio = audioCacheRef.current.get(effect);

    if (!audio) {
      audio = new Audio(SOUND_EFFECT_PATHS[effect]);
      audio.preload = "auto";
      audioCacheRef.current.set(effect, audio);
    }

    return audio;
  }, []);

  const playSound = useCallback(
    (effect: SoundEffectKey, volume: number) => {
      if (typeof window === "undefined" || volume <= 0) {
        return;
      }

      const baseAudio = getAudio(effect);
      const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
      audio.volume = toAudioVolume(volume);
      audio.play().catch(() => {
        // Browser autoplay policies can reject playback until the user interacts.
      });
    },
    [getAudio],
  );

  useEffect(() => {
    const warmUpAudio = () => {
      (Object.keys(SOUND_EFFECT_PATHS) as SoundEffectKey[]).forEach((effect) => {
        getAudio(effect).load();
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
      playSound("voiceJoin", voiceJoinVolume);
      return;
    }

    if (previousActiveChannelId && voiceLeaveEnabled) {
      playSound("voiceLeave", voiceLeaveVolume);
    }
  }, [
    activeChannelId,
    playSound,
    voiceJoinEnabled,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveVolume,
  ]);

  useEffect(() => {
    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave";
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
          playSound("voiceJoin", voiceJoinVolume);
        }
        return;
      }

      if (currentUserStillInChannel && data.userId !== currentUserId && voiceLeaveEnabled) {
        playSound("voiceLeave", voiceLeaveVolume);
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
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveVolume,
  ]);

  useEffect(() => {
    const handleIncomingNotification = () => {
      if (settingsQuery.data?.notificationSound === false) {
        return;
      }

      playSound("notification", notificationVolume);
    };

    socket.on("notification:new", handleIncomingNotification);

    return () => {
      socket.off("notification:new", handleIncomingNotification);
    };
  }, [notificationVolume, playSound, settingsQuery.data?.notificationSound, socket]);

  return children;
}
