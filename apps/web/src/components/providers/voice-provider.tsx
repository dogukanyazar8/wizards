"use client";

import { useEffect, useState } from "react";
import { E2EVoiceProvider } from "@/components/providers/e2e-voice-provider";
import { LiveVoiceProvider } from "@/components/providers/live-voice-provider";
import type { VoiceProviderProps } from "@/components/providers/voice-context";
import { isExplicitE2ETestMode } from "@/lib/e2e/mode";
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

type VoiceProfileUpdate = {
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
};

type E2EVoiceProviderGateInput = {
  allowProductionBuild: string | undefined;
  nodeEnv: string | undefined;
  /** `NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA` — the `chromium-real-media` Playwright project. */
  realMedia: string | undefined;
  testMode: string | undefined;
};

/**
 * Ekran paylaşımı Ş0.3 (T13): `E2E_TEST_MODE` sahte sağlayıcıyı takar ve LiveKit'e hiç gidilmez.
 * Gerçek-medya projesi aynı test modunda koşar (seed, `/api/e2e` oturumu) ama gerçek
 * `getDisplayMedia` + gerçek LiveKit ister; bunu yalnız bu ikinci, açıkça `"true"` olan bayrak
 * açar. Bayrak yokken karar birebir eski `isExplicitE2ETestMode` kararıdır.
 */
export function shouldUseE2EVoiceMock(input: E2EVoiceProviderGateInput): boolean {
  if (input.realMedia === "true") {
    return false;
  }

  return isExplicitE2ETestMode({
    allowProductionBuild: input.allowProductionBuild,
    nodeEnv: input.nodeEnv,
    testMode: input.testMode,
  });
}

function isE2EVoiceMockEnabled() {
  return shouldUseE2EVoiceMock({
    allowProductionBuild: process.env.NEXT_PUBLIC_E2E_ALLOW_PRODUCTION_BUILD,
    nodeEnv: process.env.NODE_ENV,
    realMedia: process.env.NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA,
    testMode: process.env.NEXT_PUBLIC_E2E_TEST_MODE,
  });
}

export function mergeVoiceCurrentUserProfile(
  currentUser: VoiceProviderProps["currentUser"],
  profile: VoiceProfileUpdate,
): VoiceProviderProps["currentUser"] {
  const username = profile.username?.trim() || currentUser.username;

  return {
    ...currentUser,
    ...(profile.avatarUrl === undefined ? {} : { avatarUrl: profile.avatarUrl }),
    displayName:
      profile.displayName === undefined
        ? currentUser.displayName
        : profile.displayName?.trim() || username,
    username,
  };
}

function mergeProfileUpdate(
  current: VoiceProfileUpdate | undefined,
  update: VoiceProfileUpdate,
): VoiceProfileUpdate {
  return {
    ...current,
    ...update,
    username: update.username,
  };
}

function toVoiceProfileUpdate(input: {
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
}): VoiceProfileUpdate {
  return {
    ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
    ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
    username: input.username,
  };
}

function useVoiceCurrentUserSnapshot(currentUser: VoiceProviderProps["currentUser"]) {
  const [profileUpdate, setProfileUpdate] = useState<{
    profile: VoiceProfileUpdate;
    userId: string;
  } | null>(null);
  const snapshot =
    profileUpdate?.userId === currentUser.id
      ? mergeVoiceCurrentUserProfile(currentUser, profileUpdate.profile)
      : currentUser;

  useEffect(() => {
    const applyProfileUpdate = (profile: UserProfileUpdatedPayload) => {
      if (profile.userId !== currentUser.id) {
        return;
      }

      const update = toVoiceProfileUpdate(profile);
      setProfileUpdate((current) => ({
        profile:
          current?.userId === currentUser.id ? mergeProfileUpdate(current.profile, update) : update,
        userId: currentUser.id,
      }));
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

      const update = toVoiceProfileUpdate({
        ...(detail.avatarUrl === undefined ? {} : { avatarUrl: detail.avatarUrl }),
        ...(detail.displayName === undefined ? {} : { displayName: detail.displayName }),
        username,
      });
      setProfileUpdate((current) => ({
        profile:
          current?.userId === currentUser.id ? mergeProfileUpdate(current.profile, update) : update,
        userId: currentUser.id,
      }));
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
