/**
 * Ş9 · SPEC-SUNUCU §6.4 — kanal bildirimleri penceresinin saf mantığı.
 *
 * Üç radyo seçeneği ve bir anahtar. Seçeneklerin **tonu** SPEC'ten gelir
 * (`primary` / `warning` / `danger`), kimlikleri ise uçtan: `/channels/[channelId]/
 * notification-settings` `all | mentions | muted` konuşuyor ve tasarımın `mute` adı
 * o uçta `muted`. Yeni bir ad üretmek, iki tarafın da bilmediği üçüncü bir sözlük olurdu.
 *
 * "Mobil bildirimleri de sustur" **mock değildir**: `UserChannelSettings.mobilePush`
 * kolonu şemada duruyordu (schema.prisma:1965), yalnız uç onu ne okuyor ne yazıyordu.
 * Ş9 ucu o kolona bağladı; adapter iki tarafın ters yönlerini burada çeviriyor —
 * kolon "mobil push açık mı", anahtar "mobili de sustur mu".
 */

export type ChannelNotificationLevel = "all" | "mentions" | "muted";

export type ChannelNotificationTone = "primary" | "warning" | "danger";

export type ChannelNotificationOption = {
  readonly descriptionKey: string;
  readonly id: ChannelNotificationLevel;
  readonly titleKey: string;
  readonly tone: ChannelNotificationTone;
};

/** §6.4 — sıra ve tonlar SPEC'te sabit; ikon tonu seçili değilken `text-muted`'a düşer. */
export const CHANNEL_NOTIFICATION_OPTIONS: readonly ChannelNotificationOption[] = [
  {
    descriptionKey: "server.modal.notifications.all.description",
    id: "all",
    titleKey: "server.modal.notifications.all.title",
    tone: "primary",
  },
  {
    descriptionKey: "server.modal.notifications.mentions.description",
    id: "mentions",
    titleKey: "server.modal.notifications.mentions.title",
    tone: "warning",
  },
  {
    descriptionKey: "server.modal.notifications.muted.description",
    id: "muted",
    titleKey: "server.modal.notifications.muted.title",
    tone: "danger",
  },
];

export type ChannelNotificationDraft = {
  readonly level: ChannelNotificationLevel;
  /** Anahtarın kendisi: **açık = mobil de sussun**. Kolonun tersi (bkz. dosya başlığı). */
  readonly muteMobile: boolean;
};

/**
 * `Sessiz` seçiliyken anahtar **açık** gelir (§6.4). Kural bir varsayılan, bir kilit değil:
 * kullanıcı seçimden sonra anahtarı tek başına kapatabilir.
 */
export function defaultMuteMobileForLevel(level: ChannelNotificationLevel): boolean {
  return level === "muted";
}

/** Uçtan gelen kayıt → pencere taslağı. */
export function toChannelNotificationDraft(settings: {
  readonly level: ChannelNotificationLevel;
  readonly mobilePush: boolean;
}): ChannelNotificationDraft {
  return { level: settings.level, muteMobile: !settings.mobilePush };
}

/** Pencere taslağı → `PATCH` gövdesi. */
export function toChannelNotificationPayload(draft: ChannelNotificationDraft): {
  readonly level: ChannelNotificationLevel;
  readonly mobilePush: boolean;
} {
  return { level: draft.level, mobilePush: !draft.muteMobile };
}

/**
 * Radyo seçimi. Seviye değişince anahtar o seviyenin varsayılanına döner — SPEC'in
 * "`Sessiz` seçiliyken açık gelir" cümlesi ancak seçim anında uygulanırsa doğru olur.
 */
export function selectChannelNotificationLevel(
  draft: ChannelNotificationDraft,
  level: ChannelNotificationLevel,
): ChannelNotificationDraft {
  if (draft.level === level) {
    return draft;
  }

  return { level, muteMobile: defaultMuteMobileForLevel(level) };
}

export function toggleChannelNotificationMobileMute(
  draft: ChannelNotificationDraft,
): ChannelNotificationDraft {
  return { ...draft, muteMobile: !draft.muteMobile };
}

/** Kaydet düğmesi yalnız gerçekten bir değişiklik varken iş yapar. */
export function hasChannelNotificationChange(
  initial: ChannelNotificationDraft,
  draft: ChannelNotificationDraft,
): boolean {
  return initial.level !== draft.level || initial.muteMobile !== draft.muteMobile;
}

/**
 * `role="radiogroup"` ok tuşu gezinmesi (00 §8). Liste sarmalıdır: sondaki `Sessiz`ten
 * aşağı basınca başa döner, klavye kullanıcısı listede kilitlenmez.
 */
export function stepChannelNotificationLevel(
  level: ChannelNotificationLevel,
  direction: 1 | -1,
): ChannelNotificationLevel {
  const index = CHANNEL_NOTIFICATION_OPTIONS.findIndex((option) => option.id === level);
  const size = CHANNEL_NOTIFICATION_OPTIONS.length;
  const next = ((((index < 0 ? 0 : index) + direction) % size) + size) % size;

  return CHANNEL_NOTIFICATION_OPTIONS[next]!.id;
}
