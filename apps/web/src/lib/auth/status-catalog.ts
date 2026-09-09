/**
 * Kimlik akışının 10 hata/uç durumu ve üç gösterim seviyesi — tek katalog.
 *
 * Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §7 tablosu (ton, etiket, başlık, kart içi
 * parça) ve §8 (seviye 1 alan içi · 2 form üstü bant · 3 formu engelleyen blok).
 *
 * Ekranlar durumu **yorumlamaz**: sunucu bir `AuthStatusId` döner, ekran kataloğa bakıp hangi
 * seviyede hangi metinle çizeceğini buradan okur. Metin katalogda değil sözlükte durur; katalog
 * yalnız anahtarı taşır (SPEC §12/9 — hiçbir metin sabit kodlanmaz).
 */

export type AuthStatusId =
  | "accountLocked"
  | "accountSuspended"
  | "codeInvalid"
  | "credentials"
  | "emailRegistered"
  | "linkExpired"
  | "network"
  | "passwordWeak"
  | "rateLimit"
  | "usernameTaken";

/** SPEC §7 — doygun ton yalnız zemin tint'i, kenarlık ve nokta göstergesinde kullanılır. */
export type AuthStatusTone = "danger" | "neutral" | "warning";

/** SPEC §8 — 1 alan içi, 2 form üstü bant, 3 formu engelleyen blok. */
export type AuthStatusLevel = 1 | 2 | 3;

export type AuthStatusDefinition = {
  /** SPEC §7 kart içi parçasının hangi alana bağlandığı; seviye 1 durumlarında dolu. */
  fieldKey?: string;
  /** SPEC §7 başlık satırındaki 24px karonun glifi. */
  glyph: string;
  id: AuthStatusId;
  labelKey: string;
  level: AuthStatusLevel;
  descriptionKey: string;
  /** Kart içi sayaç/ölçüm satırı (`Kalan süre 14:32`, `Yeni kod · 01:58`, `3 deneme kaldı`). */
  meterKey?: string;
  primaryActionKey?: string;
  secondaryActionKey?: string;
  /**
   * Durumun ürün tarafında gerçekten tetiklenebilir olup olmadığı. `false` olan bir durum
   * katalogda ve galeride durur ama akışa bağlanmaz — arkasındaki veri henüz yok.
   */
  supported: boolean;
  titleKey: string;
  tone: AuthStatusTone;
};

