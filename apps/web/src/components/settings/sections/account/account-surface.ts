"use client";

import {
  PRESENCE_IDLE_TIMEOUT_OPTIONS,
  DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES,
} from "@/hooks/use-presence-activity";
import type { AccountSettingsState } from "@/lib/account/actions";
import type { SettingsPatch } from "@/lib/settings/use-setting-value";

/**
 * Hesabım bölümünün **tipli adapteri** — Ş7.
 *
 * Satır motoru anahtar/değer konuşur (`pn`, `g1`, `l3`…); sunucu kolon adı konuşur
 * (`displayName`, `profileVisibility`, `dateFormat`…). Çeviri burada, **tek** yerde durur:
 * altı sekme dosyasının her biri kendi eşlemesini yazsaydı, aynı anahtarın iki farklı uca
 * gitmesi an meselesiydi.
 *
 * Karşılığı olmayan alan **uydurma uç çağırmaz** (00 §6): eşleme onu döndürmez, çağıran
 * `TODO(api):` notuyla birlikte yerinde bırakır. Bugün karşılıksız olanlar:
 *
 * - `pz` (Zamirler) · `pbio` (Biyografi) · `ps` / `pe` / `px` (özel durum): web'de yazma ucu yok;
 *   `updateAccountSettingsAction` yalnız görünen ad, kullanıcı adı, e-posta ve durumu alıyor.
 *   `updateAccountProfile` servisi alanların hepsini tanıyor, ama onu çağıran **web** ucu
 *   yalnız mobilde var (`/api/v1/mobile/account/profile`).
 * - `bannerUrl` (Banner değiştir / kaldır): web'de yükleme yolu yok.
 * - `usernameChangedAt` (30 günlük bekleme): hiçbir web okuma yolu döndürmüyor.
 * - Hesap satırlarının okunması (`getAccountSettingsRows`): servis var, **uç yok**.
 */

/** Referanstaki `g1` / `g2` seçenek sırası: Herkes · Arkadaşlar · Hiç kimse. */
export const VISIBILITY_BY_INDEX = ["EVERYONE", "FRIENDS", "NOBODY"] as const;

/** `g3` — Herkes · Arkadaşlar · Ortak sunucular · Hiç kimse. */
export const DM_POLICY_BY_INDEX = ["EVERYONE", "FRIENDS", "MUTUAL_SERVERS", "NOBODY"] as const;

/** `g4` — Herkes · Ortak sunucular · Ortak arkadaşlar · Hiç kimse. */
export const FRIEND_REQUEST_POLICY_BY_INDEX = [
  "EVERYONE",
  "MUTUAL_SERVERS",
  "MUTUAL_FRIENDS",
  "NOBODY",
] as const;

/** `l1` — Türkçe · English. */
export const LOCALE_BY_INDEX = ["tr", "en"] as const;

/**
 * `l2` — Otomatik · Europe/London · America/New_York · Asia/Tokyo.
 *
 * Ağaç dört seçenek taşıyor, kolon ise herhangi bir IANA kimliğini kabul ediyor
 * (`TimeZonePreferenceSchema`). Listede olmayan bir kimlik kayıtlıysa menü `Otomatik`'e
 * düşmez — `indexOf` -1 döner ve çağıran sıfırıncı seçeneği çizer; yazma ise ancak kullanıcı
 * bir seçenek seçtiğinde olur, yani kayıtlı kimlik kendiliğinden ezilmez.
 */
export const TIME_ZONE_BY_INDEX = [
  "AUTO",
  "Europe/London",
  "America/New_York",
  "Asia/Tokyo",
] as const;

/** `l3` — Sistem · GG/AA/YYYY · AA/GG/YYYY · YYYY/AA/GG. */
export const DATE_FORMAT_BY_INDEX = ["LOCALE", "DMY", "MDY", "YMD"] as const;

/** `l4` — Sistem · 12 saat · 24 saat. */
export const TIME_FORMAT_BY_INDEX = ["LOCALE", "H12", "H24"] as const;

/** `pp` — Çevrimiçi · Boşta · Rahatsız Etmeyin · Görünmez. */
export const PRESENCE_BY_INDEX = ["ONLINE", "IDLE", "DND", "INVISIBLE"] as const;

/** K9 — `g9` seçenekleri, `PRESENCE_IDLE_TIMEOUT_OPTIONS` sırasıyla (5 · 10 · 15 · 30 · 60 dk). */
export const IDLE_TIMEOUT_BY_INDEX = PRESENCE_IDLE_TIMEOUT_OPTIONS;

