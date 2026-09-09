import { z } from "zod";

/** Sunucu ikonunun seçilebilir tasarım tokenları. */
export const SERVER_ICON_TONES = [
  "primary",
  "info",
  "success",
  "warning",
  "danger",
  "accent2",
] as const;

export const ServerIconToneSchema = z.enum(SERVER_ICON_TONES);

export type ServerIconTone = z.infer<typeof ServerIconToneSchema>;

/** Veritabanındaki eski/bozuk tonu güvenli fallback'e dönüştürmek için tek okuma kapısı. */
export function normalizeServerIconTone(value: unknown): ServerIconTone | null {
  const parsed = ServerIconToneSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const NON_SERVER_SHORT_NAME_CHARACTERS = /[^\p{L}\p{N}_-]+/gu;
const SERVER_SHORT_NAME_FALLBACK = "WHS";

/** Eski veya alansız istemciler için her zaman üç karakterlik güvenli bir kısaltma üretir. */
export function deriveServerShortName(name: string): string {
  const compact = name.trim().replace(NON_SERVER_SHORT_NAME_CHARACTERS, "");
  const upper = compact.toUpperCase();
  const normalized = compact.startsWith("i") ? `İ${upper.slice(1)}` : upper;

  return [...Array.from(normalized), ...Array.from(SERVER_SHORT_NAME_FALLBACK)]
    .slice(0, 3)
    .join("");
}
