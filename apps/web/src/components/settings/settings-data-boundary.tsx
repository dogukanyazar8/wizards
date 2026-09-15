"use client";

import React, { type ReactNode } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsSkeleton } from "./settings-skeleton";

export type SettingsReadState = {
  pending: boolean;
  failed: boolean;
  retry: () => void;
};

/** Only a cold read replaces controls. Cached controls survive background refresh/errors. */
export function SettingsDataBoundary({
  children,
  pending,
  failed,
  retry,
}: SettingsReadState & { children: ReactNode }) {
  const { t } = useI18n();
  if (failed)
    return (
      <div role="alert" className="p-4 text-sm text-app-muted">
        {t("settings.loadError")}{" "}
        <button type="button" className="underline" onClick={retry}>
          {t("settings.account.banner.retry")}
        </button>
      </div>
    );
  return pending ? <SettingsSkeleton /> : <>{children}</>;
}
