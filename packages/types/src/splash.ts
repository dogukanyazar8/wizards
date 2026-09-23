import { z } from "zod";

/**
 * Açılış ekranının (splash) üç yüzeyde ortak dili — SPEC-SPLASH 1b.
 *
 * Web, masaüstü ve mobil aynı adımları, aynı dört durumu ve aynı sürüm satırını
 * gösterir. Bu modül o sözleşmenin saf hâlidir: React yok, platform importu yok,
 * zamanlayıcı yok. Yüzeyler yalnız sinyal üretir, karar burada verilir; aksi
 * hâlde "hangi adımdayız" sorusunun üç ayrı cevabı olurdu.
 */

export const SplashStepIdSchema = z.enum(["connecting", "session", "servers", "almostReady"]);
export const SplashStateIdSchema = z.enum([
  "loading",
  "slow",
  "offline",
  "updating",
  "sessionExpired",
]);
export const SplashEnvironmentSchema = z.enum(["prod", "uat"]);
export const SplashSurfaceSchema = z.enum(["desktop", "web", "mobile"]);
export const SplashStepStatusSchema = z.enum(["done", "current", "pending"]);

export type SplashStepId = z.infer<typeof SplashStepIdSchema>;
export type SplashStateId = z.infer<typeof SplashStateIdSchema>;
export type SplashEnvironment = z.infer<typeof SplashEnvironmentSchema>;
export type SplashStepStatus = z.infer<typeof SplashStepStatusSchema>;

/**
 * SPEC §3.5 sırası. Sıra anlamlıdır: "tamamlandı / aktif / bekleyen" ayrımı
 * yalnız bu diziye göre hesaplanır.
 */
export const SPLASH_STEP_ORDER = ["connecting", "session", "servers", "almostReady"] as const;

/** SPEC §8 zamanları. Yüzeyler kendi sayılarını yazmaz. */
export const SPLASH_MIN_VISIBLE_MS = 600;
export const SPLASH_FADE_OUT_MS = 180;
export const SPLASH_SLOW_AFTER_MS = 10_000;

/**
 * Soketin beklenebileceği en uzun süre.
 *
 * SPEC §8 dördüncü adımı gerçek realtime bağlantısına bağlıyor ve kapanış için
 * "kabuk hazır olduğunda" diyor. Soket hiç gelmezse bu, açılış ekranını süresiz
 * bir duvara çevirir: kullanıcı uygulamaya hiç giremez. Bu tavan yalnız **soket**
 * aşamasını affeder — bootstrap, oturum ve çalışma alanı hâlâ beklenir, çünkü
 * onlarsız açılan kabuk boş bir ekrandır. Süre dolduğunda uygulama canlı bağlantı
 * olmadan açılır ve realtime katmanı arka planda denemeye devam eder.
 */
export const SPLASH_REALTIME_GRACE_MS = 20_000;

/** Mobil tek satırının sonu (SPEC §6): `Bağlanıyor…`. U+2026, üç ayrı nokta değil. */
export const SPLASH_STEP_LINE_SUFFIX = "…";

/** Sürüm satırının ayırıcısı (SPEC §3.4): U+00B7. `-` ya da `•` kullanılmaz. */
const SPLASH_VERSION_SEPARATOR = " · ";

/** İndirme satırı ondalık MB sayar (10^6), depodaki indirme kataloğuyla aynı ölçü. */
const SPLASH_UPDATE_MB_DIVISOR = 1_000_000;

export const SplashVersionInfoSchema = z
  .object({
    /** `1187` gibi build numarası. Yoksa sürüm satırında parantez bloğu hiç çizilmez. */
    buildNumber: z.string().trim().min(1).max(32).optional(),
    /** `Resonance`. Yoksa ayırıcı da düşer. */
    codename: z.string().trim().min(1).max(48).optional(),
    version: z.string().trim().min(1).max(32),
  })
  .strict();