export function indexOf<T extends string | number>(
  values: readonly T[],
  value: T | null | undefined,
  fallback = 0,
): number {
  const found = value === null || value === undefined ? -1 : values.indexOf(value);
  return found === -1 ? fallback : found;
}

/**
 * Satır anahtarlarından `PATCH /api/v1/users/me/settings` gövdesine.
 *
 * Dönen nesne **yalnız** ucun tanıdığı alanları taşır; tanımadığı bir anahtar sessizce düşer ve
 * çağıran `unmapped` listesinden hangi anahtarların yazılamadığını öğrenir. Sessiz düşürme
 * kaydediliyor→kaydedildi göstergesini yalancı yapardı (tuzak #14).
 */
export type SettingsWriteSplit = {
  readonly layout: Record<string, unknown>;
  /** `l1` — dil sunucu ayarı değil, `updateLocalePreferenceAction`'ın işi. */
  readonly localeIndex: number | null;
  /** K9 — boşta sayılma süresi tarayıcı tercihidir. */
  readonly localMinutes: number | null;
  readonly unmapped: readonly string[];
};

export function splitAccountPatch(patch: SettingsPatch): SettingsWriteSplit {
  const layout: Record<string, unknown> = {};
  const unmapped: string[] = [];
  let localMinutes: number | null = null;
  let localeIndex: number | null = null;

  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "g1":
        layout.profileVisibility = VISIBILITY_BY_INDEX[Number(value)] ?? VISIBILITY_BY_INDEX[0];
        break;
      case "g2":
        layout.presenceVisibility = VISIBILITY_BY_INDEX[Number(value)] ?? VISIBILITY_BY_INDEX[0];
        break;
      case "g3":
        layout.dmPolicy = DM_POLICY_BY_INDEX[Number(value)] ?? DM_POLICY_BY_INDEX[0];
        break;
      case "g4":
        layout.friendRequestPolicy =
          FRIEND_REQUEST_POLICY_BY_INDEX[Number(value)] ?? FRIEND_REQUEST_POLICY_BY_INDEX[0];
        break;
      case "g5":
        layout.allowGroupInvites = Boolean(value);
        break;
      case "l1":
        localeIndex = Number(value);
        break;
      case "l2":
        layout.timeZone = TIME_ZONE_BY_INDEX[Number(value)] ?? TIME_ZONE_BY_INDEX[0];
        break;
      case "l3":
        layout.dateFormat = DATE_FORMAT_BY_INDEX[Number(value)] ?? DATE_FORMAT_BY_INDEX[0];
        break;
      case "l4":
        layout.timeFormat = TIME_FORMAT_BY_INDEX[Number(value)] ?? TIME_FORMAT_BY_INDEX[0];
        break;
      case "g9":
        // K9 — `UserSettings.idleTimeoutMinutes`e gider, ama bu eşlemenin `layout` yamasından
        // değil: yazmayı `usePresenceIdleTimeoutPreference` yapıyor ve kendi iyimser önbellek
        // güncellemesini de o taşıyor. Buradan ayrı bir alan olarak geçer ki iki yazma aynı
        // `PATCH` gövdesinde çakışmasın.
        localMinutes =
          IDLE_TIMEOUT_BY_INDEX[Number(value)] ?? DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES;
        break;
      default:
        // TODO(api): `pz` `pbio` `ps` `pe` `px` (profil alanları), `g6` (okundu bilgisi),
        // `g7` (oynanan oyun), `g8` (hassas içerik) — ya web ucu yok ya da `PatchSettingsSchema`
        // bu alanı tanımıyor. Uydurma uç çağrılmaz.
        unmapped.push(key);
        break;
    }
  }

  return { layout, localeIndex, localMinutes, unmapped };
}

/** Kirli profil alanlarının `updateAccountSettingsAction` gövdesine indirgenmesi. */
export function toAccountSettingsPayload(
  account: AccountSettingsState,
  draft: {
    displayName?: string | undefined;
    presenceIndex?: number | undefined;
    username?: string | undefined;
  },
): AccountSettingsState {
  return {
    ...account,
    displayName: draft.displayName?.trim() ? draft.displayName.trim() : account.displayName,
    status:
      draft.presenceIndex === undefined
        ? account.status
        : ((PRESENCE_BY_INDEX[draft.presenceIndex] ??
            account.status) as AccountSettingsState["status"]),
    username: draft.username?.trim() ? draft.username.trim() : account.username,
  };
}
