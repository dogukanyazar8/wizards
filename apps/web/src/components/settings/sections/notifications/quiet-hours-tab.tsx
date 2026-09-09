"use client";

import React from "react";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §4. Bildirimler › Sessiz saatler.
 *
 * Başlangıç ve bitiş menüleri tasarımdaki dörder seçenekle sınırlı **değil**: 24 saat yarım
 * saatlik adımlarla listelenir ve ızgaraya oturmayan gerçek bir değer listeye sıralı girer
 * (`resolveQuietHourOptions`). Tasarımdaki liste örnek veridir; onu sabitlemek `23:15`
 * kullanan bir hesaba menüde başka bir saati seçili göstermek olurdu.
 *
 * `nq1` alt metni gece aşan aralığı **gerçek** değerlerden yazar (`Her gün 23:00 – 08:00`);
 * cümle ağaçtaki metnin aynısı, yalnız iki saat interpolasyonla gelir.
 */
export function NotificationsQuietHoursTab() {
  const tab = useNotificationsTabDef("quiet-hours");

  if (!tab) return null;

  return <NotificationsTabBody tab={tab} />;
}
