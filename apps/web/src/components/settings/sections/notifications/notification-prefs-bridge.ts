import {
  LOCKED_NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_SOUND_KEYS,
  type MuteDuration,
  type NotificationPrefs,
  type NotificationPrefsPatch,
  type NotificationSoundKey,
  type NotificationTypeKey,
  type NotifLevel,
  type SoundProfile,
  type SystemNotifMode,
} from "@wizards/types";

import { walkSettingsRows } from "@/lib/settings/tree";
import {
  SETTINGS_SOUND_PROFILE_SUFFIX,
  SETTINGS_SOUND_VOLUME_SUFFIX,
  type SettingsPatch,
  type SettingValue,
} from "@/lib/settings/use-setting-value";

/**
 * Ayarlar paketi — Dalga 3 / Ş9. Satır anahtarı ↔ `NotificationPrefs` köprüsü.
 *
 * Satır motoru düz bir `Record<string, boolean | number | string>` konuşur (`nt3`, `ns1_v`,
 * `np1`); uç ise `NotificationPrefs` ağacını. Çeviri **tek** yerde, saf fonksiyonlarda durur:
 * bir React ağacı kurmadan "kapatınca ters mantıklı kolon `true` oluyor mu" ya da "`np4`
 * yazması `na6`'ya sızıyor mu" sorularını ancak böyle sorabiliyoruz.
 *
 * Yön ayrı ayrı yazıldı (`toSettingsValues` / `toNotificationPrefsPatch`) çünkü ikisi aynı şey
 * değil: okuma **tam** nesneyi düzleştirir, yazma ise motorun biriktirdiği **kısmi** yamayı
 * çevirir. Tek bir çift yönlü tabloya sıkıştırmak, kısmi yamayı tam nesneymiş gibi göndermek
 * demekti — dokunulmamış her tercih sunucuya yeniden yazılırdı.
 *
 * **Ters mantık burada yok** (tuzak #2). `nt3` / `nt4` bileşende düz mantıktır ve düz mantıkla
 * uca gider; `suppressRoleMentions` / `suppressEveryoneMentions` çevirmesi `prefs-service`
 * içinde kalır. İkinci bir çevirme noktası, iki tarafın da "ben çevirmiştim" dediği bir hata
 * sınıfı açardı.
 */

/** SPEC §5.4 Türler sekmesi — on altı satır, ağaçtaki sırayla. */
export const NOTIFICATION_TYPE_ROW_KEYS: Readonly<Record<string, NotificationTypeKey>> = {
  nt1: "dm",
  nt2: "mentionSelf",
  nt3: "mentionRole",
  nt4: "mentionEveryone",
  nt5: "threadReplies",
  nt6: "messageReplies",
  nt7: "incomingCall",
  nt8: "voiceInvite",
  nt9: "friendRequest",
  nt10: "serverInvite",
  nt11: "events",
  nt12: "badges",
  nt15: "announcements",
  nt16: "productUpdates",
};

/** Tuzak #5 — kolonu olmayan iki satır. Okumada var, yamada **yok**. */
export const LOCKED_NOTIFICATION_TYPE_ROW_KEYS: Readonly<
  Record<string, (typeof LOCKED_NOTIFICATION_TYPE_KEYS)[number]>
> = {
  nt13: "security",
  nt14: "moderation",
};

/** SPEC §5.4 Sesler sekmesi — dört satır; `ns1` Genel sekmesiyle paylaşılan anahtar. */
export const NOTIFICATION_SOUND_ROW_KEYS: Readonly<Record<string, NotificationSoundKey>> = {
  ns1: "notification",
  ns2: "call",
  ns3: "join",
  ns4: "leave",
};

/**
 * Sapma #6 — `b1` ile 560 px penceredeki radyo kartları **aynı** `level` anahtarını yazar.
 * Etiketler farklı (`Tüm bildirimler` ↔ `Tümü`), değer kümesi aynı ve sıra ağacın sırasıdır.
 */
