import type { MobileReleaseChannel } from "@wizards/types";

/**
 * Release kanalı sözleşmesi — Ş10 §A.5 (`h2`).
 *
 * Tasarımın üç çipi `Kararlı · Beta · Canary`. Veritabanının `ReleaseChannel` enum'u ise
 * `STABLE · BETA · UAT` ve o enum bu şeridin dosyası değil (şema Ş0'ın, K3 tek istisnaya
 * izin veriyor ve o istisna kısayollar).
 *
 * Bu yüzden üçüncü çip `UAT` kolonuna yazılır: ikisi de ürünün **en erken, en riskli** akışı ve
 * ürün bugün o akışı UAT diye adlandırıyor. Etiket referanstan birebir korunur (`Canary`),
 * saklanan değer kolonun bildiği addır. Enum'a dördüncü bir değer eklemek, hiçbir yayın
 * hattının beslemediği bir kanalı var göstermek olurdu.
 *
 * `SPEC_DEVIATIONS` #12 bu eşlemeyi gerekçesiyle taşır.
 */

export const DESKTOP_RELEASE_CHANNELS = ["stable", "beta", "canary"] as const;

export type DesktopReleaseChannel = (typeof DESKTOP_RELEASE_CHANNELS)[number];

const COLUMN_VALUES: Readonly<Record<DesktopReleaseChannel, MobileReleaseChannel>> = {
  beta: "beta",
  canary: "uat",
  stable: "stable",
};

export function toReleaseChannelColumnValue(channel: DesktopReleaseChannel): MobileReleaseChannel {
  return COLUMN_VALUES[channel];
}

/** Kolondan gelen değer → tasarımın çipi. Bilinmeyen değer `stable`'a düşer. */
export function fromReleaseChannelColumnValue(
  value: string | null | undefined,
): DesktopReleaseChannel {
  const normalized = (value ?? "").toLowerCase();

  if (normalized === "beta") return "beta";
  if (normalized === "uat" || normalized === "canary") return "canary";

  return "stable";
}