export const SplashUpdateProgressSchema = z
  .object({
    downloadedBytes: z.number().int().nonnegative(),
    /**
     * Kaynak toplam boyutu bildirmiyorsa `null` — Tauri `contentLength`'i ve
     * Android indiricisi bunu her zaman veremez. `null` iken yüzde satırı
     * üretilmez; uydurma toplam yazmaktansa satırı çizmemek doğrudur.
     */
    totalBytes: z.number().int().positive().nullable(),
    /** İnen sürümün numarası; durum metnindeki `{version}` bunu okur. */
    version: z.string().trim().min(1).max(32).nullable(),
  })
  .strict();

export type SplashVersionInfo = z.infer<typeof SplashVersionInfoSchema>;
export type SplashUpdateProgress = z.infer<typeof SplashUpdateProgressSchema>;

/**
 * Yayın kanalı → ortam rozeti (SPEC §3.3).
 *
 * Yalnız `production`/`stable` PROD sayılır; tanınmayan, boş ya da geliştirme
 * kanalları UAT'ye düşer. Yanlışlıkla PROD rozeti göstermek, yanlışlıkla UAT
 * göstermekten pahalıdır: kullanıcı hangi ortamda hata bildirdiğini bu rozete
 * bakarak söylüyor.
 */
export function resolveSplashEnvironment(channel: string | null | undefined): SplashEnvironment {
  switch (channel?.trim().toLowerCase()) {
    case "production":
    case "stable":
      return "prod";
    default:
      return "uat";
  }
}

/** `v2.4.1` ve `2.4.1 "Resonance"` gibi süslenmiş sürümleri çıplak semver'e indirir. */
function normalizeSplashVersion(version: string): string {
  const withoutCodename = version.trim().replace(/\s*"[^"]*"\s*$/, "");
  return withoutCodename.replace(/^v/i, "").trim();
}

/**
 * SPEC §3.4 biçimi: `Whispr 2.4.1 (1187) · Resonance`.
 *
 * Eksik parça sessizce boş bırakılmaz, **blok tümüyle düşer** — `Whispr 2.4.1 ()`
 * ya da sonu ayırıcıyla biten bir satır tasarımda yok.
 */
export function formatSplashVersionLine(info: SplashVersionInfo): string {
  const version = normalizeSplashVersion(info.version);
  const buildNumber = info.buildNumber?.trim();
  const codename = info.codename?.trim();

  const head = buildNumber ? `Whispr ${version} (${buildNumber})` : `Whispr ${version}`;

  return codename ? `${head}${SPLASH_VERSION_SEPARATOR}${codename}` : head;
}

function getSplashStepIndex(step: SplashStepId): number {
  return SPLASH_STEP_ORDER.indexOf(step);
}

/** SPEC §3.5 üç satırı: aktifin öncesi onaylı, kendisi nabız, sonrası boş daire. */
export function getSplashStepStatus(
  step: SplashStepId,
  activeStep: SplashStepId,
): SplashStepStatus {
  const stepIndex = getSplashStepIndex(step);
  const activeIndex = getSplashStepIndex(activeStep);

  if (stepIndex < activeIndex) {
    return "done";
  }

  return stepIndex === activeIndex ? "current" : "pending";
}

/**
 * Adım listesi geri saymaz.
 *
 * Ağ dalgalanmasında sinyaller bir an için geriye düşebiliyor (soket kopar,
 * sorgu yeniden yüklenir). Onaylanmış bir adımın tekrar "bekleyen"e dönmesi
 * kullanıcıya uygulamanın baştan başladığını söylerdi.
 */
export function advanceSplashStep(current: SplashStepId, next: SplashStepId): SplashStepId {
  return getSplashStepIndex(next) > getSplashStepIndex(current) ? next : current;
}

const splashMegabyteFormatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/**
 * SPEC §7 durum 3 alt satırı: `%64 · 11,8 / 18,4 MB`.
 *
 * Toplam bilinmiyorsa `null` döner ve çağıran satırı hiç çizmez.
 */
