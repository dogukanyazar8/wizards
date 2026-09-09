/**
 * Kanal erişim çipi — SPEC-SUNUCU §8.4.
 *
 * Dört ön ayarın **tonu** burada yaşıyor. SPEC'in cümlesi net: "Erişim çipi renkleri:
 * **Herkese açık = success**, Kilitli = warning, Gizli = danger, Role bağlı = primary."
 * Eşleme Ş8'in kanal penceresindeki `Erişim` adımıyla aynı ön ayar kümesini kullanır
 * (`WorkspaceChannelPermissionPreset`); yeni bir ön ayar üretilmez.
 *
 * Çipin **etiketi** ayarlardaki kısa biçimdir (`Kilitli`, `Gizli`), penceredeki uzun biçim
 * değil (`Kilitli ama görünür`, `Gizli / özel`) — referans HTML'de satıra sığan metin budur.
 * İki metin iki anahtar demek; ikisi de `server.settings.channels.access.*` ve
 * `server.modal.channel.access.*` altında ayrı ayrı duruyor.
 */

import type { WorkspaceChannelPermissionPreset } from "@wizards/types";

export type ChannelAccessTone = "success" | "warning" | "danger" | "primary";

const ACCESS_TONES: Record<WorkspaceChannelPermissionPreset, ChannelAccessTone> = {
  LOCKED_VISIBLE: "warning",
  PRIVATE: "danger",
  PUBLIC: "success",
  ROLE_GATED: "primary",
};

const ACCESS_TONE_VARIABLES: Record<ChannelAccessTone, string> = {
  danger: "--danger",
  primary: "--primary",
  success: "--success",
  warning: "--warning",
};

export function getChannelAccessTone(preset: WorkspaceChannelPermissionPreset): ChannelAccessTone {
  return ACCESS_TONES[preset];
}

/** `hsl(var(--success))` / `hsl(var(--success) / 0.14)` — çipin metni ve zemini. */
export function getChannelAccessColor(
  preset: WorkspaceChannelPermissionPreset,
  alpha?: number,
): string {
  const variable = ACCESS_TONE_VARIABLES[getChannelAccessTone(preset)];

  return alpha === undefined ? `hsl(var(${variable}))` : `hsl(var(${variable}) / ${alpha})`;
}

/** Çip zemininin opaklığı; referans `H(tone, '.14')` yazıyor. */
export const CHANNEL_ACCESS_CHIP_BACKGROUND_ALPHA = 0.14;
