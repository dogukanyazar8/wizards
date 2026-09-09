"use client";

import React from "react";

import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/**
 * Masaüstü › Kısayollar — Ş10 §A.2, K7.
 *
 * Üç satır: `q1` salt-okunur durum anahtarı, `q2` kısayol bloğu, `q3` güvenilir yerel
 * Desktop Control'e geçiş eylemi.
 *
 * Uzak ana pencere privileged kısayol komutlarını çağıramaz. Değerler salt-okunur native
 * durumdan gösterilir; düzenleme q2 düğmeleri veya q3 eylemiyle ağsız Desktop Control'de yapılır.
 *
 * `q3`'ün çakışma pili gerçek kayıt sonucundan gelir (`desktop-tab-defs.ts`); sıfır çakışmada
 * pil hiç çizilmez.
 */
export function DesktopShortcutsTab() {
  const tab = useDesktopTabDef("shortcuts");

  if (!tab) return null;

  return <DesktopTabBody tab={tab} />;
}
