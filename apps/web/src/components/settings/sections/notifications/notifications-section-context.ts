"use client";

import { createContext, useContext } from "react";

import type {
  NotificationException,
  NotificationExceptionLevel,
  NotificationExceptionList,
} from "@/lib/notifications/exceptions-service";

import {
  QUIET_TIME_ZONE_BASE_OPTIONS,
  buildQuietHourOptions,
  type NotificationSummaryCounts,
} from "./notification-prefs-bridge";
import type { NotificationsTabDerivation } from "./notifications-tab-defs";

/**
 * Ayarlar paketi — Dalga 3 / Ş9. Bölümün iki özel bloğuna ve yedi sekmesine açılan bağlam.
 *
 * Özel blok sözleşmesi `{ data, row }` ve `data` bir `Record<string, string>`; istisna listesi
 * oraya sığmaz (satırların ikonu, kapsamı, düzeyi ve bitiş zamanı var) ve bir JSON dizesini
 * sözlüğe tıkıştırmak, tipi bir kez daha kaybetmek olurdu. Liste bu yüzden ayrı bir bağlamdan
 * gelir; `data` yalnız **metin** taşımaya devam eder.
 *
 * Varsayılan değer boş değil: bloklar ve sekmeler bölüm kökü olmadan da (yalıtılmış testler,
 * defterin başka bir yerden çizilmesi) anlamlı bir şey çizebilmeli. Boş liste bir yükleme
 * durumu değildir — `state` onu ayrı söyler.
 */

export type NotificationsExceptionsState = "error" | "loading" | "ready";

export type NotificationsSectionValue = {
  readonly derivation: NotificationsTabDerivation;
  readonly exceptions: NotificationExceptionList | null;
  readonly exceptionsState: NotificationsExceptionsState;
  /** Düzey yazması satırın **kendi** kaynağına gider (K4); blok üç ucu bilmez. */
  readonly onEditException: (
    exception: NotificationException,
    level: NotificationExceptionLevel,
  ) => void;
  readonly onRemoveException: (exception: NotificationException) => void;
  /** Uçuşta olan satır — `Düzenle` ve kaldır düğmeleri o satırda beklerken kapalı durur. */
  readonly pendingExceptionId: string | null;
  readonly summary: NotificationSummaryCounts | null;
};

export const NOTIFICATIONS_SECTION_FALLBACK: NotificationsSectionValue = {
  derivation: {
    permission: "unknown",
    quietHourOptions: buildQuietHourOptions(),
    quietTimeZoneOptions: QUIET_TIME_ZONE_BASE_OPTIONS,
  },
  exceptions: null,
  exceptionsState: "loading",
  onEditException: () => {},
  onRemoveException: () => {},
  pendingExceptionId: null,
  summary: null,
};

export const NotificationsSectionContext = createContext<NotificationsSectionValue>(
  NOTIFICATIONS_SECTION_FALLBACK,
);

export function useNotificationsSection(): NotificationsSectionValue {
  return useContext(NotificationsSectionContext);
}