export function formatSplashUpdateProgress(progress: SplashUpdateProgress): string | null {
  if (progress.totalBytes === null) {
    return null;
  }

  const downloadedBytes = Math.min(progress.downloadedBytes, progress.totalBytes);
  const percent = Math.round((downloadedBytes / progress.totalBytes) * 100);
  const downloadedMb = splashMegabyteFormatter.format(downloadedBytes / SPLASH_UPDATE_MB_DIVISOR);
  const totalMb = splashMegabyteFormatter.format(progress.totalBytes / SPLASH_UPDATE_MB_DIVISOR);

  return `%${percent}${SPLASH_VERSION_SEPARATOR}${downloadedMb} / ${totalMb} MB`;
}

/**
 * Açılış ekranının çalışma anı girdisi.
 *
 * Üç yüzey de bunu üretir; kararlar aşağıdaki saf fonksiyonlarda verilir. Motorun
 * burada durmasının sebebi K1: dört durum üç yüzeyde de çizilecekse önceliklerin
 * tek bir yerde tanımlı olması gerekir, yoksa "hangi durum kazanır" sorusunun üç
 * ayrı cevabı olur.
 */
export type SplashRuntimeInput = {
  /** İlk bootstrap/oturum isteği yanıtlandı mı — adım 1'in gerçek sinyali. */
  bootstrapRequestSettled: boolean;
  /** Splash göründüğünden beri geçen süre; 10 sn ve 20 sn eşiklerini bu belirler. */
  elapsedMs: number;
  online: boolean;
  realtimeConnected: boolean;
  /** 401 yakalandı: oturum bitti. */
  sessionExpired: boolean;
  /** Oturum + görünüm + düzen tercihleri yerinde. */
  sessionHydrated: boolean;
  /**
   * Gerçek indirme ilerlemesi. Yalnız indirmeyi kendi yürüten yüzeyler doldurur;
   * web ve iOS daima `null` verir (K10).
   */
  update: SplashUpdateProgress | null;
  /** Sunucu listesi + açılan rotanın verisi. */
  workspaceLoaded: boolean;
};

/** K7 eşlemesi: bootstrap → oturum → sunucular → soket. İlk **bitmemiş** aşama döner. */
export function getSplashStep(input: SplashRuntimeInput): SplashStepId {
  if (!input.bootstrapRequestSettled) {
    return "connecting";
  }

  if (!input.sessionHydrated) {
    return "session";
  }

  if (!input.workspaceLoaded) {
    return "servers";
  }

  return "almostReady";
}

/**
 * SPEC §7'nin dört durumu + normal yükleme. Öncelik sırası kesindir:
 *
 * oturum bitti > güncelleme iniyor > bağlantı yok > uzun sürüyor > yükleniyor.
 *
 * Oturumu bitmiş kullanıcıya "bağlantını kontrol et" demek onu yanlış düğmeye
 * yollar; indirme sürerken "uzun sürüyor" demek de doğru olanı gizler.
 */
export function getSplashState(input: SplashRuntimeInput): SplashStateId {
  if (input.sessionExpired) {
    return "sessionExpired";
  }

  if (input.update !== null) {
    return "updating";
  }

  if (!input.online) {
    return "offline";
  }

  if (input.elapsedMs >= SPLASH_SLOW_AFTER_MS) {
    return "slow";
  }

  return "loading";
}

/**
 * Kabuğun gerçekten hazır olması: dört aşamanın dördü de bitti.
 *
 * Soket için bir tavan var (`SPLASH_REALTIME_GRACE_MS`): 20 sn sonra uygulama canlı
 * bağlantı olmadan açılır. Tavan diğer üç aşamayı **affetmez**; oturumsuz ya da
 * çalışma alanı yüklenmemiş bir kabuk boş ekrandır.
 */
export function isSplashComplete(input: SplashRuntimeInput): boolean {
  const realtimeSettled = input.realtimeConnected || input.elapsedMs >= SPLASH_REALTIME_GRACE_MS;

  return (
    input.bootstrapRequestSettled &&
    input.sessionHydrated &&
    input.workspaceLoaded &&
    realtimeSettled
  );
}

/**
 * SPEC §8: "Bağlantı gelince otomatik olarak deneriz."
 *
 * Zamanlayıcı değil, sinyal güdümlü: `offline` durumundayken ağ geri geldiği anda
 * bir kez tetiklenir.
 */