export const NOTIF_LEVEL_BY_INDEX: readonly NotifLevel[] = ["all", "important", "off"];

/** Referans `nd2` — `Tümü / Yalnız bahsetmeler / Kapalı`. */
export const SYSTEM_NOTIF_MODE_BY_INDEX: readonly SystemNotifMode[] = ["all", "mentions", "off"];

/** Referans `ne1` — sapma #9 satırı kendi grubuna taşır, değer kümesi değişmez. */
export const MUTE_DURATION_BY_INDEX: readonly MuteDuration[] = ["1h", "8h", "24h", "forever"];

/** Referans `np1` — panelde aynı anda duran kart sayısı. */
export const PANEL_COUNT_BY_INDEX: readonly (3 | 4 | 5 | 6)[] = [3, 4, 5, 6];

/** Referans `np3` — saniye. */
export const PANEL_DURATION_BY_INDEX: readonly number[] = [5, 10, 15, 20, 30];

/** Ş9 §4 — tasarımdaki dört seçenek örnek veridir; menü 24 saati yarım saatlik adımlarla listeler. */
export const QUIET_HOUR_STEP_MINUTES = 30;

export function buildQuietHourOptions(): readonly string[] {
  const options: string[] = [];

  for (let minutes = 0; minutes < 24 * 60; minutes += QUIET_HOUR_STEP_MINUTES) {
    options.push(formatClock(minutes));
  }

  return options;
}