export const AUTH_STATUS_CATALOG: Readonly<Record<AuthStatusId, AuthStatusDefinition>> = {
  /** SPEC §7/1 — hatalı şifre alanı + eşleşme mesajı + kalan deneme sayacı. */
  credentials: {
    descriptionKey: "auth.status.credentials.description",
    fieldKey: "auth.status.credentials.field",
    glyph: "!",
    id: "credentials",
    labelKey: "auth.status.credentials.label",
    level: 1,
    meterKey: "auth.status.credentials.attemptsLeft",
    supported: true,
    titleKey: "auth.status.credentials.title",
    tone: "danger",
  },

  /** SPEC §7/2 — h44 sayaç bandı + iki düğme; form gizlenir. */
  accountLocked: {
    descriptionKey: "auth.status.accountLocked.description",
    glyph: "⏻",
    id: "accountLocked",
    labelKey: "auth.status.accountLocked.label",
    level: 3,
    meterKey: "auth.status.accountLocked.countdown",
    primaryActionKey: "auth.status.accountLocked.action",
    secondaryActionKey: "auth.common.backToLogin",
    supported: true,
    titleKey: "auth.status.accountLocked.title",
    tone: "danger",
  },

  /** SPEC §7/3 — altı hücre kırmızı dolu + `Yedek kod kullan`. */
  codeInvalid: {
    descriptionKey: "auth.status.codeInvalid.description",
    glyph: "!",
    id: "codeInvalid",
    labelKey: "auth.status.codeInvalid.label",
    level: 1,
    meterKey: "auth.verifyEmail.wait",
    primaryActionKey: "auth.status.codeInvalid.action",
    supported: true,
    titleKey: "auth.status.codeInvalid.title",
    tone: "danger",
  },

  /** SPEC §7/4 — uyarı alanı + üç öneri etiketi. */
  usernameTaken: {
    descriptionKey: "auth.status.usernameTaken.description",
    glyph: "@",
    id: "usernameTaken",
    labelKey: "auth.status.usernameTaken.label",
    level: 1,
    supported: true,
    titleKey: "auth.status.usernameTaken.title",
    tone: "warning",
  },

  /** SPEC §7/5 — uyarı alanı + %50 çubuk + 2/4 kural listesi. */
  passwordWeak: {
    descriptionKey: "auth.status.passwordWeak.description",
    fieldKey: "auth.status.passwordWeak.field",
    glyph: "!",
    id: "passwordWeak",
    labelKey: "auth.status.passwordWeak.label",
    level: 1,
    supported: true,
    titleKey: "auth.status.passwordWeak.title",
    tone: "warning",
  },

  /** SPEC §7/6 — uyarı alanı + `Giriş yap` / `Şifremi sıfırla`. */
  emailRegistered: {
    descriptionKey: "auth.status.emailRegistered.description",
    glyph: "✉",
    id: "emailRegistered",
    labelKey: "auth.status.emailRegistered.label",
    level: 1,
    primaryActionKey: "auth.login.cta",
    secondaryActionKey: "auth.status.accountLocked.action",
    supported: true,
    titleKey: "auth.status.emailRegistered.title",
    tone: "warning",
  },

  /** SPEC §7/7 — `whispr.app · 503` bandı + `Tekrar dene`. */
  network: {
    descriptionKey: "auth.status.network.description",
    glyph: "⚡",
    id: "network",
    labelKey: "auth.status.network.label",
    level: 2,
    meterKey: "auth.status.network.detail",
    primaryActionKey: "auth.status.network.action",
    supported: true,
    titleKey: "auth.status.network.title",
    tone: "danger",
  },

  /** SPEC §7/8 — bilgi kutusu (adres + tarih) + `Yeni bağlantı gönder`; form gizlenir. */
  linkExpired: {
    descriptionKey: "auth.status.linkExpired.description",
    glyph: "⏱",
    id: "linkExpired",
    labelKey: "auth.status.linkExpired.label",
    level: 3,
    meterKey: "auth.status.linkExpired.meta",
    primaryActionKey: "auth.status.linkExpired.action",
    secondaryActionKey: "auth.common.backToLogin",
    supported: true,
    titleKey: "auth.status.linkExpired.title",
    tone: "warning",
  },

  /** SPEC §7/9 — devre dışı `Yeni kod · 01:58` düğmesi + ilerleme çubuğu. */
  rateLimit: {
    descriptionKey: "auth.status.rateLimit.description",
    glyph: "⏳",
    id: "rateLimit",
    labelKey: "auth.status.rateLimit.label",
    level: 2,
    meterKey: "auth.status.rateLimit.countdown",
    supported: true,
    titleKey: "auth.status.rateLimit.title",
    tone: "warning",
  },

  /**
   * SPEC §7/10 — nötr ton (`--surface-soft` / `--text-secondary`), `Referans · WSP-…`.
   *
   * Ş2 kaynağı buldu: askı `User.isBanned` / `bannedAt` / `bannedReason` üstünden geliyor.
   * Kısa referans numarasının kendi kolonu yok; `account-suspension.ts` en yeni moderasyon
   * vakasının kimliğinden türetiyor ve vaka yoksa referans **hiç gönderilmiyor** — uydurulmuş
   * bir numara destek ekibini boş aramaya gönderirdi.
   */
  accountSuspended: {
    descriptionKey: "auth.status.accountSuspended.description",
    glyph: "⊘",
    id: "accountSuspended",
    labelKey: "auth.status.accountSuspended.label",
    level: 3,
    meterKey: "auth.status.accountSuspended.reference",
    primaryActionKey: "auth.status.accountSuspended.action",
    secondaryActionKey: "auth.status.accountSuspended.secondaryAction",
    supported: true,
    titleKey: "auth.status.accountSuspended.title",
    tone: "neutral",
  },
} as const;

export const AUTH_STATUS_IDS = Object.keys(AUTH_STATUS_CATALOG) as AuthStatusId[];

export function getAuthStatus(id: AuthStatusId): AuthStatusDefinition {
  return AUTH_STATUS_CATALOG[id];
}

/** SPEC §8 — bir durumun hangi gösterim seviyesinde çizileceği. */
export function getAuthStatusLevel(id: AuthStatusId): AuthStatusLevel {
  return AUTH_STATUS_CATALOG[id].level;
}