export function shouldRetryAfterReconnect(
  previousState: SplashStateId,
  input: SplashRuntimeInput,
): boolean {
  return previousState === "offline" && input.online && !input.sessionExpired;
}

/** `18,4 MB` — durum metnindeki `{size}`. Toplam bilinmiyorsa `null`. */
export function formatSplashUpdateSize(totalBytes: number | null): string | null {
  if (totalBytes === null) {
    return null;
  }

  return `${splashMegabyteFormatter.format(totalBytes / SPLASH_UPDATE_MB_DIVISOR)} MB`;
}

/** SPEC §3.5 adım metinlerinin i18n anahtarları. */
export const SPLASH_STEP_TEXT_KEYS = {
  almostReady: "splash.step.almostReady",
  connecting: "splash.step.connecting",
  servers: "splash.step.servers",
  session: "splash.step.session",
} as const satisfies Record<SplashStepId, string>;

/** SPEC §3.6 dört ipucu. Sıra korunur; açılışta biri rastgele seçilir. */
export const SPLASH_TIP_TEXT_KEYS = [
  "splash.tip.commandPalette",
  "splash.tip.voiceMute",
  "splash.tip.quickReaction",
  "splash.tip.mentions",
] as const;

/** SPEC §7 tablosunun dört satırı. `updating`in eylemi düğme değil, ilerleme çubuğudur. */
export const SPLASH_STATE_TEXT_KEYS = {
  offline: {
    action: "splash.state.offline.action",
    description: "splash.state.offline.description",
    kicker: "splash.state.offline.kicker",
    title: "splash.state.offline.title",
  },
  sessionExpired: {
    action: "splash.state.sessionExpired.action",
    description: "splash.state.sessionExpired.description",
    kicker: "splash.state.sessionExpired.kicker",
    title: "splash.state.sessionExpired.title",
  },
  slow: {
    action: "splash.state.slow.action",
    description: "splash.state.slow.description",
    kicker: "splash.state.slow.kicker",
    title: "splash.state.slow.title",
  },
  updating: {
    description: "splash.state.updating.description",
    /*
     * Sürüm ya da boyut bilinmiyorsa cümlenin veri taşıyan yarısı düşer ve
     * yalnız ikinci cümle kalır. Boş yer tutucu ("Sürüm  ·  .") yazmaktansa
     * eksik cümleyi hiç kurmamak doğrudur.
     */
    descriptionUnknown: "splash.state.updating.descriptionUnknown",
    kicker: "splash.state.updating.kicker",
    title: "splash.state.updating.title",
  },
} as const;

export const SPLASH_ENVIRONMENT_TEXT_KEYS = {
  prod: "splash.env.prod",
  uat: "splash.env.uat",
} as const satisfies Record<SplashEnvironment, string>;

/**
 * Üç yüzeyin kullandığı anahtarların tek listesi.
 *
 * Sözlükte eksik anahtar, i18n testinde ekran açılmadan yakalanır; bunu bir
 * ekranın çalışma anında `splash.state.slow.title` yazmasıyla öğrenmek istemiyoruz.
 */
export const SPLASH_TEXT_KEYS = [
  "splash.kicker",
  "splash.tagline",
  ...Object.values(SPLASH_STEP_TEXT_KEYS),
  ...Object.values(SPLASH_ENVIRONMENT_TEXT_KEYS),
  ...SPLASH_TIP_TEXT_KEYS,
  ...Object.values(SPLASH_STATE_TEXT_KEYS).flatMap((state) => Object.values(state)),
] as const satisfies readonly string[];

/**
 * Açılışta gösterilecek ipucu. `random` dışarıdan verilir ki test rastgeleliğe
 * bağlı kalmasın ve sunucu/istemci aynı seçimi zorlamak zorunda olmasın.
 */
export function pickSplashTipKey(random: number): (typeof SPLASH_TIP_TEXT_KEYS)[number] {
  const clamped = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999_999) : 0;
  const index = Math.floor(clamped * SPLASH_TIP_TEXT_KEYS.length);

  return SPLASH_TIP_TEXT_KEYS[index] ?? SPLASH_TIP_TEXT_KEYS[0];
}
