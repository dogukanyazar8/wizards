import { z } from "zod";

/**
 * Ekran paylaşımı sözleşmesi — `docs/prompts/ekran-paylasimi-2026-09/00-ortak-baglam.md` §5.
 *
 * Bu dosya davranış taşımaz; web, masaüstü ve mobilin paylaştığı **alanları** açar: kalite
 * eksenleri (K4), bitrate merdiveni (K5), Go Live presence bilgisi (K8/K22), telemetri
 * örneği (K16) ve izleyen listesi fanout'u (K11). Preset id şeması `h{res}fps{fps}` korunur;
 * mobil sözleşme (`mobile-screen-share.ts`) aynı şemayı okuyor.
 */

// ---------------------------------------------------------------------------
// K4 — kalite üç eksene ayrılır: çözünürlük katmanı, kare hızı, mod.
// ---------------------------------------------------------------------------

export const SCREEN_SHARE_RESOLUTIONS = ["h720", "h1080", "h1440", "h2160"] as const;
export const ScreenShareResolutionSchema = z.enum(SCREEN_SHARE_RESOLUTIONS);
export type ScreenShareResolution = z.infer<typeof ScreenShareResolutionSchema>;

export const SCREEN_SHARE_FRAME_RATES = [15, 30, 60] as const;
export const ScreenShareFrameRateSchema = z.union([z.literal(15), z.literal(30), z.literal(60)]);
export type ScreenShareFrameRate = z.infer<typeof ScreenShareFrameRateSchema>;

export const SCREEN_SHARE_MODES = ["text", "motion"] as const;
/** `text`: okunurluk, çözünürlük korunur · `motion`: akıcılık, kare hızı korunur (K7). */
export const ScreenShareModeSchema = z.enum(SCREEN_SHARE_MODES);
export type ScreenShareMode = z.infer<typeof ScreenShareModeSchema>;

export const DEFAULT_SCREEN_SHARE_RESOLUTION: ScreenShareResolution = "h1080";
export const DEFAULT_SCREEN_SHARE_FRAME_RATE: ScreenShareFrameRate = 60;
export const DEFAULT_SCREEN_SHARE_MODE: ScreenShareMode = "text";

/** Katmanın piksel boyutu; K2'nin `getSettings().height >= 2160` kapısı buradan okur. */
export const SCREEN_SHARE_RESOLUTION_DIMENSIONS: Readonly<
  Record<ScreenShareResolution, { readonly width: number; readonly height: number }>
> = {
  h720: { width: 1280, height: 720 },
  h1080: { width: 1920, height: 1080 },
  h1440: { width: 2560, height: 1440 },
  h2160: { width: 3840, height: 2160 },
};

export function getScreenShareResolutionHeight(resolution: ScreenShareResolution): number {
  return SCREEN_SHARE_RESOLUTION_DIMENSIONS[resolution].height;
}

/** Sözlük §7 — `h{res}fps{fps}`, örn. `h2160fps60`. */
export type ScreenSharePresetId = `${ScreenShareResolution}fps${ScreenShareFrameRate}`;

export function resolveScreenSharePresetId(
  resolution: ScreenShareResolution,
  frameRate: ScreenShareFrameRate,
): ScreenSharePresetId {
  return `${resolution}fps${frameRate}`;
}

const SCREEN_SHARE_PRESET_ID_PATTERN = /^h(720|1080|1440|2160)fps(15|30|60)$/u;

/**
 * Bir preset id'sini iki eksene ayırır.
 *
 * Eski `screenShareQuality` değerleri (`h1080fps60`) ve web'in 60'a alias'ladığı `h*fps30`
 * id'leri de buradan geçer: alias artık **gerçek** 30 fps'e çözülür, çünkü kare hızı ayrı
 * bir eksen oldu ve 30 fps geçerli bir seçim. Tanınmayan her şey `null`.
 */
export function splitScreenShareQualityId(
  id: unknown,
): { resolution: ScreenShareResolution; frameRate: ScreenShareFrameRate } | null {
  if (typeof id !== "string") {
    return null;
  }

  const match = SCREEN_SHARE_PRESET_ID_PATTERN.exec(id);
  if (!match) {
    return null;
  }

  const resolution = ScreenShareResolutionSchema.safeParse(`h${match[1]}`);
  const frameRate = ScreenShareFrameRateSchema.safeParse(Number(match[2]));
  if (!resolution.success || !frameRate.success) {
    return null;
  }

  return { resolution: resolution.data, frameRate: frameRate.data };
}