export function formatClock(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

const QUIET_HOUR_OPTIONS = buildQuietHourOptions();

/**
 * Menünün seçenek listesi — 48 yarım saat, artı ızgaraya oturmayan gerçek değerler.
 *
 * Bir başka istemci `23:15` yazmış olabilir ve o değeri listeden düşürmek, menüyü açan
 * kullanıcıya **başka** bir saati seçili gibi göstermek olurdu. Ek değer sıralı yerine girer;
 * iki menü tek liste paylaşır çünkü başlangıç ve bitiş aynı ızgarayı okur.
 */
export function resolveQuietHourOptions(...values: readonly string[]): readonly string[] {
  const extras = values
    .filter((value) => parseClock(value) !== null && !QUIET_HOUR_OPTIONS.includes(value))
    .filter((value, index, list) => list.indexOf(value) === index);

  if (extras.length === 0) return QUIET_HOUR_OPTIONS;

  return [...QUIET_HOUR_OPTIONS, ...extras].sort(
    (left, right) => (parseClock(left) ?? 0) - (parseClock(right) ?? 0),
  );
}

export type QuietTimeZoneOption = {
  /** IANA kimliği — sunucuya giden değer. Ofset **değil** (yılda iki kez kayardı). */
  readonly id: string;
  /** Ağaçtaki seçenek anahtarı; listeye sonradan giren gerçek zaman dilimi kendi adını taşır. */
  readonly labelKey: string;
};

/** Ağaçtaki `nq4` seçenekleri — etiket sözlükten, kimlik buradan. */
export const QUIET_TIME_ZONE_BASE_OPTIONS: readonly QuietTimeZoneOption[] = [
  { id: "Europe/Istanbul", labelKey: "settings.option.nq4.1" },
  { id: "Europe/London", labelKey: "settings.option.nq4.2" },
  { id: "America/New_York", labelKey: "settings.option.nq4.3" },
];

/**
 * Hesabın zaman dilimi üç seçeneğin dışındaysa listeye eklenir.
 *
 * Aksi hâlde `Asia/Tokyo` kullanan bir hesap menüde `Europe/Istanbul` seçili görürdü ve menüye
 * dokunmadan kaydeden ilk hareket sessiz saatlerini dokuz saat kaydırırdı.
 */
export function resolveQuietTimeZoneOptions(timeZone: string): readonly QuietTimeZoneOption[] {
  if (!timeZone || QUIET_TIME_ZONE_BASE_OPTIONS.some((option) => option.id === timeZone)) {
    return QUIET_TIME_ZONE_BASE_OPTIONS;
  }

  return [...QUIET_TIME_ZONE_BASE_OPTIONS, { id: timeZone, labelKey: timeZone }];
}

function indexOfOrZero<T>(list: readonly T[], value: T): number {
  const index = list.indexOf(value);

  return index === -1 ? 0 : index;
}

export type SettingsValuesContext = {
  readonly quietHourOptions: readonly string[];
  readonly quietTimeZoneOptions: readonly QuietTimeZoneOption[];
};

export function buildValuesContext(prefs: NotificationPrefs): SettingsValuesContext {
  return {
    quietHourOptions: resolveQuietHourOptions(prefs.quietHours.start, prefs.quietHours.end),
    quietTimeZoneOptions: resolveQuietTimeZoneOptions(prefs.quietHours.tz),
  };
}

/** Uçtan gelen tam nesne → satır motorunun düz sözlüğü. */
export function toSettingsValues(
  prefs: NotificationPrefs,
  context: SettingsValuesContext = buildValuesContext(prefs),
): SettingsPatch {
  const values: SettingsPatch = {
    b1: indexOfOrZero(NOTIF_LEVEL_BY_INDEX, prefs.level),

    na1: prefs.surfaces.inAppToast,
    na2: prefs.surfaces.systemWhileOpen,
    na3: prefs.surfaces.badge,
    na6: prefs.systemPreview,

    nd1: prefs.delivery.inApp,
    nd2: indexOfOrZero(SYSTEM_NOTIF_MODE_BY_INDEX, prefs.delivery.system),
    nd3: prefs.delivery.push,
    nd4: prefs.delivery.email,

    nq1: prefs.quietHours.enabled,
    nq2: indexOfOrZero(context.quietHourOptions, prefs.quietHours.start),
    nq3: indexOfOrZero(context.quietHourOptions, prefs.quietHours.end),
    nq4: Math.max(
      0,
      context.quietTimeZoneOptions.findIndex((option) => option.id === prefs.quietHours.tz),
    ),
    nq5: prefs.quietHours.allowCalls,

    np1: indexOfOrZero(PANEL_COUNT_BY_INDEX, prefs.panel.count),
    np2: prefs.panel.autoClose,
    np3: indexOfOrZero(PANEL_DURATION_BY_INDEX, prefs.panel.durationSec),
    np4: prefs.panel.showContent,
    np5: prefs.panel.showSource,

    ne1: indexOfOrZero(MUTE_DURATION_BY_INDEX, prefs.defaultMuteDuration),
  };

  for (const [rowKey, typeKey] of Object.entries(NOTIFICATION_TYPE_ROW_KEYS)) {
    values[rowKey] = prefs.types[typeKey];
  }

  for (const [rowKey, lockedKey] of Object.entries(LOCKED_NOTIFICATION_TYPE_ROW_KEYS)) {
    values[rowKey] = prefs.types[lockedKey];
  }

  for (const [rowKey, soundKey] of Object.entries(NOTIFICATION_SOUND_ROW_KEYS)) {
    const sound = prefs.sounds[soundKey];

    values[rowKey] = sound.enabled;
    values[`${rowKey}${SETTINGS_SOUND_PROFILE_SUFFIX}`] = sound.profile;
    values[`${rowKey}${SETTINGS_SOUND_VOLUME_SUFFIX}`] = sound.volume;
  }

  return values;
}

function asBoolean(value: SettingValue): boolean {
  return value === true;
}

function asIndex(value: SettingValue): number {
  return typeof value === "number" ? value : 0;
}

type MutablePatch = {
  delivery: Record<string, unknown>;
  panel: Record<string, unknown>;
  quietHours: Record<string, unknown>;
  root: Record<string, unknown>;
  sounds: Record<string, Record<string, unknown>>;
  surfaces: Record<string, unknown>;
  types: Record<string, unknown>;
};

function assignDefined(
  bucket: Record<string, unknown>,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined) bucket[key] = value;
}

