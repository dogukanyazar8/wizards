"use client";

import React from "react";

import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/**
 * Masaüstü › Güncelleme — Ş10 §A.5. Beş satır, iki grup.
 *
 * `h2` (release kanalı) `User.preferredReleaseChannel`'a yazar ve **build'in kanalını
 * değiştirmez**: çalışan sürüm neyse odur, seçim yalnız hangi akışın önerileceğini belirler.
 *
 * `n3` tanılama ızgarası ağır bölüm; veriler gelene kadar kendi hücreleriyle iskelet çizer.
 */
export function DesktopUpdatesTab() {
  const tab = useDesktopTabDef("updates");

  if (!tab) return null;

  return <DesktopTabBody tab={tab} />;
}
