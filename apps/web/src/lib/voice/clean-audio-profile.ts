import type { VoiceAudioPreferences } from "@/store/voice-store";

/**
 * `Temiz ses profili` ↔ beş filtre anahtarının **tek** ilişki tanımı — Ş8 §A.2.
 *
 * Referans profili bağımsız bir anahtar gibi çiziyor (`p1`), ama ürün karşılığı bir anahtar
 * değil bir **türev**: profil "beş filtre önerilen kümede mi?" sorusunun cevabıdır. İkinci bir
 * boolean tutulsaydı iki durum ayrışırdı — kullanıcı `Gürültü bastırma`yı kapatır, profil hâlâ
 * açık görünürdü. Bu yüzden profil hiçbir yerde saklanmaz; `isCleanAudioProfileActive` ile
 * okunur ve kullanıcı bir filtreye dokunduğu anda **kendiliğinden** kapanır.
 */

/** Profilin yönettiği beş alan — referans `p2`…`p6` satırları, bu sırayla. */
export const CLEAN_AUDIO_PROFILE_FILTERS = [
  "noiseSuppression",
  "voiceIsolation",
  "echoCancellation",
  "autoGainControl",
  "krispNoiseCancellation",
] as const satisfies readonly (keyof VoiceAudioPreferences)[];

export type CleanAudioProfileFilter = (typeof CLEAN_AUDIO_PROFILE_FILTERS)[number];

/**
 * Önerilen küme — referansın açılış değerleri (`p2`…`p6` = `1,1,1,0,1`).
 *
 * `autoGainControl` bilerek **kapalı**: otomatik kazanç gürültü bastırmanın sustuğu boşlukları
 * yükselterek geri getirir, yani temiz ses profilinin amacıyla çelişir.
 */
export const CLEAN_AUDIO_PROFILE_PRESET: Readonly<Record<CleanAudioProfileFilter, boolean>> = {
  autoGainControl: false,
  echoCancellation: true,
  krispNoiseCancellation: true,
  noiseSuppression: true,
  voiceIsolation: true,
};

export function isCleanAudioProfileActive(
  preferences: Pick<VoiceAudioPreferences, CleanAudioProfileFilter>,
): boolean {
  return CLEAN_AUDIO_PROFILE_FILTERS.every(
    (filter) => preferences[filter] === CLEAN_AUDIO_PROFILE_PRESET[filter],
  );
}

/**
 * Profil anahtarının **açılışı**. Kapatma diye bir şey yok: profil bir türev olduğu için
 * "kapat" ancak bir filtreyi önerilenden ayırmakla olur ve o kararı kullanıcı verir.
 * Anahtarı açıkken tekrar kapatmaya çalışmak bu yüzden bir işlem değil, bir soru — kapatma
 * isteği geldiğinde tercihler **olduğu gibi** döner ve çağıran hiçbir şey yazmaz.
 */
export function applyCleanAudioProfile<
  Preferences extends Record<CleanAudioProfileFilter, boolean>,
>(preferences: Preferences, enabled: boolean): Preferences {
  if (!enabled) {
    return preferences;
  }

  return { ...preferences, ...CLEAN_AUDIO_PROFILE_PRESET };
}

/** Profil açıkken önerilenden **sapan** alanların adı; durum satırı ve testler bunu okur. */
export function listCleanAudioProfileDrift(
  preferences: Pick<VoiceAudioPreferences, CleanAudioProfileFilter>,
): readonly CleanAudioProfileFilter[] {
  return CLEAN_AUDIO_PROFILE_FILTERS.filter(
    (filter) => preferences[filter] !== CLEAN_AUDIO_PROFILE_PRESET[filter],
  );
}
