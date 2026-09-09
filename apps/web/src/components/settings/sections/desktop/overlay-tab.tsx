"use client";

import React from "react";

import { DESKTOP_OVERLAY_ROW_KEYS } from "./desktop-settings-bridge";
import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/**
 * Masaüstü › Overlay — Ş10 §A.3. Sekiz satır, iki grup.
 *
 * `z7` (`Oyun bazlı ayarlar`) **devre dışı**: oyun başına overlay tercihi `voice-store`'da
 * gerçekten yaşıyor ve satırın alt metni o veriden sayılıyor, ama tercihleri düzenleyen yüzey
 * bu pakette yok. Satırı gizlemek "böyle bir ayar yok" derdi; hedefsiz bir `Yönet` düğmesi ise
 * basınca hiçbir şey olmayan bir düğme olurdu.
 *
 * TODO(api): oyun başına overlay yüzeyi geldiğinde `z7` kapıdan çıkar ve `onNavigate` o yüzeyi
 * açar.
 */
export function DesktopOverlayTab() {
  const tab = useDesktopTabDef("overlay");

  if (!tab) return null;

  return <DesktopTabBody disabledRowKeys={[DESKTOP_OVERLAY_ROW_KEYS.perGameSettings]} tab={tab} />;
}
