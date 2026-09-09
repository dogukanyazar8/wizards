/**
 * Sunucu oluşturma penceresinin (SPEC-SUNUCU §7, 940) saf modeli.
 *
 * Pencere üç yüzeye aynı anda bakar: sol form, sağdaki üç önizleme kartı ve ayaktaki özet
 * satırı. `Sunucu.dc.html` bunları tek bir türetme bloğundan besler (satır 2202–2400) ve
 * **ayrı state tutmaz** (Ş10 §2). Aynı kural burada da geçerli: form durumundan türeyen her
 * değer bu dosyadaki saf fonksiyonlardan çıkar, bileşen yalnız çizer.
 *
 * Metin **yok**: etiketler i18n anahtarlarından, renkler token'lardan gelir. Bu dosya yalnız
 * "hangi seçenek", "hangi değer", "hangi ton" sorularını cevaplar.
 */

import type { ServerIconTone } from "@wizards/types";
import {
  deriveServerAbbreviation,
  isServerAbbreviation,
} from "@/lib/servers/server-icon-presentation";

/** §7.4 `ERİŞİM` radyosunun üç seçeneği; ürün sözleşmesindeki iki boole'nin insan adı. */
export type CreateServerAccess = "private" | "public" | "discover";

export const CREATE_SERVER_ACCESS_OPTIONS: readonly CreateServerAccess[] = [
  "public",
  "private",
  "discover",
];

/** §7.4 varsayılanı: `Keşfet'te listelensin`. */
export const CREATE_SERVER_DEFAULT_ACCESS: CreateServerAccess = "discover";

export type CreateServerVisibility = {
  discoverable: boolean;
  isPublic: boolean;
};

/**
 * Radyo → sözleşme. Üç kombinasyon `CreateServerSchema`'nın iki boole'sine birebir oturur;
 * dördüncü kombinasyon (`isPublic:false` + `discoverable:true`) tasarımda yok ve servis onu
 * zaten `discoverable:false`'a indirir.
 */
export function resolveCreateServerVisibility(access: CreateServerAccess): CreateServerVisibility {
  return {
    discoverable: access === "discover",
    isPublic: access !== "private",
  };
}

/** Önizleme rozetinin tonu — §7 "Özel gri / Herkese açık success / Keşfet'te primary". */
export function resolveCreateServerBadgeTone(
  access: CreateServerAccess,
): "success" | "primary" | null {
  if (access === "private") {
    return null;
  }

  return access === "public" ? "success" : "primary";
}

/**
 * Rozetin, özet satırının ve ayak notunun **aynı** metni yazdığı tek anahtar
 * (`Özel` · `Herkese açık` · `Keşfet'te`). Radyodaki başlık bundan ayrıdır: radyo
 * `Keşfet'te listelensin` yazar, rozet `Keşfet'te`.
 */
export function createServerAccessLabelKey(access: CreateServerAccess): string {
  return `server.create.badge.${access}`;
}

/**
 * Kısa adın otomatik türetmesi — yeni zorunlu üç karakter sözleşmesiyle uyumlu görsel
 * fallback. `Array.from` BMP dışı karakterleri yarım vekile bölmeden keser.
 */
export function deriveCreateServerShortName(name: string): string {
  return deriveServerAbbreviation(name);
}

/** Rayda ve üç önizleme kartında görünen kısa ad: kullanıcı yazdıysa o, yazmadıysa türetme. */
export function resolveCreateServerShortNameView(shortName: string, name: string): string {
  return (shortName || deriveCreateServerShortName(name)).toLocaleUpperCase("tr-TR");
}

export function isCreateServerShortNameValid(shortName: string): boolean {
  return isServerAbbreviation(shortName);
}

/** §7 ayak kuralı: ad iki karakterden kısayken düğme pasif, not `warning`. */
export function isCreateServerNameValid(name: string): boolean {
  return name.trim().length >= 2;
}

/** §7.7 ilk çip grubu — `2B · 250 · 40.000`. Değerler `Server.messageCharacterLimit` kolonudur. */
export const CREATE_SERVER_MESSAGE_LIMITS = [2000, 250, 40000] as const;

