"use client";

import type { ReactNode } from "react";
import { AppUpdateNotifier } from "@/components/app/app-update-notifier";
import { DesktopExperience } from "@/components/desktop/desktop-experience";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SoundEffectsProvider } from "@/components/providers/sound-effects-provider";
import { VoiceProvider } from "@/components/providers/voice-provider";
import type { VoiceProviderProps } from "@/components/providers/voice-context";
import { ActiveVoiceReminder } from "@/components/voice/active-voice-reminder";
import { useVoiceStore } from "@/store/voice-store";

type AuthenticatedAppProvidersProps = {
  children: ReactNode;
  currentUser: VoiceProviderProps["currentUser"];
  voiceFeatures?: "active" | "always" | "never";
};

export function AuthenticatedAppProviders({
  children,
  currentUser,
  voiceFeatures = "always",
}: AuthenticatedAppProvidersProps) {
  const activeVoiceChannelId = useVoiceStore((state) => state.activeChannelId);
  const shouldEnableVoiceFeatures =
    voiceFeatures === "always" ||
    (voiceFeatures === "active" && Boolean(activeVoiceChannelId));
  const content = (
    <>
      <AppUpdateNotifier />
      {children}
    </>
  );

  return (
    <SocketProvider>
      <SoundEffectsProvider currentUserId={currentUser.id}>
        {shouldEnableVoiceFeatures ? (
          <VoiceProvider currentUser={currentUser}>
            <DesktopExperience />
            {content}
            <ActiveVoiceReminder />
          </VoiceProvider>
        ) : (
          content
        )}
      </SoundEffectsProvider>
    </SocketProvider>
  );
}
