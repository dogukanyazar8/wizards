"use client";

import type { ReactNode } from "react";
import { AppUpdateNotifier } from "@/components/app/app-update-notifier";
import { DesktopExperience } from "@/components/desktop/desktop-experience";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SoundEffectsProvider } from "@/components/providers/sound-effects-provider";
import { VoiceProvider } from "@/components/providers/voice-provider";
import type { VoiceProviderProps } from "@/components/providers/voice-context";
import { ActiveVoiceReminder } from "@/components/voice/active-voice-reminder";

type AuthenticatedAppProvidersProps = {
  children: ReactNode;
  currentUser: VoiceProviderProps["currentUser"];
};

export function AuthenticatedAppProviders({
  children,
  currentUser,
}: AuthenticatedAppProvidersProps) {
  return (
    <SocketProvider>
      <SoundEffectsProvider currentUserId={currentUser.id}>
        <VoiceProvider currentUser={currentUser}>
          <DesktopExperience />
          <AppUpdateNotifier />
          {children}
          <ActiveVoiceReminder />
        </VoiceProvider>
      </SoundEffectsProvider>
    </SocketProvider>
  );
}
