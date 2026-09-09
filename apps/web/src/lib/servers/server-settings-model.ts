import type { WorkspaceServerDetail } from "@wizards/types";

/**
 * Sunucu ayarlarının **saf** kararları — SPEC-SUNUCU §8, §8.1–§8.3.
 *
 * Kabuk 262 px'lik menüyü, başlığı ve dokuz bölümü çiziyor; hangi bölümün hangi sayıyı
 * taşıdığı, görünürlük rozetinin ne yazacağı ve `Keşfet'te listele` kapısının nasıl
 * çalıştığı ise karar. Kararlar JSX'in içinde kalsaydı yalnız tarayıcıda doğrulanabilirlerdi;
 * oysa üçü de kabul kriterinde adı geçen kurallar (00 §6, K12, PROMPT §4).
 *
 * Metin **üretilmez**: her bölüm bir kimlik döner, cümleyi çağıran `t()` ile kurar (00 §7).
 */

export type ServerSettingsSectionId =
  | "channels"
  | "content"
  | "danger"
  | "events"
  | "general"
  | "invites"
  | "members"
  | "roles"
  | "visibility";

/** Menü satırının sağındaki sayının kaynağı. `null` = sayı çipi hiç çizilmez (SPEC §8). */
export type ServerSettingsSectionCount =
  "channels" | "events" | "invites" | "members" | "none" | "roles";

export type ServerSettingsSection = {
  readonly count: ServerSettingsSectionCount;
  readonly id: ServerSettingsSectionId;
  /** `Tehlike bölgesi` her zaman danger renginde; seçiliyken `danger/.12` zemin. */
  readonly danger: boolean;
  /** PROMPT §4: yetkisi olmayana **hiç render edilmez**, pasifleştirilmez. */
  readonly ownerOnly: boolean;
};

/** SPEC §8'in dokuz satırı, referanstaki sırayla (`Sunucu.dc.html` → `SET_NAV`). */
export const SERVER_SETTINGS_SECTIONS: readonly ServerSettingsSection[] = [
  { count: "none", danger: false, id: "general", ownerOnly: false },
  { count: "none", danger: false, id: "visibility", ownerOnly: false },
  { count: "none", danger: false, id: "content", ownerOnly: false },
  { count: "channels", danger: false, id: "channels", ownerOnly: false },
  { count: "roles", danger: false, id: "roles", ownerOnly: false },
  { count: "members", danger: false, id: "members", ownerOnly: false },
  { count: "invites", danger: false, id: "invites", ownerOnly: false },
  { count: "events", danger: false, id: "events", ownerOnly: false },
  { count: "none", danger: true, id: "danger", ownerOnly: true },
];

export const DEFAULT_SERVER_SETTINGS_SECTION: ServerSettingsSectionId = "general";

/**
 * Menüde gerçekten çizilecek satırlar. Sahip olmayan yöneticiye `Tehlike bölgesi` satırı
 * **yok**: pasif bir satır "yetkim yok ama bir yerde duruyor" der, oysa 00 §5 render
 * edilmemesini istiyor.
 */
export function selectServerSettingsSections(isOwner: boolean): readonly ServerSettingsSection[] {
  return isOwner
    ? SERVER_SETTINGS_SECTIONS
    : SERVER_SETTINGS_SECTIONS.filter((section) => !section.ownerOnly);
}

/**
 * Açık bölüm hâlâ görünür mü? Sahip olmayan biri `danger`'a düşemez; düşerse başlık çubuğu
 * menüde karşılığı olmayan bir bölüm adı yazardı.
 */
export function resolveVisibleSection(
  section: ServerSettingsSectionId,
  isOwner: boolean,
): ServerSettingsSectionId {
  const visible = selectServerSettingsSections(isOwner);

  return visible.some((item) => item.id === section) ? section : DEFAULT_SERVER_SETTINGS_SECTION;
}

/**
 * K12 — kenar çubuğundaki sayaçla ayarların sayacı **tek kaynaktan** beslenir.
 *
 * Üye sayısı `detail.members.length` değil `server.memberCount`: üye listesi sayfalıdır
 * (100'de kesilir) ve ray da `memberCount` okur; iki sayaç iki ayrı gerçek üretirdi.
 * Etkinlik sayısı ise `detail`'de yok, ayrı uçtan gelir — bu yüzden dışarıdan verilir ve
 * daha yüklenmediyse `null` kalır (çip çizilmez, `0` **yazılmaz**).
 */
export function resolveServerSettingsCounts(
  detail: WorkspaceServerDetail,
  eventCount: number | null,
): Record<ServerSettingsSectionCount, number | null> {
  const categoryChannels = detail.categories.reduce(
    (total, category) => total + category.channels.length,
    0,
  );

  return {
    channels: categoryChannels + detail.ungroupedChannels.length,
    events: eventCount,
    invites: detail.invites.length,
    members: detail.server.memberCount,
    none: null,
    roles: detail.roles.length,
  };
}

