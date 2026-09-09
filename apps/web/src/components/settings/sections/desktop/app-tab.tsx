"use client";

import React from "react";

import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/**
 * Masaüstü › Uygulama — Ş10 §A.1. Altı satır, iki grup.
 *
 * Yayın/durum (`w4`–`w7`) gerçek Desktop consumer'larına yazar. Cihazın autostart ve pencere
 * kapanış davranışı (`w1`/`w2`) güvenilir yerel Desktop Control yüzeyinde yönetilir.
 */
export function DesktopAppTab() {
  const tab = useDesktopTabDef("app");

  if (!tab) return null;

  return <DesktopTabBody tab={tab} />;
}
