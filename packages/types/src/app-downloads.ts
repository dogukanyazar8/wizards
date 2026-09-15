import { z } from "zod";

/**
 * "Whispr'i indir" penceresinin kataloğu (SPEC-INDIRME §B).
 *
 * Pencere iki ortamı (PROD/UAT) yan yana anlatır ve ortam değiştirmek anında
 * olur, o yüzden uç **iki kataloğu birden** döner: ikinci bir istek, kullanıcı
 * için görünür bir bekleme demekti.
 *
 * Etiketler iki dilli tutulur çünkü meta satırı ("Windows 10/11 · x64 ve ARM64
 * · 96 MB") sürümden sürüme değişen, yönetim konsolundan yazılan bir metindir;
 * i18n sözlüğüne konsa her yayında koda dokunmak gerekirdi.
 */

const HttpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => value.startsWith("https://"), {
    message: "Download links must use HTTPS.",
  });

export const DownloadEnvironmentSchema = z.enum(["prod", "uat"]);
export const DownloadPlatformSchema = z.enum(["windows", "macos", "linux", "android", "ios"]);
/** Düğmenin ikonunu belirler: `store` dış bağlantı oku, diğerleri indirme oku. */
export const DownloadDeliverySchema = z.enum(["direct", "store", "testflight"]);

export type DownloadEnvironment = z.infer<typeof DownloadEnvironmentSchema>;
export type DownloadPlatform = z.infer<typeof DownloadPlatformSchema>;
export type DownloadDelivery = z.infer<typeof DownloadDeliverySchema>;

/** SPEC §B.4/§B.5 kart sırası. Sıralama sunucuda sabittir, DB'ye bırakılmaz. */
export const DOWNLOAD_DESKTOP_PLATFORMS = ["windows", "macos", "linux"] as const;
export const DOWNLOAD_MOBILE_PLATFORMS = ["android", "ios"] as const;
export const DOWNLOAD_PLATFORM_ORDER = [
  ...DOWNLOAD_DESKTOP_PLATFORMS,
  ...DOWNLOAD_MOBILE_PLATFORMS,
] as const;

export const DOWNLOAD_SECTION_MAX_ARTIFACTS = DOWNLOAD_DESKTOP_PLATFORMS.length;

export const DownloadLocalizedLabelSchema = z
  .object({
    en: z.string().trim().min(1).max(120),
    tr: z.string().trim().min(1).max(120),
  })
  .strict();

export const DownloadArtifactSchema = z
  .object({
    /** `1187` gibi build numarası; masaüstü sürüm pilinde parantez içinde çıkar. */
    buildLabel: z.string().min(1).max(32).nullable(),
    delivery: DownloadDeliverySchema,
    /** `.exe`, `.AppImage · .deb`, `Play Store`, `TestFlight`. */
    extensionLabel: DownloadLocalizedLabelSchema,
    /** Kartın tek satırlık meta metni; UI kırpar, sunucu kısaltmaz. */
    metaLabel: DownloadLocalizedLabelSchema,
    platform: DownloadPlatformSchema,
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    /** Kolon `BigInt`; tele düz sayı olarak çıkar çünkü `BigInt` JSON'a serileşmez. */
    sizeBytes: z.number().int().positive().nullable(),
    url: HttpsUrlSchema,
    versionLabel: z.string().min(1).max(32),
  })
  .strict();

/**
 * Bölüm başlığındaki sürüm pili ve tarih, kartların kendi alanlarından
 * türetilmez: bir bölümde iki farklı sürüm bulunabilir ve başlık tek bir şey
 * söylemek zorundadır. O yüzden sunucu bölüm düzeyinde açıkça yazar.
 */
export const DownloadSectionSchema = z
  .object({
    artifacts: z.array(DownloadArtifactSchema).max(DOWNLOAD_SECTION_MAX_ARTIFACTS),
    /** `null` = bu ortamda yayınlanmış paket yok. */
    buildLabel: z.string().min(1).max(32).nullable(),
    releasedAt: z.string().datetime().nullable(),
    versionLabel: z.string().min(1).max(32).nullable(),
  })
  .strict();

export const DownloadCatalogSchema = z
  .object({
    desktop: DownloadSectionSchema,
    environment: DownloadEnvironmentSchema,
    mobile: DownloadSectionSchema,
  })
  .strict();

export const AppDownloadsResponseSchema = z
  .object({
    catalogs: z.object({ prod: DownloadCatalogSchema, uat: DownloadCatalogSchema }).strict(),
    /** Uygulamanın koştuğu ortam; pencere bununla açılır (K4). */
    defaultEnvironment: DownloadEnvironmentSchema,
  })
  .strict();

export type DownloadLocalizedLabel = z.infer<typeof DownloadLocalizedLabelSchema>;
export type DownloadArtifact = z.infer<typeof DownloadArtifactSchema>;
export type DownloadSection = z.infer<typeof DownloadSectionSchema>;
export type DownloadCatalog = z.infer<typeof DownloadCatalogSchema>;
export type AppDownloadsResponse = z.infer<typeof AppDownloadsResponseSchema>;

export function isDesktopDownloadPlatform(platform: DownloadPlatform): boolean {
  return (DOWNLOAD_DESKTOP_PLATFORMS as readonly DownloadPlatform[]).includes(platform);
}

/**
 * STABLE is the PROD (Stable) catalog; UAT is the Beta catalog.
 */
export const DOWNLOAD_ENVIRONMENT_CHANNEL = {
  prod: "STABLE",
  uat: "UAT",
} as const satisfies Record<DownloadEnvironment, "STABLE" | "UAT">;