/** `2B` = kolonun varsayılanı; SPEC §8.3 de aynı varsayılanı verir. */
export const CREATE_SERVER_DEFAULT_MESSAGE_LIMIT = 2000;

/**
 * §7.7 ikinci çip grubu — `5 · 15 · 30 · 60 dakika · 3 · 6 · 24 saat`, dakika cinsinden.
 *
 * **Sapma notu:** SPEC §8.3 (ayarlar bölümü) dördüncü seçeneği `1 saat` yazar, oluşturma
 * penceresi ise `60 dakika`. Değer aynı (60), etiket farklı; oluşturma penceresi kendi
 * yüzeyinin etiketini kullanır (`Sunucu.dc.html` satır 2387).
 */
export const CREATE_SERVER_DELETED_NOTICE_MINUTES = [5, 15, 30, 60, 180, 360, 1440] as const;

/**
 * `Sunucu.dc.html` satır 1840 başlangıç durumu `csDel: '60 dakika'` verir ve kapalı
 * `Gelişmiş` satırının özeti `2B karakter · silinme bildirimi 60 dakika`'dır.
 *
 * **K7 ile ilişkisi:** karar "DB varsayılanı 60 kalır, SPEC'in 15'i yeni sunucuya uygulanır"
 * der; ama SPEC'in 15'i §8.3'ün (ayarlar) varsayılanıdır, §7'nin değil. Oluşturma
 * penceresinin tasarımı 60 gösteriyor ve otorite sırası HTML'i üstte tutuyor. 60 seçmek aynı
 * zamanda kolonun varsayılanıyla örtüşür — yani hiçbir yeni sunucu bu yüzden alan
 * göndermek zorunda kalmaz.
 */
export const CREATE_SERVER_DEFAULT_DELETED_NOTICE_MINUTES = 60;

export type CreateServerFormState = {
  access: CreateServerAccess;
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
  deletedMessageNoticeMinutes: number;
  description: string;
  iconColor: ServerIconTone | null;
  iconUrl: string | null;
  messageCharacterLimit: number;
  name: string;
  shortName: string;
  tags: readonly string[];
};

/** §7.6 üç anahtarın üçü de **açık** doğar. */
export const CREATE_SERVER_INITIAL_STATE: CreateServerFormState = {
  access: CREATE_SERVER_DEFAULT_ACCESS,
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  deletedMessageNoticeMinutes: CREATE_SERVER_DEFAULT_DELETED_NOTICE_MINUTES,
  description: "",
  iconColor: null,
  iconUrl: null,
  messageCharacterLimit: CREATE_SERVER_DEFAULT_MESSAGE_LIMIT,
  name: "",
  shortName: "",
  tags: [],
};

/**
 * Kapanış onayı yalnız kullanıcının başlangıç değerlerinden saptığı durumda açılır. Nesne
 * kimliği kullanılmaz: kullanıcı bir alanı değiştirip geri aldığında form yeniden temizdir.
 */
export function isCreateServerDirty(state: CreateServerFormState): boolean {
  const initial = CREATE_SERVER_INITIAL_STATE;

  return (
    state.access !== initial.access ||
    state.allowFileUploads !== initial.allowFileUploads ||
    state.allowGifs !== initial.allowGifs ||
    state.allowMemberAdds !== initial.allowMemberAdds ||
    state.deletedMessageNoticeMinutes !== initial.deletedMessageNoticeMinutes ||
    state.description !== initial.description ||
    state.iconColor !== initial.iconColor ||
    state.iconUrl !== initial.iconUrl ||
    state.messageCharacterLimit !== initial.messageCharacterLimit ||
    state.name !== initial.name ||
    state.shortName !== initial.shortName ||
    state.tags.length !== initial.tags.length ||
    state.tags.some((tag, index) => tag !== initial.tags[index])
  );
}

/** Seçilen ikon henüz URL'ye dönüşmediyse de kapatmak kullanıcının çalışmasını kaybettirir. */
export function shouldConfirmCreateServerClose(
  state: CreateServerFormState,
  isUploading: boolean,
): boolean {
  return isUploading || isCreateServerDirty(state);
}

