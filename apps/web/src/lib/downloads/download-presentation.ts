import type {
  DownloadArtifact,
  DownloadCatalog,
  DownloadEnvironment,
  DownloadPlatform,
  DownloadSection,
} from "@wizards/types";

/**
 * SPEC-INDIRME §B sunum kuralları.
 *
 * Kartın tonu, düğmenin metni, ikonu ve sürüm pilinin metni tamamen veriden
 * türer; bileşen bu kararları vermez, yalnız çizer.
 */

export type DownloadTone = "info" | "primary" | "success" | "warning";

/** SPEC §B.4/§B.5 tile tonları. */
const PLATFORM_TONE = {
  android: "success",
  ios: "info",
  linux: "warning",
  macos: "info",
  windows: "primary",
} as const satisfies Record<DownloadPlatform, DownloadTone>;

export function downloadPlatformTone(platform: DownloadPlatform): DownloadTone {
  return PLATFORM_TONE[platform];
}

/** İndirme düğmesinin tonu **ortamdan** gelir: PROD success, UAT warning. */
export function downloadEnvironmentTone(environment: DownloadEnvironment): DownloadTone {
  return environment === "prod" ? "success" : "warning";
}

/**
 * Düğme metni. Mağaza bağlantısı mağazanın adını söyler; dahili paket ne
 * indirileceğini söyler. İkisi de i18n anahtarı olarak döner çünkü "APK indir"
 * çevrilebilir bir cümle, "Play Store" ise bir ad.
 */
export function downloadActionLabelKey(artifact: DownloadArtifact): string {
  if (artifact.delivery === "store") {
    return artifact.platform === "ios"
      ? "download.action.store.ios"
      : "download.action.store.android";
  }

  if (artifact.delivery === "testflight") {
    return "download.action.testflight";
  }

  return artifact.platform === "android" ? "download.action.apk" : "download.action.download";
}

/** Mağaza bağlantısı dış bağlantı oku, diğer her şey indirme oku alır. */
export function downloadActionIcon(artifact: DownloadArtifact): "external" | "download" {
  return artifact.delivery === "store" ? "external" : "download";
}

/**
 * Mağaza bağlantısı yeni sekmede açılır; doğrudan indirme aynı sekmede kalır ki
 * tarayıcı indirmeyi başlatırken boş bir sekme bırakmasın.
 */
export function opensInNewTab(artifact: DownloadArtifact): boolean {
  return artifact.delivery === "store";
}

/**
 * Mobil uzantı pili UAT'de dikkat çeker: "APK · dahili test" mağaza sürümüyle
 * karıştırılmamalı.
 */
export function downloadExtensionTone(
  artifact: DownloadArtifact,
  environment: DownloadEnvironment,
): DownloadTone | null {
  if (environment === "uat" && (artifact.platform === "android" || artifact.platform === "ios")) {
    return "warning";
  }

  return null;
}

/** `2.4.1 (1187)`; build yoksa yalnız sürüm. */
export function formatVersionPill(section: DownloadSection): string | null {
  if (section.versionLabel === null) {
    return null;
  }

  return section.buildLabel === null
    ? section.versionLabel
    : `${section.versionLabel} (${section.buildLabel})`;
}

/**
 * Uyarı şeridindeki pil masaüstü sürümünü söyler; masaüstü boşsa mobile düşer.
 * İkisi de boşsa pil hiç çizilmez — uydurma bir sürüm yazmaktansa susmak doğru.
 */
export function catalogVersionPill(catalog: DownloadCatalog): string | null {
  return formatVersionPill(catalog.desktop) ?? formatVersionPill(catalog.mobile);
}

/** `26 Ağustos 2026`. Biçim yerelden gelir, metin sözlükten değil. */
export function formatReleaseDate(iso: string | null, locale: string): string | null {
  if (iso === null) {
    return null;
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

/**
 * Bir bağlantı çizilmeden önce son kapı. Katalog şeması zaten `https://`
 * istiyor ama bu değer bir yönetim konsolundan yazılıyor: render tarafında bir
 * kez daha bakmak, tek bir sözleşme kaçağının kullanıcıya `javascript:` bir
 * bağlantı göstermesini engeller.
 */
export function safeDownloadUrl(url: string): string | null {
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function visibleDownloadArtifacts(
  section: DownloadSection,
): readonly (DownloadArtifact & { readonly href: string })[] {
  return section.artifacts.flatMap((artifact) => {
    const href = safeDownloadUrl(artifact.url);
    return href === null ? [] : [{ ...artifact, href }];
  });
}
