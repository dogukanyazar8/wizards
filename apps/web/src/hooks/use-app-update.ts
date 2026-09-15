"use client";

import { useSyncExternalStore } from "react";
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  appUpdateQueryOptions,
  APP_UPDATE_INSTALL_KEY,
  APP_UPDATE_INTERVAL,
  hasActiveUpdateCall,
} from "@/lib/app-update-query";
import { nativeSettingsClient } from "@/lib/desktop/settings-client";
import { isWhisprDesktopRuntime, isWhisprDesktopUpdaterEnabled } from "@/lib/desktop/runtime";
import { useVoiceStore } from "@/store/voice-store";

// The shell marker is injected before startup and remains fixed for this document.
const subscribeRuntime = () => () => {};
const serverRuntime = () => false;

export function useAppUpdate(background = false, target?: "desktop" | "web") {
  const client = useQueryClient();
  const runtime = useSyncExternalStore(subscribeRuntime, isWhisprDesktopRuntime, serverRuntime);
  const desktop = target ? target === "desktop" : runtime;
  const enabled = !desktop || isWhisprDesktopUpdaterEnabled();
  const installing = useIsMutating({ mutationKey: APP_UPDATE_INSTALL_KEY }) > 0;
  const voiceActive = useVoiceStore(hasActiveUpdateCall);
  const query = useQuery({
    ...appUpdateQueryOptions(desktop),
    enabled: enabled && !installing,
    refetchInterval:
      background && !installing ? APP_UPDATE_INTERVAL[desktop ? "desktop" : "web"] : false,
  });
  const installStates = useMutationState({
    filters: { mutationKey: APP_UPDATE_INSTALL_KEY },
    select: (mutation) => mutation.state.status,
  });
  const mutation = useMutation({
    mutationKey: APP_UPDATE_INSTALL_KEY,
    retry: false,
    mutationFn: async (version: string) => {
      if (!desktop || !enabled || hasActiveUpdateCall(useVoiceStore.getState())) {
        throw new Error("Update installation is unavailable during a call.");
      }
      await nativeSettingsClient.install(version);
    },
  });
  const check = () => {
    if (!enabled || client.isMutating({ mutationKey: APP_UPDATE_INSTALL_KEY })) return;
    return query.refetch({ cancelRefetch: false });
  };
  const install = (version: string) => {
    if (client.isMutating({ mutationKey: APP_UPDATE_INSTALL_KEY }) || voiceActive) return;
    mutation.mutate(version);
  };
  return {
    query,
    desktop,
    enabled: enabled && query.data?.enabled !== false,
    installing,
    voiceActive,
    check,
    install,
    installFailed: installStates.at(-1) === "error",
  };
}
