"use client";

import React from "react";

import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/**
 * Masaüstü › İzinler — Ş10 §A.4. Tek satır, tek blok (`j1`).
 *
 * Beş iznin tamamı `PermissionsBlock` içinde ve okuma bölüm kökünde: Tanılama ızgarası aynı
 * değeri okuduğu için ikinci bir sorgu kurulmaz. Sekme dosyasının kendi işi kalmıyor — bu bir
 * eksiklik değil, IA'nın sonucu: bir sekme bir bloktan ibaretse gövdesi de bir satırdır.
 */
export function DesktopPermissionsTab() {
  const tab = useDesktopTabDef("permissions");

  if (!tab) return null;

  return <DesktopTabBody tab={tab} />;
}
