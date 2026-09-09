"use client";

import React from "react";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §5. Bildirimler › Sesler.
 *
 * Dört ses satırının dördü de çalar; `Önizle` seçili profili ve seviyeyi gerçekten duyurur ve
 * yeni önizleme eskisini keser (`settingsSoundPreview`). Grup notu tasarımdan geldiği gibi
 * korunuyor (`Ses ayarları bu cihaza kaydedilir.`) ama davranış K3 gereği sunucudadır —
 * `SPEC_DEVIATIONS` #10 bu çelişkiyi kayda geçiriyor.
 */
export function NotificationsSoundsTab() {
  const tab = useNotificationsTabDef("sounds");

  if (!tab) return null;

  return <NotificationsTabBody tab={tab} />;
}
