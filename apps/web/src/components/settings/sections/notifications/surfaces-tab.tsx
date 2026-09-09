"use client";

import React from "react";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §2. Bildirimler › Yüzeyler.
 *
 * Üç kutulu özet (`ns0`) `notifSummary` bloğundan, teslim kanallarının üçü (`nd2`, `na6`,
 * `na5`) Genel sekmesiyle ortak anahtardan gelir. Grup notu çalışma zamanına göre
 * **değişmez** — tek metin iki platformu birden açıklıyor (Ş9 §2).
 */
export function NotificationsSurfacesTab() {
  const tab = useNotificationsTabDef("surfaces");

  if (!tab) return null;

  return <NotificationsTabBody tab={tab} />;
}
