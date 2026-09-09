"use client";

import React from "react";

import { useSettingValue } from "@/lib/settings/use-setting-value";

import { NotificationsTabBody, useNotificationsTabDef } from "./notifications-tab-body";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §6. Bildirimler › Panel.
 *
 * İki ayrı tercih burada yan yana durur ve karıştırılmaları yasaktır (tuzak #4):
 * `np4` (`Mesaj içeriğini göster`) **uygulama içi** açılır kartın içeriğidir, `na6`
 * (`Mesaj önizlemelerini göster`) sistem bildiriminin içeriğidir. Ayrı anahtar, ayrı satır,
 * ayrı açıklama — ve `notification-prefs-bridge.test.ts` birinin diğerine sızmadığını
 * regresyon olarak sabitler.
 *
 * `Görünme süresi` yalnız `Paneli otomatik kapat` açıkken anlamlıdır: otomatik kapanmayan bir
 * panelin görünme süresi diye bir şey yok. Kapı satırın dışında (`disabledRowKeys`) çünkü
 * bağımlılık içeriğin değil, bu sekmenin davranışıdır.
 */
export function NotificationsPanelTab() {
  const tab = useNotificationsTabDef("panel");
  const autoClose = useSettingValue<boolean>("np2");

  if (!tab) return null;

  return <NotificationsTabBody disabledRowKeys={autoClose.value ? [] : ["np3"]} tab={tab} />;
}
