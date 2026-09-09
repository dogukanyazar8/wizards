import type { WorkspacePermissionKey } from "@wizards/types";

/**
 * SPEC-SUNUCU §8.5'in dört yetki grubu ve 18 satırı.
 *
 * Her satır **mevcut** bir `WorkspacePermissionKey` değerine bağlanır; yeni anahtar
 * üretilmez (00-ortak-baglam §2.5). Grup başlıkları ve satır sırası tasarımdaki sırayla
 * birebir aynıdır, çünkü "seçili/toplam" sayacı ve `HAZIR AYARLAR` çipleri bu sıraya göre
 * okunuyor.
 *
 * ---
 *
 * **Tek istisna — `Geçmişi oku`.**
 *
 * Tasarım Genel grubunun üçüncü satırında `Geçmişi oku` istiyor. Üründe böyle bir yetki biti
 * **yok**: `PermissionBits` 25 anahtar taşıyor ve hiçbiri "mesaj geçmişini oku" değil. Üç
 * seçenek vardı ve üçünün de bir bedeli var:
 *
 * 1. Yeni bir anahtar açmak — Ş0'ın sınırı bunu yasaklıyor (bit 25 boş, ama karar Ş12'nin).
 * 2. Satırı var olan bir anahtara bağlamak — `CLEAR_CHANNEL_HISTORY` "geçmişi **sil**"dir ve
 *    `Üye` hazır ayarı Genel grubun tamamını açtığı için her üyeye veri silme yetkisi verirdi;
 *    `MENTION_EVERYONE` ise her üyeye `@herkes` hakkı verirdi. İkisi de etiketiyle çelişir.
 * 3. Satırı `alwaysOn` olarak çizmek — bu ürün için doğru olan: geçmişi görmek
 *    `VIEW_CHANNEL`'ın doğal sonucu, ayrı bir kapısı yok.
 *
 * Üçüncüsü seçildi: satır ekranda durur, kapatılamaz olduğu `alwaysOn` ile söylenir ve sayaca
 * dâhil olur (SPEC'in `14 yetki seçili` örneği Genel 5 + Ses 5 + Moderasyon 4 toplamıdır — yani
 * bu satır sayılıyor). Gerçek bir bit isteniyorsa karar Ş12'ye aittir.
 */
export type ServerPermissionRow = {
  /** `true` ise satır kapatılamaz; `key` yoktur ve sayaçta her zaman seçili görünür. */
  alwaysOn?: true;
  /** i18n anahtarı; metin `server.settings.roles.permission.*` altında yaşar. */
  id: string;
  /** `undefined` yalnız `alwaysOn` satırlarda olur. */
  key?: WorkspacePermissionKey;
  /** SPEC §8.5: `Yönetici` satırı `yalnızca sahip` çipi taşır ve sahip dışına çizilmez. */
  ownerOnly?: true;
};

export type ServerPermissionGroupId = "general" | "voice" | "moderation" | "management";

export type ServerPermissionGroup = {
  id: ServerPermissionGroupId;
  rows: readonly ServerPermissionRow[];
};

export const SERVER_PERMISSION_GROUPS: readonly ServerPermissionGroup[] = [
  {
    id: "general",
    rows: [
      { id: "viewChannels", key: "VIEW_CHANNEL" },
      { id: "sendMessages", key: "SEND_MESSAGES" },
      { alwaysOn: true, id: "readHistory" },
      // `Bağlantı ekle`: üründe gömülü bağlantı/GIF tek bir bittir.
      { id: "embedLinks", key: "USE_GIFS" },
      { id: "useEmoji", key: "ADD_REACTIONS" },
    ],
  },
  {
    id: "voice",
    rows: [
      { id: "connectVoice", key: "CONNECT_VOICE" },
      { id: "speak", key: "SPEAK" },
      { id: "useVideo", key: "USE_VIDEO" },
      { id: "stream", key: "STREAM" },
      { id: "attachFiles", key: "ATTACH_FILES" },
    ],
  },
  {
    id: "moderation",
    rows: [
      { id: "manageMessages", key: "MANAGE_MESSAGES" },
      { id: "kickMembers", key: "KICK_MEMBERS" },
      // `Üye sustur` = zaman aşımı (K3). `MUTE_MEMBERS` ses kanalındaki mikrofon kapatmadır ve
      // tasarımın moderasyon satırı onu değil, konuşma yasağını anlatıyor.
      { id: "timeoutMembers", key: "TIMEOUT_MEMBERS" },
      { id: "manageInvites", key: "MANAGE_INVITES" },
    ],
  },
  {
    id: "management",
    rows: [
      { id: "manageChannels", key: "MANAGE_CHANNELS" },
      { id: "manageRoles", key: "MANAGE_ROLES" },
      { id: "manageServer", key: "MANAGE_SERVER" },
      { id: "administrator", key: "ADMINISTRATOR", ownerOnly: true },
    ],
  },
];

