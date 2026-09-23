import {
  advanceSplashStep,
  type SplashStateId,
  type SplashStepId,
  type SplashUpdateProgress,
} from "@wizards/types";

import type { MobileTheme } from "../../../design/themes";
import type { mobileCopy } from "../../../locale/mobile-copy";

/**
 * Mobil açılış ekranının saf modeli — SPEC-SPLASH §6/§7.
 *
 * Ekran dosyası hiçbir karar vermez: hangi adımdayız, hangi durumdayız, hangi ton
 * hangi temada okunur — hepsi burada ve hepsi test edilebilir. Web'in
 * `splash-machine`i ile aynı sözleşmeyi (`@wizards/types`) konuşur; mobil olan tek
 * şey sinyallerin **kaynağı**.
 */

export type MobileSplashSignals = {
  /** `useMobileAuth().status`. */
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  /** Bootstrap sorgusu en az bir kez yanıtlandı mı (hata dâhil). */
  bootstrapSettled: boolean;
  elapsedMs: number;
  /** Ağ katmanının anlık durumu; `unknown` çevrimiçi sayılır. */
  networkStatus: "offline" | "online" | "unknown";
  /** Realtime soketinin durumu. */
  realtimeStatus: "background" | "connected" | "connecting" | "disconnected" | "error" | "idle";
  /** Oturum 401 ile düştü. */
  sessionExpired: boolean;
  /** Android APK indirmesi; iOS ve mağaza akışları `null` verir (K10). */
  update: SplashUpdateProgress | null;
  /** Çalışma alanı (sunucu listesi) yerinde. */
  workspaceLoaded: boolean;
};

/**
 * Mobil sinyalleri ortak sözleşmeye çevirir.
 *
 * `signed-out` da "oturum aşaması bitti" sayılır: giriş ekranı açılış ekranının
 * arkasında değil, yerine gelir — splash orada takılı kalmamalı.
 */
export function toMobileSplashRuntime(signals: MobileSplashSignals) {
  const sessionHydrated = signals.authStatus !== "checking";

  return {
    bootstrapRequestSettled: signals.bootstrapSettled || sessionHydrated,
    elapsedMs: signals.elapsedMs,
    online: signals.networkStatus !== "offline",
    realtimeConnected: signals.realtimeStatus === "connected",
    sessionExpired: signals.sessionExpired,
    sessionHydrated,
    update: signals.update,
    // Oturumsuz kullanıcı için çalışma alanı diye bir şey yok; splash sunucu
    // listesini beklerse giriş ekranı hiç açılmaz.
    workspaceLoaded: signals.authStatus !== "signed-in" ? true : signals.workspaceLoaded,
  };
}

export function advanceMobileSplashStep(previous: SplashStepId, next: SplashStepId): SplashStepId {
  return advanceSplashStep(previous, next);
}

export type MobileSplashStateVisual = {
  readonly tile: string;
  readonly tone: string;
  readonly washColor: string;
  readonly washOpacity: number;
};

/**
 * SPEC §7 tonları — mobil karşılıkları.
 *
 * **Tuzak:** mobil temada `status.warningSoft` **açık bir yüzey** rengidir, web'deki
 * `--warning-soft` ise koyu bir *metin* tonudur. İsim benzerliğine güvenmek, açık
 * temada zemin üstüne zemin yazmak demekti. Burada metin için temanın erişilebilir
 * ön plan tonları (`status.warning`, `status.dangerOnBase`, `accent.strong`,
 * `text.secondary`), zemin için `*Soft` yüzeyleri kullanılıyor; ikisi de temaya göre
 * zaten çevriliyor.
 */
export function getMobileSplashStateVisual(
  theme: MobileTheme,
  state: Exclude<SplashStateId, "loading">,
): MobileSplashStateVisual {
  switch (state) {
    case "offline":
      return {
        tile: theme.status.dangerSoft,
        tone: theme.status.dangerOnBase,
        washColor: theme.status.danger,
        washOpacity: 0.16,
      };
    case "sessionExpired":
      return {
        tile: theme.surface.soft,
        tone: theme.text.secondary,
        washColor: theme.text.primary,
        washOpacity: 0.08,
      };
    case "updating":
      return {
        tile: theme.accent.soft,
        tone: theme.accent.strong,
        washColor: theme.accent.default,
        washOpacity: 0.2,
      };
    case "slow":
    default:
      return {
        tile: theme.status.warningSoft,
        tone: theme.status.warning,
        washColor: theme.status.warning,
        washOpacity: 0.16,
      };
  }
}

type CopyKey = keyof (typeof mobileCopy)["tr"];

export const MOBILE_SPLASH_STEP_COPY = {
  almostReady: "splashStepAlmostReady",
  connecting: "splashStepConnecting",
  servers: "splashStepServers",
  session: "splashStepSession",
} as const satisfies Record<SplashStepId, CopyKey>;

export const MOBILE_SPLASH_TIP_COPY = [
  "splashTipCommandPalette",
  "splashTipVoiceMute",
  "splashTipQuickReaction",
  "splashTipMentions",
] as const satisfies readonly CopyKey[];

export const MOBILE_SPLASH_STATE_COPY = {
  offline: {
    action: "splashStateOfflineAction",
    description: "splashStateOfflineDescription",
    kicker: "splashStateOfflineKicker",
    title: "splashStateOfflineTitle",
  },
  sessionExpired: {
    action: "splashStateSessionExpiredAction",
    description: "splashStateSessionExpiredDescription",
    kicker: "splashStateSessionExpiredKicker",
    title: "splashStateSessionExpiredTitle",
  },
  slow: {
    action: "splashStateSlowAction",
    description: "splashStateSlowDescription",
    kicker: "splashStateSlowKicker",
    title: "splashStateSlowTitle",
  },
  updating: {
    description: "splashStateUpdatingDescription",
    descriptionUnknown: "splashStateUpdatingDescriptionUnknown",
    kicker: "splashStateUpdatingKicker",
    title: "splashStateUpdatingTitle",
  },
} as const;

export function pickMobileSplashTipKey(random: number): (typeof MOBILE_SPLASH_TIP_COPY)[number] {
  const clamped = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999_999) : 0;

  return (
    MOBILE_SPLASH_TIP_COPY[Math.floor(clamped * MOBILE_SPLASH_TIP_COPY.length)] ??
    MOBILE_SPLASH_TIP_COPY[0]
  );
}
