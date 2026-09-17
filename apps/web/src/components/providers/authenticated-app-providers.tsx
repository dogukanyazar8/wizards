"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppUpdateNotifier } from "@/components/app/app-update-notifier";
import { UiScaleBoundary } from "@/components/app/ui-scale-boundary";
import { DesktopExperience } from "@/components/desktop/desktop-experience";
import { DesktopGameActivity } from "@/components/desktop/desktop-game-activity";
import { DesktopNavigationBridge } from "@/components/desktop/desktop-navigation-bridge";
import { DMCallProvider } from "@/components/providers/dm-call-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SoundEffectsProvider } from "@/components/providers/sound-effects-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { VoiceProvider } from "@/components/providers/voice-provider";
import type { VoiceProviderProps } from "@/components/providers/voice-context";
import { ScreenShareStatusBar } from "@/components/voice/screen-share-status-bar";
import { ActiveVoiceReminder } from "@/components/voice/active-voice-reminder";
import { useVoiceStore } from "@/store/voice-store";

type AuthenticatedAppProvidersProps = {
  children: ReactNode;
  currentUser: VoiceProviderProps["currentUser"];
  uploadthingEnabled?: boolean;
  voiceFeatures?: "active" | "always" | "never";
};

type AuthenticatedAppRuntime = {
  currentUser: VoiceProviderProps["currentUser"];
  uploadthingEnabled: boolean;
};

const AuthenticatedAppRuntimeContext = createContext<AuthenticatedAppRuntime | null>(null);

export function useAuthenticatedAppRuntime(): AuthenticatedAppRuntime {
  const runtime = useContext(AuthenticatedAppRuntimeContext);

  if (!runtime) {
    throw new Error("useAuthenticatedAppRuntime must be used within AuthenticatedAppProviders");
  }

  return runtime;
}

export function AuthenticatedAppProviders({
  children,
  currentUser,
  uploadthingEnabled = false,
  voiceFeatures = "always",
}: AuthenticatedAppProvidersProps) {
  const activeVoiceChannelId = useVoiceStore((state) => state.activeChannelId);
  const shouldEnableVoiceFeatures =
    voiceFeatures === "always" || (voiceFeatures === "active" && Boolean(activeVoiceChannelId));
  const content = (
    <>
      <DesktopNavigationBridge />
      <DesktopGameActivity userId={currentUser.id} />
      <UiScaleBoundary />
      <AppUpdateNotifier />
      {children}
    </>
  );

  return (
    <AuthenticatedAppRuntimeContext.Provider value={{ currentUser, uploadthingEnabled }}>
      <SocketProvider>
        {/*
         * Bahsedilmeler Ş8: toast yığını oturum ağacının **en dışında** durur. İçeride olsaydı
         * ses ya da çağrı sağlayıcısı yeniden kurulduğunda görünen toast'lar sessizce düşerdi.
         */}
        <ToastProvider>
          <SoundEffectsProvider currentUserId={currentUser.id}>
            {shouldEnableVoiceFeatures ? (
              <VoiceProvider currentUser={currentUser}>
                <DMCallProvider>
                  <DesktopExperience />
                  {content}
                  <ActiveVoiceReminder />
                  <ScreenShareStatusBar />
                </DMCallProvider>
              </VoiceProvider>
            ) : (
              content
            )}
          </SoundEffectsProvider>
        </ToastProvider>
      </SocketProvider>
    </AuthenticatedAppRuntimeContext.Provider>
  );
}
