"use client";

import React, { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceStore } from "@/store/voice-store";
import { Modal } from "@/components/ui/modal";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import type { DesktopShortcutAssignments } from "@/lib/desktop/shortcuts";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import {
  NATIVE_DESKTOP_SETTINGS_KEY,
  nativeSettingsClient,
  type NativeDesktopSettings,
} from "@/lib/desktop/settings-client";

function useNativeSettingsController() {
  const { t } = useI18n();
  const client = useQueryClient();
  const locked = useRef(false);
  const pendingCount = useIsMutating({ mutationKey: NATIVE_DESKTOP_SETTINGS_KEY });
  const [shortcutDraft, setShortcutDraft] = useState<DesktopShortcutAssignments | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => void;
  } | null>(null);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: NATIVE_DESKTOP_SETTINGS_KEY,
    queryFn: async () => {
      const next = await nativeSettingsClient.read();
      const previous = client.getQueryData<NativeDesktopSettings>(NATIVE_DESKTOP_SETTINGS_KEY);
      if (
        previous?.updater.checkedAt &&
        previous.updater.currentVersion === next.updater.currentVersion &&
        previous.updater.enabled === next.updater.enabled
      ) {
        next.updater = previous.updater;
      }
      return next;
    },
    enabled: isWhisprDesktopRuntime() && pendingCount === 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const mutation = useMutation({
    mutationKey: NATIVE_DESKTOP_SETTINGS_KEY,
    mutationFn: async (operation: () => Promise<string | void>) => {
      await client.cancelQueries({ queryKey: NATIVE_DESKTOP_SETTINGS_KEY });
      return operation();
    },
  });
  async function update(patch: Partial<NativeDesktopSettings>) {
    await client.cancelQueries({ queryKey: NATIVE_DESKTOP_SETTINGS_KEY });
    client.setQueryData<NativeDesktopSettings>(NATIVE_DESKTOP_SETTINGS_KEY, (current) =>
      current ? { ...current, ...patch } : current,
    );
    if (patch.shortcuts)
      useVoiceStore.getState().setDesktopGlobalShortcutsEnabled(patch.shortcuts.enabled);
    void client.invalidateQueries({ queryKey: ["settings", "desktop", "runtime"] });
  }
  async function run(operation: () => Promise<string | void>, success?: string) {
    if (locked.current || client.isMutating({ mutationKey: NATIVE_DESKTOP_SETTINGS_KEY }) > 0)
      return false;
    locked.current = true;
    setMessage("");
    try {
      const result = await mutation.mutateAsync(operation);
      setMessage(result ?? success ?? t("settings.native.saved"));
      return true;
    } catch {
      // Keep cached values and the user's draft. Native errors can contain OS details.
      return false;
    } finally {
      locked.current = false;
    }
  }
  return {
    confirmation,
    setConfirmation,
    shortcutDraft,
    setShortcutDraft,
    query,
    data: query.data,
    busy: pendingCount > 0 || mutation.isPending,
    failed: mutation.isError,
    message,
    run,
    update,
  };
}

const NativeSettingsContext = createContext<ReturnType<typeof useNativeSettingsController> | null>(
  null,
);
export const useNativeDesktopSettings = () => useContext(NativeSettingsContext);

export function NativeDesktopSettingsProvider({ children }: { children: ReactNode }) {
  const state = useNativeSettingsController();
  const { t } = useI18n();
  const readFailed = state.query.isError && !state.data;
  return (
    <NativeSettingsContext.Provider value={state}>
      {(state.failed || readFailed) && (
        <div className="px-5 py-3 text-sm text-[hsl(var(--danger))]" role="alert">
          {t(readFailed ? "settings.native.loadError" : "settings.native.error")}
          {readFailed && (
            <button
              className="ml-2 underline"
              type="button"
              onClick={() => void state.query.refetch()}
            >
              {t("settings.account.banner.retry")}
            </button>
          )}
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className="min-h-5 px-5 text-sm text-[hsl(var(--text-muted))]"
      >
        {state.busy ? t("settings.native.saving") : state.message}
      </div>
      {children}
      <Modal
        open={!!state.confirmation}
        onClose={() => state.setConfirmation(null)}
        title={state.confirmation?.title ?? ""}
        description={state.confirmation?.description ?? ""}
        closeLabel={t("settings.native.shortcuts.cancel")}
      >
        <div className="flex justify-end p-5">
          <SettingActions
            actions={[
              {
                label: t("settings.native.shortcuts.cancel"),
                onClick: () => state.setConfirmation(null),
              },
              {
                label: t("settings.native.recovery.run"),
                disabled: state.busy,
                onClick: () => {
                  const action = state.confirmation?.action;
                  state.setConfirmation(null);
                  action?.();
                },
              },
            ]}
          />
        </div>
      </Modal>
    </NativeSettingsContext.Provider>
  );
}
