"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import {
  openDesktopSystemSettings,
  readDesktopPermission,
  requestDesktopPermission,
  resolvePermissionControl,
  type DesktopPermissionKey,
} from "@/lib/desktop/permissions";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

export function PermissionSettingsRow({
  permissionKey,
  rowKey,
  title,
  description,
  divider = false,
  onChanged,
}: {
  permissionKey: DesktopPermissionKey;
  rowKey: string;
  title: string;
  description?: string | undefined;
  divider?: boolean;
  onChanged?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const desktop = isWhisprDesktopRuntime();
  const query = useQuery({
    queryKey: ["settings", "permission", permissionKey],
    queryFn: () => readDesktopPermission(permissionKey),
    staleTime: 0,
    retry: false,
  });
  const permission = query.isError ? "unknown" : (query.data ?? "unknown");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const control = resolvePermissionControl(permissionKey, permission, desktop);
  const { refetch } = query;
  useEffect(() => {
    const refresh = () => {
      if (!locked.current) void refetch();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refetch]);

  async function run() {
    if (locked.current || control.action === "done") return;
    locked.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const queryKey = ["settings", "permission", permissionKey];
      await client.cancelQueries({ queryKey });
      if (control.action === "system") {
        if (!(await openDesktopSystemSettings(permissionKey)))
          throw new Error("settings-unavailable");
      } else if (control.action === "request") {
        const next = await requestDesktopPermission(permissionKey);
        client.setQueryData(queryKey, next);
        if (next === "unknown") setFailed(true);
      }
      if (control.action !== "request") {
        const result = await refetch();
        if (result.isError) throw result.error;
        if (result.data === "unknown") setFailed(true);
      }
      onChanged?.();
      void client.invalidateQueries({ queryKey: ["settings", "desktop", "runtime"] });
    } catch {
      setFailed(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      data-permission={permissionKey}
      data-permission-state={permission}
      data-testid={`settings-permission-${permissionKey}`}
    >
      <SettingsRow
        rowKey={rowKey}
        title={title}
        description={description}
        divider={divider}
        badge={permission === "denied" ? t("settings.permission.denied") : undefined}
        badgeTone="danger"
        below={
          failed || query.isError || (permission === "denied" && !desktop) ? (
            <p
              className="mt-2 text-sm text-[hsl(var(--text-secondary))]"
              role={failed || query.isError ? "alert" : "status"}
            >
              {t(
                failed || query.isError
                  ? "settings.permission.error"
                  : "settings.permission.browserHelp",
              )}
            </p>
          ) : undefined
        }
        control={(ids) => (
          <SettingActions
            {...ids}
            testId={`settings-permission-action-${permissionKey}`}
            actions={[
              {
                label: t(
                  busy || query.isLoading ? "settings.permission.checking" : control.labelKey,
                ),
                disabled: busy || query.isLoading || control.action === "done",
                kind: control.action === "done" ? "success" : "primary",
                onClick: () => void run(),
              },
            ]}
          />
        )}
      />
    </div>
  );
}
