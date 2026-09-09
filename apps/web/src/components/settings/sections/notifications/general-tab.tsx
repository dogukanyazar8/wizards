"use client";

import React from "react";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §1. Bildirimler › Genel.
 *
 * Bu sekmenin altı satırından beşi başka sekmelerle **aynı** durumu gösterir (`nd2`, `na5`,
 * `na6`, `nq1`, `ns1`); hizalama için burada tek satır kod yok, çünkü hizalama bir davranış
 * değil bir kimlik meselesi: motor beş satırı da aynı anahtarla okuyor (tuzak #4).
 *
 * `b1` ile 560 px penceredeki radyo kartları da aynı `level` anahtarını yazar, farklı etiketle
 * (sapma #6); iki metin de referanstan birebir gelir ve hiçbiri diğerine uydurulmaz.
 */
export function NotificationsGeneralTab() {
  const tab = useNotificationsTabDef("general");

  if (!tab) return null;

  return <NotificationsTabBody tab={tab} />;
}
