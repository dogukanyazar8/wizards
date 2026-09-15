"use client";

import { createContext, useContext } from "react";
import type { DesktopPermissions, DesktopShortcut } from "@wizards/types";

import type { DesktopAppInfo, DesktopCompanionSurfacesStatus } from "@/lib/desktop/controls";
import type { DesktopPermissionKey } from "@/lib/desktop/permissions";
import { UNKNOWN_DESKTOP_PERMISSIONS } from "@/lib/desktop/permissions";
import { DESKTOP_SHORTCUT_ACTIONS } from "@/lib/desktop/shortcuts";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";

/**
 * Masaüstü + Hakkında bölümlerinin **tek** okuma kaynağı — Ş10.
 *
 * Yedi blok satır motoru tarafından anahtardan çözülüyor ve prop alamıyor; okudukları durum bu
 * bağlamdan gelir. Bağlamın asıl işi tekliği zorlamak: prompt "tanılama ızgarası İzinler ve
 * Kısayollar sekmeleriyle **aynı** kaynağı okur, ikinci sorgu kurulmaz" diyor ve iki ayrı
 * `useEffect` kuran iki blok, aynı ekranda birbirine katılmayan iki cevap üretirdi
 * (`Bildirim izni` satırı ızgarada `Engellendi`, İzinler sekmesinde `İzin verildi`).
 *
 * Sağlayıcı yokken (blokların yalıtılmış testleri, web) değerler **bilinmez** durumdadır:
 * hiçbir izin `granted`, hiçbir kısayol çakışmalı değildir ve ızgara `—` çizer. Uydurulmuş bir
 * "iyimser" varsayılan, doğrulanmamış bir durumu doğrulanmış gibi göstermek olurdu.
 */

export type DesktopUpdaterState = {
  readonly checking: boolean;
  readonly enabled: boolean;
  readonly lastCheckedAt: string | null;
  readonly upToDate: boolean | null;
};

export type DesktopSettingsValue = {
  readonly appInfo: DesktopAppInfo | null;
  readonly buildInfo: SettingsBootstrapPayload["buildInfo"] | null;
  /** İşletim sisteminin kayıt sonucundaki gerçek kısayol çakışma sayısı. */
  readonly conflictCount: number;
  readonly desktopRuntime: boolean;
  readonly featuredContributor: string | null;
  readonly loading: boolean;
  readonly online: boolean;
  readonly onOpenShortcutsManager: () => void;
  readonly onOpenSystemSettings: (key: DesktopPermissionKey) => void;
  readonly onRecheckPermission: (key: DesktopPermissionKey) => void;
  readonly onRequestPermission: (key: DesktopPermissionKey) => void;
  readonly perGameOverlayCount: number;
  readonly permissions: DesktopPermissions;
  readonly platform: string | null;
  readonly shortcuts: readonly DesktopShortcut[];
  readonly shortcutsEnabled: boolean;
  readonly socketConnected: boolean;
  readonly surfaces: DesktopCompanionSurfacesStatus | null;
  readonly updater: DesktopUpdaterState;
  readonly voiceConnected: boolean;
};

const UNKNOWN_SHORTCUTS: readonly DesktopShortcut[] = DESKTOP_SHORTCUT_ACTIONS.map((action) => ({
  action,
  conflict: false,
  keys: [],
}));

export const UNKNOWN_DESKTOP_SETTINGS: DesktopSettingsValue = {
  appInfo: null,
  buildInfo: null,
  conflictCount: 0,
  desktopRuntime: false,
  featuredContributor: null,
  loading: false,
  onOpenShortcutsManager: () => {},
  onOpenSystemSettings: () => {},
  onRecheckPermission: () => {},
  onRequestPermission: () => {},
  online: true,
  perGameOverlayCount: 0,
  permissions: UNKNOWN_DESKTOP_PERMISSIONS,
  platform: null,
  shortcuts: UNKNOWN_SHORTCUTS,
  shortcutsEnabled: false,
  socketConnected: false,
  surfaces: null,
  updater: { checking: false, enabled: false, lastCheckedAt: null, upToDate: null },
  voiceConnected: false,
};

export const DesktopSettingsContext = createContext<DesktopSettingsValue>(UNKNOWN_DESKTOP_SETTINGS);

export function useDesktopSettings(): DesktopSettingsValue {
  return useContext(DesktopSettingsContext);
}