// ---------------------------------------------------------------------------
// K5 — bitrate merdiveni (kbps). Monoton: çözünürlük ve fps arttıkça düşmez.
// ---------------------------------------------------------------------------

export type ScreenShareBitrateLadder = Readonly<
  Record<ScreenShareResolution, Readonly<Record<ScreenShareFrameRate, number>>>
>;

/** `motion` = `text` × 1.3, yuvarlanır; 2160p60 için mutlak tavan. */
export const SCREEN_SHARE_MOTION_BITRATE_MULTIPLIER = 1.3;
export const SCREEN_SHARE_MAX_BITRATE_KBPS = 24_000;

export const SCREEN_SHARE_BITRATE_LADDER_KBPS: Readonly<
  Record<ScreenShareMode, ScreenShareBitrateLadder>
> = {
  text: {
    h720: { 15: 1_500, 30: 2_500, 60: 3_500 },
    h1080: { 15: 2_500, 30: 4_000, 60: 6_000 },
    h1440: { 15: 4_000, 30: 7_000, 60: 12_000 },
    h2160: { 15: 8_000, 30: 12_000, 60: 20_000 },
  },
  motion: {
    h720: { 15: 1_950, 30: 3_250, 60: 4_550 },
    h1080: { 15: 3_250, 30: 5_200, 60: 7_800 },
    h1440: { 15: 5_200, 30: 9_100, 60: 15_600 },
    h2160: { 15: 10_400, 30: 15_600, 60: SCREEN_SHARE_MAX_BITRATE_KBPS },
  },
};

export function getScreenShareBitrateKbps(
  mode: ScreenShareMode,
  resolution: ScreenShareResolution,
  frameRate: ScreenShareFrameRate,
): number {
  return SCREEN_SHARE_BITRATE_LADDER_KBPS[mode][resolution][frameRate];
}

// ---------------------------------------------------------------------------
// K8 / K22 — Go Live presence bilgisi. Exe adı ve pencere başlığı buraya girmez.
// ---------------------------------------------------------------------------

export const SCREEN_SHARE_STREAM_KINDS = ["screen", "window", "game"] as const;
export const ScreenShareStreamKindSchema = z.enum(SCREEN_SHARE_STREAM_KINDS);

export const SCREEN_SHARE_STREAM_LABEL_MAX_LENGTH = 64;
export const SCREEN_SHARE_GAME_ID_MAX_LENGTH = 128;
/** K22 — kayıtlı oyun id'si; sha256(exe) ilk 12 hex. Katalog id regex'i Ş5'in `game-activity.ts`'inde. */
export const SCREEN_SHARE_CUSTOM_GAME_ID_PREFIX = "custom:";

const CONTROL_CHARACTER_PATTERN = /[\p{Cc}]/u;

/**
 * `gameId`: katalog id'si **veya** `custom:<12 hex>`; `null` = paylaşım tercihi kapalı ya da
 * oyun değil. `label`: yalnız kayıtlı oyunlarda dolu, kullanıcının yazdığı ad (1–64, kontrol
 * karakteri yok); sunucu `GameSharingSettings.enabled` kapalıyken `null` yazar.
 */
export const ScreenShareStreamInfoSchema = z
  .object({
    kind: ScreenShareStreamKindSchema,
    gameId: z.string().min(1).max(SCREEN_SHARE_GAME_ID_MAX_LENGTH).nullable(),
    label: z
      .string()
      .min(1)
      .max(SCREEN_SHARE_STREAM_LABEL_MAX_LENGTH)
      .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
        message: "Label must not contain control characters.",
      })
      .nullable(),
  })
  .strict();
export type ScreenShareStreamInfo = z.infer<typeof ScreenShareStreamInfoSchema>;

// ---------------------------------------------------------------------------
// K16 — telemetri örneği. Sayı + enum; serbest metin yalnız `*Implementation` (allowlist).
// ---------------------------------------------------------------------------

export const ScreenShareHealthDirectionSchema = z.enum(["send", "receive"]);
export type ScreenShareHealthDirection = z.infer<typeof ScreenShareHealthDirectionSchema>;

