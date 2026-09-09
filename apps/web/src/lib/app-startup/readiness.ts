import type { SplashUpdateProgress } from "@wizards/types";

import type { SplashRuntimeInput } from "@/lib/splash/splash-machine";

/**
 * Kabuğun açılış sinyalleri.
 *
 * Karar verilmez, yalnız toplanır: hangi rotanın hangi veriyi beklediği burada,
 * "hangi adımdayız / hangi durumdayız" sorusu `splash-machine`de yanıtlanır.
 */

export type ShellReadinessRoute =
  "dm-conversation" | "dm-list" | "other" | "server-channel" | "server-root" | "settings";

export type ShellReadinessInput = {
  activeServerDetailLoading: boolean;
  appearanceHydrated: boolean;
  dmConversationsLoading?: boolean;
  layoutSettingsLoaded: boolean;
  realtimeConnected: boolean;
  route: ShellReadinessRoute;
  serversLoading: boolean;
};

function routeNeedsServerDetail(route: ShellReadinessRoute): boolean {
  return route === "server-channel" || route === "server-root";
}

function routeNeedsDMConversations(route: ShellReadinessRoute): boolean {
  return route === "dm-conversation" || route === "dm-list";
}

/** Açılan rotanın kendi verisi hâlâ yolda mı — sunucu listesinden ayrı bir soru. */
export function isRouteDataLoading(input: ShellReadinessInput): boolean {
  if (routeNeedsServerDetail(input.route) && input.activeServerDetailLoading) {
    return true;
  }

  if (routeNeedsDMConversations(input.route) && input.dmConversationsLoading) {
    return true;
  }

  return false;
}

/**
 * Kabuğun bildiği sinyalleri açılış ekranının dört aşamasına çevirir (K7).
 *
 * Kabuk sinyalleri (`appearanceHydrated`, `serversLoading`, …) üç aşamayı zaten
 * anlatıyor; ilk aşama (`Bağlanıyor`) ve durum girdileri (ağ, 401, indirme) kabuğun
 * dışından gelir, o yüzden ayrı bir `extras` olarak verilir. Eşleme burada, tek
 * yerde durur: aynı türetmeyi iki yüzeyde ayrı yazmak, iki farklı "hazır" tanımı
 * demekti.
 */
export type SplashRuntimeExtras = {
  bootstrapRequestSettled: boolean;
  elapsedMs: number;
  online: boolean;
  sessionExpired: boolean;
  update: SplashUpdateProgress | null;
};

export function toSplashRuntimeInput(
  input: ShellReadinessInput,
  extras: SplashRuntimeExtras,
): SplashRuntimeInput {
  return {
    bootstrapRequestSettled: extras.bootstrapRequestSettled,
    elapsedMs: extras.elapsedMs,
    online: extras.online,
    realtimeConnected: input.realtimeConnected,
    sessionExpired: extras.sessionExpired,
    sessionHydrated: input.appearanceHydrated && input.layoutSettingsLoaded,
    update: extras.update,
    workspaceLoaded: !input.serversLoading && !isRouteDataLoading(input),
  };
}
