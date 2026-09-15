"use client";

import React from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { PermissionSettingsRow } from "@/components/settings/permission-settings-row";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { DESKTOP_PERMISSION_KEYS } from "@/lib/desktop/permissions";

export function PermissionsBlock({ row }: SettingsBlockProps) {
  const { t } = useI18n();
  return (
    <div data-block="perms" data-testid={`settings-block-${row.key}`}>
      {DESKTOP_PERMISSION_KEYS.filter((key) => key !== "globalShortcuts").map((key, index) => (
        <PermissionSettingsRow
          key={key}
          permissionKey={key}
          rowKey={`permission-${key}`}
          divider={index > 0}
          title={t(`settings.block.perms.label.${key}`)}
        />
      ))}
    </div>
  );
}