function soundBucket(patch: MutablePatch, key: NotificationSoundKey): Record<string, unknown> {
  const existing = patch.sounds[key];

  if (existing) return existing;

  const created: Record<string, unknown> = {};
  patch.sounds[key] = created;

  return created;
}

/**
 * Motorun biriktirdiği düz yama → `NotificationPrefsPatch`.
 *
 * Tanımadığı anahtar **sessizce düşer**: bu köprü yalnız Bildirimler bölümünü konuşur ve bir
 * gün başka bir bölüm aynı kutuyu paylaşırsa, onun anahtarını uydurma bir alana yazmaktansa
 * hiç göndermemek doğrudur. Kilitli iki satır da buradan geçmez — motor onları zaten yazmaz,
 * bu ikinci kapı ise sunucudan 400 alacak bir gövdenin hiç kurulmamasını sağlar (tuzak #5).
 */
export function toNotificationPrefsPatch(
  values: SettingsPatch,
  context: SettingsValuesContext,
): NotificationPrefsPatch {
  const patch: MutablePatch = {
    delivery: {},
    panel: {},
    quietHours: {},
    root: {},
    sounds: {},
    surfaces: {},
    types: {},
  };

  for (const [key, value] of Object.entries(values)) {
    if (key in LOCKED_NOTIFICATION_TYPE_ROW_KEYS) continue;

    const typeKey = NOTIFICATION_TYPE_ROW_KEYS[key];

    if (typeKey) {
      patch.types[typeKey] = asBoolean(value);
      continue;
    }

    if (applySoundKey(patch, key, value)) continue;

    switch (key) {
      case "b1":
        patch.root["level"] = NOTIF_LEVEL_BY_INDEX[asIndex(value)] ?? "all";
        break;
      case "na1":
        patch.surfaces["inAppToast"] = asBoolean(value);
        break;
      case "na2":
        patch.surfaces["systemWhileOpen"] = asBoolean(value);
        break;
      case "na3":
        patch.surfaces["badge"] = asBoolean(value);
        break;
      case "na6":
        patch.root["systemPreview"] = asBoolean(value);
        break;
      case "nd1":
        patch.delivery["inApp"] = asBoolean(value);
        break;
      case "nd2":
        patch.delivery["system"] = SYSTEM_NOTIF_MODE_BY_INDEX[asIndex(value)] ?? "all";
        break;
      case "nd3":
        patch.delivery["push"] = asBoolean(value);
        break;
      case "nd4":
        patch.delivery["email"] = asBoolean(value);
        break;
      case "nq1":
        patch.quietHours["enabled"] = asBoolean(value);
        break;
      // Dizin listenin dışına düşerse anahtar yamaya **hiç girmez**: `undefined` göndermek,
      // sunucuya "bu alanı boşalt" demenin bir adım uzağıdır.
      case "nq2":
        assignDefined(patch.quietHours, "start", context.quietHourOptions[asIndex(value)]);
        break;
      case "nq3":
        assignDefined(patch.quietHours, "end", context.quietHourOptions[asIndex(value)]);
        break;
      case "nq4":
        assignDefined(patch.quietHours, "tz", context.quietTimeZoneOptions[asIndex(value)]?.id);
        break;
      case "nq5":
        patch.quietHours["allowCalls"] = asBoolean(value);
        break;
      case "np1":
        patch.panel["count"] = PANEL_COUNT_BY_INDEX[asIndex(value)] ?? 5;
        break;
      case "np2":
        patch.panel["autoClose"] = asBoolean(value);
        break;
      case "np3":
        patch.panel["durationSec"] = PANEL_DURATION_BY_INDEX[asIndex(value)] ?? 10;
        break;
      // Tuzak #4 — `np4` panelin **kendi** kartıdır; `na6` sistem bildiriminin içeriğidir.
      case "np4":
        patch.panel["showContent"] = asBoolean(value);
        break;
      case "np5":
        patch.panel["showSource"] = asBoolean(value);
        break;
      case "ne1":
        patch.root["defaultMuteDuration"] = MUTE_DURATION_BY_INDEX[asIndex(value)] ?? "8h";
        break;
      default:
        break;
    }
  }

  const result: Record<string, unknown> = { ...patch.root };

  if (Object.keys(patch.surfaces).length > 0) result["surfaces"] = patch.surfaces;
  if (Object.keys(patch.delivery).length > 0) result["delivery"] = patch.delivery;
  if (Object.keys(patch.types).length > 0) result["types"] = patch.types;
  if (Object.keys(patch.quietHours).length > 0) result["quietHours"] = patch.quietHours;
  if (Object.keys(patch.sounds).length > 0) result["sounds"] = patch.sounds;
  if (Object.keys(patch.panel).length > 0) result["panel"] = patch.panel;

  return result as NotificationPrefsPatch;
}

