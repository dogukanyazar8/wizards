"use client";

import React from "react";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §7. Bildirimler › İstisnalar.
 *
 * Liste `exceptions` bloğundan gelir ve **gerçek** veridir: boşken grup boş durum metnini
 * yazar, uydurma satır çizilmez. `ne1` sapma #9 gereği kendi `Varsayılanlar` grubunda çizilir;
 * bölme motorun `ownGroupTitleKey` kuralında, satırın **metni değişmez**.
 */
export function NotificationsExceptionsTab() {
  const tab = useNotificationsTabDef("exceptions");

  if (!tab) return null;

  return <NotificationsTabBody tab={tab} />;
}
