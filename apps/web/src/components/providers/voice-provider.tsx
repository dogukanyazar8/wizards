"use client";

import { useEffect, useState } from "react";
import { E2EVoiceProvider } from "@/components/providers/e2e-voice-provider";
import { LiveVoiceProvider } from "@/components/providers/live-voice-provider";
import type { VoiceProviderProps } from "@/components/providers/voice-context";
import { getSocket } from "@/lib/socket/client";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";

export {
  useVoiceConnection,
  useVoiceParticipants,
  useVoiceState,
} from "@/components/providers/voice-context";
export type {
  KrispAvailability,
  NoiseFilterTier,
  VoiceCameraStatus,
  VoiceParticipantViewModel,
  VoiceProviderProps,
  VoiceScreenShareViewModel,
} from "@/components/providers/voice-context";

type VoiceAccountUpdatedEventPayload = Partial<Omit<UserProfileUpdatedPayload, "userId">> & {
  id?: string;
};

function isE2EVoiceMockEnabled() {
  return process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

function mergeCurrentUserProfile(
  currentUser: VoiceProviderProps["currentUser"],
  profile: Pick<UserProfileUpdatedPayload, "avatarUrl" | "displayName" | "username">,
): VoiceProviderProps["currentUser"] {
  const username = profile.username?.trim() || currentUser.username;

  return {
    ...currentUser,
    avatarUrl: profile.avatarUrl ?? null,
    displayName: profile.displayName?.trim() || username,
    username,
  };
}

function useVoiceCurrentUserSnapshot(currentUser: VoiceProviderProps["currentUser"]) {
  const [snapshot, setSnapshot] = useState(currentUser);

  useEffect(() => {
    setSnapshot(currentUser);
  }, [currentUser]);

  useEffect(() => {
    const applyProfileUpdate = (profile: UserProfileUpdatedPayload) => {
      if (profile.userId !== currentUser.id) {
        return;
      }

      setSnapshot((current) => mergeCurrentUserProfile(current, profile));
    };

    const handleAccountUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail as VoiceAccountUpdatedEventPayload | null;
      const username = detail?.username;
      if (!detail || detail.id !== currentUser.id || typeof username !== "string") {
        return;
      }

      setSnapshot((current) =>
        mergeCurrentUserProfile(current, {
          avatarUrl: detail.avatarUrl ?? null,
          displayName: detail.displayName ?? null,
          username,
        }),
      );
    };

    const socket = getSocket();
    socket.on("user:profile:updated", applyProfileUpdate);
    window.addEventListener("whispr:account-updated", handleAccountUpdated);

    return () => {
      socket.off("user:profile:updated", applyProfileUpdate);
      window.removeEventListener("whispr:account-updated", handleAccountUpdated);
    };
  }, [currentUser.id]);

  return snapshot;
}

export function VoiceProvider(props: VoiceProviderProps) {
  const currentUser = useVoiceCurrentUserSnapshot(props.currentUser);
  const nextProps = { ...props, currentUser };

  if (isE2EVoiceMockEnabled()) {
    return <E2EVoiceProvider {...nextProps} />;
  }

  return <LiveVoiceProvider {...nextProps} />;
}