function applySoundKey(patch: MutablePatch, key: string, value: SettingValue): boolean {
  for (const [rowKey, soundKey] of Object.entries(NOTIFICATION_SOUND_ROW_KEYS)) {
    if (key === rowKey) {
      soundBucket(patch, soundKey)["enabled"] = asBoolean(value);
      return true;
    }

    if (key === `${rowKey}${SETTINGS_SOUND_PROFILE_SUFFIX}`) {
      soundBucket(patch, soundKey)["profile"] = value === "classic" ? "classic" : "whispr";
      return true;
    }

    if (key === `${rowKey}${SETTINGS_SOUND_VOLUME_SUFFIX}`) {
      soundBucket(patch, soundKey)["volume"] = Math.round(asIndex(value));
      return true;
    }
  }

  return false;
}

/**
 * Motorun `write`'ı ile ucun arasındaki taşıyıcı.
 *
 * Neden bir nesne: yamayı çevirmek için **son** saat ve zaman dilimi listeleri gerekiyor ve
 * `write` bir zamanlayıcıdan çağrılıyor — render'ın kapattığı liste o an bir tur eski olabilir.
 * Listeyi bir React `ref`'inde tutmak, render sırasında okunma şüphesiyle derleyici kuralına
 * takılıyordu; burada liste bir kez kurulan bu nesnenin içinde yaşıyor ve yalnız `setContext`
 * ile değişiyor.
 *
 * Liste henüz yoksa yama **gönderilmez**: sunucudan gelen değerler okunmadan yazmak, kullanıcı
 * hiçbir şeye dokunmadan varsayılanları kaydetmek olurdu.
 */
export class NotificationPrefsWriter {
  private context: SettingsValuesContext | null = null;

  constructor(
    private readonly send: (patch: NotificationPrefsPatch) => Promise<NotificationPrefs>,
    private readonly onResult: (prefs: NotificationPrefs) => void,
  ) {}

  setContext(context: SettingsValuesContext): void {
    this.context = context;
  }

  write = async (values: SettingsPatch): Promise<void> => {
    const context = this.context;

    if (!context) return;

    this.onResult(await this.send(toNotificationPrefsPatch(values, context)));
  };
}

export type SoundRowDefaults = {
  readonly enabled: boolean;
  readonly profile: SoundProfile;
  readonly volume: number;
};

/**
 * `ns5` — `Tüm sesler → Varsayılana döndür`.
 *
 * Varsayılan değerler ağaçtan okunur, burada tekrar yazılmaz: ikinci bir liste, referans
 * değiştiğinde sessizce eskiyen bir liste olurdu. Dört satır tek yamada gider (motor 250 ms
 * içinde birleştirir), yani sunucu dört ayrı yazma görmez.
 */
/**
 * Ağacın taşıdığı ses varsayılanları — `ns1` whispr/60, `ns2` klasik/80, `ns3`/`ns4` whispr/50.
 *
 * Listeyi burada elle yazmak, referans değiştiğinde sessizce eskiyen ikinci bir kopya olurdu.
 * `ns1` iki sekmede birden geçiyor ve iki geçişin de aynı ön ayarı taşıdığı ağaçtan okunur.
 */
