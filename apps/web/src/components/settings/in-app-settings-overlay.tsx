"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@wizards/ui";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import {
  fetchSettingsBootstrap,
  settingsQueryKeys,
} from "@/lib/settings/client";
import type { SettingsSelection } from "@/lib/settings/navigation";

type InAppSettingsOverlayProps = {
  onClose: () => void;
  open: boolean;
};

const DEFAULT_SELECTION = {
  panel: null,
  section: "account",
} satisfies SettingsSelection;

export function InAppSettingsOverlay({ onClose, open }: InAppSettingsOverlayProps) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<SettingsSelection>(DEFAULT_SELECTION);
  const settingsBootstrapQuery = useQuery({
    enabled: open,
    queryFn: fetchSettingsBootstrap,
    queryKey: settingsQueryKeys.bootstrap,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          aria-label={t("settings.overlay.title")}
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center p-1.5 sm:p-3"
          data-testid="in-app-settings-overlay"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          role="dialog"
        >
          <button
            aria-label={t("common.close")}
            className="absolute inset-0 cursor-default bg-[hsl(var(--backdrop)/0.52)] backdrop-blur-md"
            onClick={onClose}
            type="button"
          />

          <motion.div
            animate={{ scale: 1, y: 0 }}
            className="app-shell relative flex h-[min(96dvh,940px)] w-[calc(100vw-0.75rem)] max-w-[1460px] min-w-0 overflow-hidden rounded-[18px] border border-[hsl(var(--border)/0.56)] bg-[radial-gradient(circle_at_14%_10%,hsl(var(--primary)/0.09),transparent_28%),radial-gradient(circle_at_86%_14%,hsl(var(--surface-highlight)/0.48),transparent_26%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--surface-base)))] shadow-[0_24px_78px_hsl(var(--shadow-color)/0.18)] sm:h-[min(94dvh,940px)] sm:w-[min(98vw,1460px)] sm:rounded-[22px]"
            exit={{ scale: 0.985, y: 10 }}
            initial={{ scale: 0.985, y: 10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              aria-label={t("common.close")}
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-xl border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface)/0.88)] text-app-muted shadow-[0_10px_24px_hsl(var(--shadow-color)/0.07)] transition hover:bg-[hsl(var(--surface-soft)/0.9)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="in-app-settings-close"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>

            {settingsBootstrapQuery.isLoading ? (
              <div className="flex h-full w-full items-center justify-center p-6">
                <div className="max-w-sm rounded-[22px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface)/0.84)] p-4 text-center shadow-[0_18px_52px_hsl(var(--shadow-color)/0.1)] backdrop-blur-xl">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
                    <Settings2 className="h-5 w-5 animate-pulse motion-reduce:animate-none" />
                  </span>
                  <h2 className="mt-4 text-lg font-extrabold text-app-foreground">
                    {t("settings.overlay.loading")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {t("settings.overlay.description")}
                  </p>
                </div>
              </div>
            ) : settingsBootstrapQuery.isError || !settingsBootstrapQuery.data ? (
              <div className="flex h-full w-full items-center justify-center p-6">
                <div className="max-w-md rounded-[22px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface)/0.84)] p-4 text-center shadow-[0_18px_52px_hsl(var(--shadow-color)/0.1)] backdrop-blur-xl">
                  <h2 className="text-lg font-extrabold text-app-foreground">
                    {t("settings.overlay.error")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {t("settings.overlay.description")}
                  </p>
                  <Button
                    className="mt-5"
                    onClick={() => {
                      void settingsBootstrapQuery.refetch();
                    }}
                    type="button"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("settings.overlay.retry")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid h-full w-full min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden p-1.5 sm:p-2.5 lg:grid-cols-[292px_minmax(0,1fr)] lg:grid-rows-1 xl:grid-cols-[308px_minmax(0,1fr)]">
                <SettingsSidebar
                  currentUser={{
                    avatarUrl: settingsBootstrapQuery.data.initialAccount.avatarUrl,
                    displayName:
                      settingsBootstrapQuery.data.initialAccount.displayName ??
                      settingsBootstrapQuery.data.initialAccount.username,
                    username: settingsBootstrapQuery.data.initialAccount.username,
                  }}
                  mode="dialog"
                  onBackToChannels={onClose}
                  onSelectionChange={setSelection}
                  selection={selection}
                />
                <section
                  className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[16px] px-1 pb-3 pt-10 lg:px-1.5 lg:pt-1.5"
                  data-settings-scroll-root
                >
                  <SettingsPanel
                    {...settingsBootstrapQuery.data}
                    className="pb-4"
                    onSelectionChange={setSelection}
                    selection={selection}
                  />
                </section>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
