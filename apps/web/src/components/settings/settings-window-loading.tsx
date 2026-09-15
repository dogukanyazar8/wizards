"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useId } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Modal } from "@/components/ui/modal";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** The intercepted route stays interactive while its authenticated payload loads. */
export function SettingsWindowLoading() {
  const router = useRouter();
  const { t } = useI18n();
  const titleId = useId();
  const close = useCallback(() => router.back(), [router]);
  const metrics = SETTINGS_METRICS.window;

  return (
    <Modal
      open
      onClose={close}
      title={t("settings.title")}
      closeLabel={t("settings.close")}
      hideHeader
      className="settings-window-card flex flex-col overflow-hidden p-0 sm:p-0"
      overlayClassName="settings-window-viewport items-center"
      overlayStyle={{
        ["--settings-window-viewport-padding" as string]: pxToRem(metrics.viewportPadding),
        ["--settings-window-viewport-padding-small" as string]: pxToRem(metrics.edgePaddingSmall),
      }}
      style={{
        ["--settings-window-width" as string]: pxToRem(metrics.width),
        ["--settings-window-height" as string]: pxToRem(metrics.height),
        ["--settings-window-radius" as string]: pxToRem(metrics.radius),
        background: "hsl(var(--surface-base))",
      }}
    >
      <SettingsHeader
        titleId={titleId}
        titleKey="settings.title"
        leadKey="settings.control.block.loading"
        saveState="idle"
        onClose={close}
      />
      <div
        aria-busy="true"
        className="min-h-0 overflow-y-auto overscroll-contain"
        data-testid="settings-window-loading"
        role="status"
        style={{
          padding: `${pxToRem(SETTINGS_METRICS.body.paddingTop)} ${pxToRem(SETTINGS_METRICS.body.paddingX)} ${pxToRem(SETTINGS_METRICS.body.paddingBottom)}`,
        }}
      >
        <span className="sr-only">{t("settings.control.block.loading")}</span>
        <SettingsSkeleton />
      </div>
    </Modal>
  );
}
