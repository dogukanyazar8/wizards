import type { VoiceOverlayAnchor, VoiceOverlaySize } from "@wizards/types";

import type { DesktopRichPresenceAudience } from "@/lib/desktop/privacy";
import {
  DESKTOP_RELEASE_CHANNELS,
  fromReleaseChannelColumnValue,
  type DesktopReleaseChannel,
} from "@/lib/desktop/release-channel";

/**
 * Masaüstü satırları ↔ gerçek köprü — Ş10 §A.
 *
 * Yirmi dört satırın on üçü **durum taşır** ve hiçbiri `UserSettings`'e yazmaz. Bu bir eksik
 * değil, K3'ün gereği: "Whispr'ı bilgisayarla aç" ya da "overlay konumu" cihazın kendi
 * tercihidir. Kullanıcı iş makinesinde overlay'i sol üste alınca ev makinesindeki yeri
 * değişmemeli, ve bir sunucu kolonu tam olarak bunu yapardı.
 *
 * Kısayol atamaları **tek istisna** (`SPEC_DEVIATIONS` #11): onlar hesapla gezer.
 *
 * Bu dosya saf eşlemedir — React yok, `zustand` yok. Bölüm kökü hangi kutuya yazacağını
 * biliyor; hangi değerin hangi satır anahtarına karşılık geldiğini burası biliyor ve iki
 * bilgi ayrı durduğu için eşlemenin testi bir tarayıcı gerektirmiyor.
 */

/** SPEC §5.5 Uygulama — pencere davranışı ve yayın/durum. */
export const DESKTOP_APP_ROW_KEYS = {
  richPresence: "w6",
  richPresenceAudience: "w7",
  streamerMode: "w4",
  streamerModeDetection: "w5",
} as const;

export const DESKTOP_OVERLAY_ROW_KEYS = {
  gameOverlayAnchor: "z3",
  gameOverlayEnabled: "z2",
  gameOverlayProcessDetection: "z6",
  gameOverlaySize: "z4",
  perGameSettings: "z7",
  voiceMiniEnabled: "z1",
  voiceMiniSpeakingOnly: "z5",
} as const;

export const DESKTOP_SHORTCUT_ROW_KEYS = {
  assignments: "q3",
  block: "q2",
  enabled: "q1",
} as const;

export const DESKTOP_UPDATE_ROW_KEYS = {
  autoUpdate: "h4",
  channel: "h2",
  recovery: "n4",
  version: "h1",
} as const;

/** `runtime.data` alan adları — ağaçtaki `descriptionData` / `badgeData` bunları işaret eder. */
export const DESKTOP_ROW_DATA_FIELDS = {
  appVersion: "appVersion",
  desktopVersion: "desktopVersion",
  perGameOverlayCount: "perGameOverlayCount",
  shortcutConflicts: "shortcutConflicts",
  updateChannelState: "updateChannelState",
} as const;

/** `w7` segmenti — `0` Arkadaşlar, `1` Hiç kimse (`privacy.ts` sözleşmesi). */
export function toRichPresenceAudience(index: unknown): DesktopRichPresenceAudience {
  return index === 1 ? "nobody" : "friends";
}

export function fromRichPresenceAudience(audience: DesktopRichPresenceAudience): number {
  return audience === "nobody" ? 1 : 0;
}

/**
 * `z3` konumu — referans sırası: Sol üst · Sağ üst · Sol alt · Sağ alt, varsayılan `3`.
 *
 * Ağacın varsayılanı (`defaultValue: 3`) tasarımın seçili çipidir; `voice-store`'un kendi
 * varsayılanı `top-left`. İkisi çelişmiyor: ağaç ekranın ilk boyasını, kutu kullanıcının
 * gerçek tercihini söylüyor ve kutu her zaman ağacın üstüne yazılır.
 */
