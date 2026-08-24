"use client";

import { useContext, type ReactNode } from "react";
import { VoiceProvider } from "@/components/providers/voice-provider";
import { VoiceParticipantsContext, VoiceStateContext } from "@/components/providers/voice-context";
import type { AccountSettingsState } from "@/lib/account/actions";

type SettingsVoiceProviderBoundaryProps = {
  account: Pick<AccountSettingsState, "avatarUrl" | "displayName" | "id" | "username">;
  children: ReactNode;
};

export function SettingsVoiceProviderBoundary({
  account,
  children,
}: SettingsVoiceProviderBoundaryProps) {
  const existingVoiceState = useContext(VoiceStateContext);
  const existingVoiceParticipants = useContext(VoiceParticipantsContext);
  const username = account.username.trim() || "whispr";
  const displayName = account.displayName?.trim() || username;

  if (existingVoiceState && existingVoiceParticipants) {
    return children;
  }

  return (
    <VoiceProvider
      currentUser={{
        avatarUrl: account.avatarUrl,
        displayName,
        id: account.id,
        username,
      }}
    >
      {children}
    </VoiceProvider>
  );
}