export function buildSoundRowDefaults(): Readonly<Record<string, SoundRowDefaults>> {
  const defaults: Record<string, SoundRowDefaults> = {};

  for (const { row } of walkSettingsRows()) {
    if (row.type !== "sound" || !(row.key in NOTIFICATION_SOUND_ROW_KEYS)) continue;

    defaults[row.key] = {
      enabled: row.defaultValue !== false,
      profile: row.sound?.profile ?? "whispr",
      volume: row.sound?.volume ?? 0,
    };
  }

  return defaults;
}

export function buildSoundResetPatch(
  defaults: Readonly<Record<string, SoundRowDefaults>> = buildSoundRowDefaults(),
): SettingsPatch {
  const values: SettingsPatch = {};

  for (const rowKey of Object.keys(NOTIFICATION_SOUND_ROW_KEYS)) {
    const preset = defaults[rowKey];

    if (!preset) continue;

    values[rowKey] = preset.enabled;
    values[`${rowKey}${SETTINGS_SOUND_PROFILE_SUFFIX}`] = preset.profile;
    values[`${rowKey}${SETTINGS_SOUND_VOLUME_SUFFIX}`] = preset.volume;
  }

  return values;
}

/** Ş9 §2 — özet kutusunun paydası: on dört açılabilir tür artı kilitli iki tür. */
export const NOTIFICATION_TYPE_TOTAL =
  Object.keys(NOTIFICATION_TYPE_ROW_KEYS).length + LOCKED_NOTIFICATION_TYPE_KEYS.length;

export const NOTIFICATION_DELIVERY_CHANNEL_TOTAL = 4;

export type NotificationSummaryCounts = {
  readonly channelsOpen: number;
  readonly channelsTotal: number;
  readonly exceptions: number;
  readonly exceptionsTruncated: boolean;
  readonly typesOpen: number;
  readonly typesTotal: number;
};

/**
 * Özet kutusunun üç sayısı — üçü de **gerçek** veriden.
 *
 * Tasarımdaki `9/15` ve `2/4` örnek veridir; payda ürünün kendi sayımından gelir. Kilitli iki
 * tür her zaman açık sayılır çünkü kapatılamıyorlar: onları paydadan düşürmek "16 türden 14'ü
 * açık" diyen bir ekranı "14 türden 14'ü açık" yapardı ve kullanıcı kapattığı iki türü arardı.
 */
export function summarizeNotificationPrefs(
  prefs: NotificationPrefs,
  exceptions: { readonly count: number; readonly truncated: boolean },
): NotificationSummaryCounts {
  const typesOpen =
    Object.values(NOTIFICATION_TYPE_ROW_KEYS).filter((typeKey) => prefs.types[typeKey]).length +
    LOCKED_NOTIFICATION_TYPE_KEYS.length;

  const channelsOpen = [
    prefs.delivery.inApp,
    prefs.delivery.system !== "off",
    prefs.delivery.push,
    prefs.delivery.email,
  ].filter(Boolean).length;

  return {
    channelsOpen,
    channelsTotal: NOTIFICATION_DELIVERY_CHANNEL_TOTAL,
    exceptions: exceptions.count,
    exceptionsTruncated: exceptions.truncated,
    typesOpen,
    typesTotal: NOTIFICATION_TYPE_TOTAL,
  };
}

/** Ses satırlarının anahtar sırası — önizleme çaları ve sıfırlama aynı listeyi okur. */
export const NOTIFICATION_SOUND_ROW_ORDER: readonly string[] = NOTIFICATION_SOUND_KEYS.map(
  (soundKey) =>
    Object.keys(NOTIFICATION_SOUND_ROW_KEYS).find(
      (rowKey) => NOTIFICATION_SOUND_ROW_KEYS[rowKey] === soundKey,
    ) ?? "",
).filter((rowKey) => rowKey.length > 0);