export const DESKTOP_OVERLAY_ANCHORS: readonly VoiceOverlayAnchor[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export function toOverlayAnchor(index: unknown): VoiceOverlayAnchor {
  return typeof index === "number" ? (DESKTOP_OVERLAY_ANCHORS[index] ?? "top-left") : "top-left";
}

export function fromOverlayAnchor(anchor: VoiceOverlayAnchor): number {
  const index = DESKTOP_OVERLAY_ANCHORS.indexOf(anchor);

  return index < 0 ? 0 : index;
}

/** `z4` boyutu — Küçük · Normal · Büyük, varsayılan `1`. */
export const DESKTOP_OVERLAY_SIZES: readonly VoiceOverlaySize[] = ["compact", "normal", "large"];

export function toOverlaySize(index: unknown): VoiceOverlaySize {
  return typeof index === "number" ? (DESKTOP_OVERLAY_SIZES[index] ?? "normal") : "normal";
}

export function fromOverlaySize(size: VoiceOverlaySize): number {
  const index = DESKTOP_OVERLAY_SIZES.indexOf(size);

  return index < 0 ? 1 : index;
}

export type DesktopBridgeState = {
  readonly gameOverlayAnchor: VoiceOverlayAnchor;
  readonly gameOverlayEnabled: boolean;
  readonly gameOverlayProcessDetection: boolean;
  readonly gameOverlaySize: VoiceOverlaySize;
  readonly preferredReleaseChannel: string | null;
  readonly richPresence: boolean;
  readonly richPresenceAudience: DesktopRichPresenceAudience;
  readonly shortcutsEnabled: boolean;
  readonly streamerMode: boolean;
  readonly streamerModeDetection: boolean;
  readonly updaterAutoCheck: boolean;
  readonly voiceMiniEnabled: boolean;
  readonly voiceMiniSpeakingOnly: boolean;
};

/** Köprü durumu → satır motorunun okuduğu değerler. */
export function toDesktopSettingsValues(
  state: DesktopBridgeState,
): Record<string, boolean | number | string> {
  return {
    [DESKTOP_APP_ROW_KEYS.richPresence]: state.richPresence,
    [DESKTOP_APP_ROW_KEYS.richPresenceAudience]: fromRichPresenceAudience(
      state.richPresenceAudience,
    ),
    [DESKTOP_APP_ROW_KEYS.streamerMode]: state.streamerMode,
    [DESKTOP_APP_ROW_KEYS.streamerModeDetection]: state.streamerModeDetection,
    [DESKTOP_OVERLAY_ROW_KEYS.gameOverlayAnchor]: fromOverlayAnchor(state.gameOverlayAnchor),
    [DESKTOP_OVERLAY_ROW_KEYS.gameOverlayEnabled]: state.gameOverlayEnabled,
    [DESKTOP_OVERLAY_ROW_KEYS.gameOverlayProcessDetection]: state.gameOverlayProcessDetection,
    [DESKTOP_OVERLAY_ROW_KEYS.gameOverlaySize]: fromOverlaySize(state.gameOverlaySize),
    [DESKTOP_OVERLAY_ROW_KEYS.voiceMiniEnabled]: state.voiceMiniEnabled,
    [DESKTOP_OVERLAY_ROW_KEYS.voiceMiniSpeakingOnly]: state.voiceMiniSpeakingOnly,
    [DESKTOP_SHORTCUT_ROW_KEYS.enabled]: state.shortcutsEnabled,
    [DESKTOP_UPDATE_ROW_KEYS.autoUpdate]: state.updaterAutoCheck,
    [DESKTOP_UPDATE_ROW_KEYS.channel]: fromReleaseChannel(state.preferredReleaseChannel),
  };
}

/**
 * `h2` segmenti — sıra `settings.option.h2.1…3`: Kararlı · Beta · Canary.
 *
 * Çipin adı tasarımdan, saklanan değer kolondan gelir (`lib/desktop/release-channel.ts`).
 */
export function toReleaseChannel(index: unknown): DesktopReleaseChannel {
  return typeof index === "number" ? (DESKTOP_RELEASE_CHANNELS[index] ?? "stable") : "stable";
}

export function fromReleaseChannel(channel: string | null | undefined): number {
  const index = DESKTOP_RELEASE_CHANNELS.indexOf(fromReleaseChannelColumnValue(channel));

  return index < 0 ? 0 : index;
}