export type ServerVisibilityBadge = "discoverable" | "private" | "public";

/**
 * Sol kolondaki sunucu kartının ve §8.1 önizlemesinin rozeti.
 * `Sunucu.dc.html:2456` — `disc ? 'Keşfet'te' : (pub ? 'Herkese açık' : 'Özel')`.
 */
export function resolveServerVisibilityBadge(state: {
  discoverable: boolean;
  isPublic: boolean;
}): ServerVisibilityBadge {
  if (state.discoverable) {
    return "discoverable";
  }

  return state.isPublic ? "public" : "private";
}

export type ServerVisibilityState = {
  discoverable: boolean;
  isPublic: boolean;
};

/**
 * 00 §6'nın iki cümlesi **tek** fonksiyonda:
 *
 * > `Keşfet'te listele`, sunucu herkese açık olmadan açılamaz; herkese açık kapatılırsa
 * > listeleme de kapanır.
 *
 * Kural burada olmak zorunda: iyimser güncelleme (yerel taslak) ile sunucuya giden gövde
 * ayrı ayrı hesaplanırsa, ekranda kapanan anahtar veritabanında açık kalır. Çağıran hem
 * taslağı hem gövdeyi bunun çıktısından kurar.
 */
export function applyServerVisibilityPatch(
  current: ServerVisibilityState,
  patch: Partial<ServerVisibilityState>,
): ServerVisibilityState {
  const isPublic = patch.isPublic ?? current.isPublic;
  const requested = patch.discoverable ?? current.discoverable;

  return { discoverable: isPublic ? requested : false, isPublic };
}

/** `Keşfet'te listele` anahtarı açılabilir mi? Tek koşul: sunucu herkese açık. */
export function canListInDiscovery(state: { isPublic: boolean }): boolean {
  return state.isPublic;
}

/**
 * `PATCH /servers/[serverId]` gövdesi: taslak ile kaydedilmiş değer arasındaki **fark**.
 *
 * Değişmeyen alanı göndermek zararsız görünür ama iki bedeli var: `authorizationRevision`
 * gereksiz artar ve `requiresChannelPermissionMetadataInvalidation` (Ş1) izin önbelleğini
 * boşuna düşürür. Fark boşsa çağıran isteği hiç açmaz.
 */
export function diffServerSettings<Fields extends Record<string, unknown>>(
  saved: Fields,
  draft: Fields,
): Partial<Fields> {
  const patch: Partial<Fields> = {};

  for (const key of Object.keys(draft) as Array<keyof Fields>) {
    if (!isSameFieldValue(saved[key], draft[key])) {
      patch[key] = draft[key];
    }
  }

  return patch;
}

function isSameFieldValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }

  return left === right;
}

/**
 * Topluluk sunucusunun görünürlüğü yönetim ekibinindir; servis yazmayı reddediyor
 * (`server-service.ts`). Alan gönderilip reddedilmektense hiç gönderilmiyor — reddedilen
 * bir `PATCH` bütün gövdeyi düşürürdü, yani yanındaki ad değişikliği de kaybolurdu.
 */
export function stripAdminOwnedFields<Fields extends Record<string, unknown>>(
  patch: Fields,
  serverType: "COMMUNITY" | "PERSONAL",
): Fields {
  if (serverType !== "COMMUNITY") {
    return patch;
  }

  const { discoverable: _discoverable, isPublic: _isPublic, ...rest } = patch;

  return rest as Fields;
}

/** SPEC §8.3'ün üç seçenek kartından ikisi sabit küme taşır; üçüncüsü sözleşmeden gelir. */
export const SERVER_MESSAGE_CHARACTER_LIMITS = [2000, 250, 40_000] as const;
export const SERVER_DELETED_NOTICE_MINUTES = [5, 15, 30, 60, 180, 360, 1440] as const;

/**
 * **K7.** Varsayılan yalnız **yeni** sunucuya uygulanır; mevcut sunucunun kayıtlı değeri
 * neyse çip grubunda o seçili gelir. Kayıtlı değer listede yoksa (eski veri, admin eliyle
 * yazılmış bir sayı) çip grubu boş kalmasın diye değer listeye **başa** eklenir.
 */
export function selectDeletedNoticeOptions(current: number): readonly number[] {
  return SERVER_DELETED_NOTICE_MINUTES.includes(current as never)
    ? SERVER_DELETED_NOTICE_MINUTES
    : [current, ...SERVER_DELETED_NOTICE_MINUTES];
}

/** Aynı gerekçe mesaj karakter limiti için: 250 · 2B · 40.000 dışında bir sayı kaydedilmiş olabilir. */
export function selectMessageLimitOptions(current: number): readonly number[] {
  return SERVER_MESSAGE_CHARACTER_LIMITS.includes(current as never)
    ? SERVER_MESSAGE_CHARACTER_LIMITS
    : [current, ...SERVER_MESSAGE_CHARACTER_LIMITS];
}