export const ScreenShareQualityLimitationReasonSchema = z.enum([
  "none",
  "cpu",
  "bandwidth",
  "other",
]);
export type ScreenShareQualityLimitationReason = z.infer<
  typeof ScreenShareQualityLimitationReasonSchema
>;

/**
 * `encoderImplementation` / `decoderImplementation` için allowlist. WebRTC'nin verdiği adlar
 * (`libvpx`, `OpenH264`, `ExternalEncoder`, `VideoToolbox` …) bu kümeye sığar; pencere
 * başlığı, dosya yolu veya kullanıcı metni sığmaz.
 */
export const SCREEN_SHARE_IMPLEMENTATION_NAME_PATTERN = /^[A-Za-z0-9 ._:/()-]{0,64}$/u;

const ImplementationNameSchema = z
  .string()
  .regex(SCREEN_SHARE_IMPLEMENTATION_NAME_PATTERN)
  .nullable();

const NonNegativeNumberSchema = z.number().finite().nonnegative();
const NonNegativeCountSchema = z.number().int().nonnegative();

export const ScreenShareQualityLimitationDurationsSchema = z
  .object({
    none: NonNegativeNumberSchema,
    cpu: NonNegativeNumberSchema,
    bandwidth: NonNegativeNumberSchema,
    other: NonNegativeNumberSchema,
  })
  .strict();
export type ScreenShareQualityLimitationDurations = z.infer<
  typeof ScreenShareQualityLimitationDurationsSchema
>;

/**
 * Tek `getStats` örneği (2 s kadans, K16). Ş0.2 doldurur, store `screenShareHealth` alanında
 * son örneği tutar. `null` bir alan "bu yönde ölçülmez" demektir: gönderen tarafta
 * `decoderImplementation`, `freezeCount`, `jitterBufferDelayMs`; alan tarafta
 * `encoderImplementation`, `qualityLimitation*`. `bitrateKbps` ilk örnekte (delta yokken) `null`.
 * `sampledAt`: epoch ms.
 */
export const ScreenShareHealthSnapshotSchema = z
  .object({
    direction: ScreenShareHealthDirectionSchema,
    sampledAt: NonNegativeCountSchema,
    fps: NonNegativeNumberSchema.nullable(),
    width: NonNegativeCountSchema.nullable(),
    height: NonNegativeCountSchema.nullable(),
    bitrateKbps: NonNegativeNumberSchema.nullable(),
    qualityLimitationReason: ScreenShareQualityLimitationReasonSchema.nullable(),
    qualityLimitationDurationsMs: ScreenShareQualityLimitationDurationsSchema.nullable(),
    encoderImplementation: ImplementationNameSchema,
    decoderImplementation: ImplementationNameSchema,
    powerEfficientEncoder: z.boolean().nullable(),
    framesDropped: NonNegativeCountSchema.nullable(),
    freezeCount: NonNegativeCountSchema.nullable(),
    totalFreezesDurationMs: NonNegativeNumberSchema.nullable(),
    jitterBufferDelayMs: NonNegativeNumberSchema.nullable(),
    packetsLost: NonNegativeCountSchema.nullable(),
    roundTripTimeMs: NonNegativeNumberSchema.nullable(),
  })
  .strict();
export type ScreenShareHealthSnapshot = z.infer<typeof ScreenShareHealthSnapshotSchema>;

export function parseScreenShareHealthSnapshot(value: unknown): ScreenShareHealthSnapshot | null {
  const parsed = ScreenShareHealthSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// K11 — izleyen listesi fanout'u: `voice:screenshare:watchers:update`.
// ---------------------------------------------------------------------------

const USER_ID_MAX_LENGTH = 128;
export const SCREEN_SHARE_WATCHER_SAMPLE_MAX = 5;

export const ScreenShareWatchersUpdateSchema = z
  .object({
    channelId: z.string().min(1).max(USER_ID_MAX_LENGTH),
    sharerUserId: z.string().min(1).max(USER_ID_MAX_LENGTH),
    count: NonNegativeCountSchema,
    /** En çok beş userId; overlay'e **sayı** gider, örnek gitmez (T17). */
    sample: z.array(z.string().min(1).max(USER_ID_MAX_LENGTH)).max(SCREEN_SHARE_WATCHER_SAMPLE_MAX),
  })
  .strict();
export type ScreenShareWatchersUpdate = z.infer<typeof ScreenShareWatchersUpdateSchema>;