/** Özet kartındaki `Medya` satırının dört hâli — §7 önizleme kolonu. */
export type CreateServerMediaSummary = "both" | "gifs" | "files" | "none";

export function resolveCreateServerMediaSummary(state: {
  allowFileUploads: boolean;
  allowGifs: boolean;
}): CreateServerMediaSummary {
  if (state.allowGifs && state.allowFileUploads) {
    return "both";
  }

  if (state.allowGifs) {
    return "gifs";
  }

  return state.allowFileUploads ? "files" : "none";
}

/** §7.5 — Keşif etiketleri bloğu yalnız `Keşfet'te listelensin` seçiliyken tam opak. */
export function isDiscoveryTagBlockActive(access: CreateServerAccess): boolean {
  return access === "discover";
}

export type CreateServerFooterNote =
  | { readonly kind: "warning" }
  | {
      readonly accessLabelKey: string;
      readonly kind: "summary";
      readonly name: string;
      readonly shortName: string;
    };

/**
 * §7 ayak notu: ad ve üç karakterlik kısa ad geçerliyken `KISA AD · Ad · Erişim`,
 * ikisinden biri geçersizken warning.
 *
 * Metin değil **parça** döner: birleştirme i18n şablonunda yapılır, yoksa ayraç noktası
 * koda gömülür ve İngilizce sürümde değiştirilemez.
 */
export function selectCreateServerFooterNote(state: CreateServerFormState): CreateServerFooterNote {
  if (!isCreateServerNameValid(state.name) || !isCreateServerShortNameValid(state.shortName)) {
    return { kind: "warning" };
  }

  return {
    accessLabelKey: createServerAccessLabelKey(state.access),
    kind: "summary",
    name: state.name.trim(),
    shortName: resolveCreateServerShortNameView(state.shortName, state.name),
  };
}

/**
 * Sayaç `%85`'i geçince `warning` rengine döner (00 §6, `modal.counterWarnRatio`). Oran
 * sözlükten gelir, buraya sabit yazılmaz.
 */
export function isCounterWarning(length: number, max: number, ratio: number): boolean {
  return length >= max * ratio;
}

export type CreateServerRequestBody = {
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
  deletedMessageNoticeMinutes: number;
  description: string | null;
  discoverable: boolean;
  iconColor?: ServerIconTone;
  iconUrl: string | null;
  isPublic: boolean;
  messageCharacterLimit: number;
  name: string;
  shortName: string;
  tags: string[];
};

/**
 * Form durumundan `POST /api/v1/servers` gövdesi.
 *
 * `iconColor` seçilmediyse hiç gönderilmez; `shortName` ise sözleşme gereği tam üç
 * karakter olarak her zaman gönderilir.
 *
 * `tags` yalnız `Keşfet'te listelensin` seçiliyken gider: blok soluklaşmışken seçili kalmış
 * etiketleri yazmak, kullanıcının kapattığı bir listelemeyi sessizce beslerdi.
 */
export function buildCreateServerBody(state: CreateServerFormState): CreateServerRequestBody {
  const visibility = resolveCreateServerVisibility(state.access);
  const trimmedShortName = state.shortName.trim().toLocaleUpperCase("tr-TR");

  return {
    allowFileUploads: state.allowFileUploads,
    allowGifs: state.allowGifs,
    allowMemberAdds: state.allowMemberAdds,
    deletedMessageNoticeMinutes: state.deletedMessageNoticeMinutes,
    description: state.description.trim() || null,
    discoverable: visibility.discoverable,
    ...(state.iconColor === null ? {} : { iconColor: state.iconColor }),
    iconUrl: state.iconUrl,
    isPublic: visibility.isPublic,
    messageCharacterLimit: state.messageCharacterLimit,
    name: state.name.trim(),
    shortName: trimmedShortName,
    tags: isDiscoveryTagBlockActive(state.access) ? [...state.tags] : [],
  };
}
