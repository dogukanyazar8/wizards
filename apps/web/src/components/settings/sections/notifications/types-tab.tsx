"use client";

import React from "react";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §3. Bildirimler › Türler — on altı satır.
 *
 * Kilitli iki satır (`nt13`, `nt14`) motorda `lockedToggle` olarak çizilir: `aria-disabled`,
 * `cursor:not-allowed`, `Kilitli` pili ve **sunucuya gitmeyen** tıklama. Sunucu zaten 400
 * döndürüyor (tuzak #5); istemcinin denememesi, kullanıcının kapatabileceğini sanmamasıdır.
 *
 * `Rol bahsetmeleri` ve `@herkes ve @burada` ters mantıklı kolonlara yazar; çevirme
 * `prefs-service` içinde kalır (tuzak #2) ve bu sekme düz mantık görür.
 */
export function NotificationsTypesTab() {
  const tab = useNotificationsTabDef("types");

  if (!tab) return null;

  return <NotificationsTabBody tab={tab} />;
}