/** Tasarımdaki toplam satır sayısı; `18` bir sabit değil, gruplardan türer. */
export const SERVER_PERMISSION_ROW_COUNT = SERVER_PERMISSION_GROUPS.reduce(
  (total, group) => total + group.rows.length,
  0,
);

export type ServerRolePresetId = "member" | "moderator" | "admin";

const GROUPS_BY_PRESET: Record<ServerRolePresetId, readonly ServerPermissionGroupId[]> = {
  member: ["general"],
  moderator: ["general", "voice", "moderation"],
  admin: ["general", "voice", "moderation", "management"],
};

export function listGroupKeys(groupId: ServerPermissionGroupId): WorkspacePermissionKey[] {
  const group = SERVER_PERMISSION_GROUPS.find((entry) => entry.id === groupId);

  return (group?.rows ?? []).flatMap((row) => (row.key ? [row.key] : []));
}

export type PermissionGroupVisibilityOptions = {
  readonly includeOwnerOnly?: boolean;
};

function listVisibleGroupRows(
  groupId: ServerPermissionGroupId,
  { includeOwnerOnly = true }: PermissionGroupVisibilityOptions = {},
): readonly ServerPermissionRow[] {
  const group = SERVER_PERMISSION_GROUPS.find((entry) => entry.id === groupId);

  return (group?.rows ?? []).filter((row) => includeOwnerOnly || !row.ownerOnly);
}

export type PermissionGroupSelectionState = "all" | "mixed" | "none";

export function getPermissionGroupSelection(
  groupId: ServerPermissionGroupId,
  permissions: readonly WorkspacePermissionKey[],
  options: PermissionGroupVisibilityOptions = {},
): { selected: number; state: PermissionGroupSelectionState; total: number } {
  const selected = new Set(permissions);
  const keys = listVisibleGroupRows(groupId, options).flatMap((row) => (row.key ? [row.key] : []));
  const selectedCount = keys.filter((key) => selected.has(key)).length;

  return {
    selected: selectedCount,
    state: selectedCount === 0 ? "none" : selectedCount === keys.length ? "all" : "mixed",
    total: keys.length,
  };
}

/** Yalnız grubun görünür anahtarlarını değiştirir; bilinmeyen/başka grup anahtarlarını korur. */
export function setPermissionGroupSelection(
  permissions: readonly WorkspacePermissionKey[],
  groupId: ServerPermissionGroupId,
  selected: boolean,
  options: PermissionGroupVisibilityOptions = {},
): WorkspacePermissionKey[] {
  const groupKeys = listVisibleGroupRows(groupId, options).flatMap((row) =>
    row.key ? [row.key] : [],
  );
  const groupKeySet = new Set(groupKeys);

  if (!selected) {
    return permissions.filter((key) => !groupKeySet.has(key));
  }

  const next = [...permissions];
  const existing = new Set(permissions);
  for (const key of groupKeys) {
    if (!existing.has(key)) {
      next.push(key);
    }
  }

  return next;
}

/**
 * SPEC §8.5'in üç hazır ayarı. `Admin` "hepsi **eksi** `Yönetici`"dir — tasarımın kendi
 * cümlesi; `ADMINISTRATOR` yalnız sahibin açabileceği tek anahtardır.
 */
export function resolvePreset(preset: ServerRolePresetId): WorkspacePermissionKey[] {
  const keys = GROUPS_BY_PRESET[preset].flatMap((groupId) => listGroupKeys(groupId));

  return preset === "admin" ? keys.filter((key) => key !== "ADMINISTRATOR") : keys;
}

/**
 * Başlıktaki `N yetki seçili` çipi. `alwaysOn` satırlar her zaman sayılır: SPEC'in `14 yetki
 * seçili` örneği Genel (5) + Ses ve Medya (5) + Moderasyon (4) toplamıdır, yani kapatılamaz
 * satır da sayının içindedir.
 */
export function countSelected(permissions: readonly WorkspacePermissionKey[]): number {
  const selected = new Set(permissions);

  return SERVER_PERMISSION_GROUPS.reduce(
    (total, group) =>
      total +
      group.rows.filter((row) => (row.alwaysOn ? true : row.key ? selected.has(row.key) : false))
        .length,
    0,
  );
}

/** Grup başlığındaki `seçili/toplam`; tamamı seçiliyse tüketici sayıyı primary çizer. */
export function countGroupSelected(
  groupId: ServerPermissionGroupId,
  permissions: readonly WorkspacePermissionKey[],
  options: PermissionGroupVisibilityOptions = {},
): { selected: number; total: number } {
  const rows = listVisibleGroupRows(groupId, options);
  const selected = new Set(permissions);

  return {
    selected: rows.filter((row) => (row.alwaysOn ? true : row.key ? selected.has(row.key) : false))
      .length,
    total: rows.length,
  };
}
