/**
 * Roller ve Yetkiler bölümünün durum modeli — SPEC-SUNUCU §8.5.
 *
 * Bölümün tamamı iki şeye bakıyor: **hangi rol seçili** ve **taslak var mı**. Referans
 * (`Sunucu-referans.html`) bunu `roleNew` bayrağı + `newRoleName`/`newPerms` gibi ikiz
 * alanlarla çözüyor; üründe aynı ayrımı bir birleşim tipi (`ServerRoleSelection`) taşıyor,
 * çünkü "taslak açıkken mevcut rolün adı ne olacak" sorusunun cevabı ikiz alanlarda her
 * okumada yeniden veriliyor ve bir yerde unutulması kolay.
 *
 * Dosya **saf**: React yok, ağ yok, i18n yok. Rol oluşturma akışının kabul kriterleri
 * (`ad boşken pasif`, `Vazgeç` önceki role döner, taslak `Üye` ön ayarıyla açılır) bu yüzden
 * doğrudan birim testlenebiliyor.
 */

import type { WorkspacePermissionKey, WorkspaceRole } from "@wizards/types";

import { DEFAULT_ROLE_TONE, type ServerRoleTone, roleColorToTone } from "./role-color";
import {
  SERVER_PERMISSION_GROUPS,
  type ServerRolePresetId,
  resolvePreset,
} from "./permission-groups";

/** SPEC §8.5 `Rol adı` girdisi; sözleşmedeki `ROLE_NAME_MAX_LENGTH` ile aynı sayı (K6). */
export const ROLE_NAME_MAX_LENGTH = 32;

/** SPEC §8.5 hazır ayar çipleri, soldan sağa. */
export const SERVER_ROLE_PRESETS: readonly ServerRolePresetId[] = ["member", "moderator", "admin"];

export type ServerRoleDraft = {
  mentionable: boolean;
  name: string;
  permissions: readonly WorkspacePermissionKey[];
  tone: ServerRoleTone;
};

/**
 * Sağ panelin ne çizdiği. `kind: "draft"` iken sol listede `TASLAK` satırı durur ve mevcut
 * roller seçimsiz kalır; `kind: "role"` iken alt çubuğun yerini `Rolü sil` kartı alır.
 */
export type ServerRoleSelection =
  { kind: "draft" } | { kind: "role"; roleId: string } | { kind: "empty" };

/**
 * SPEC §8.5 sırası: `@everyone` en üstte, `Sunucu Sahibi` en altta.
 *
 * Üründe "sahip" bir rol **değil**, bir erişim seviyesi; listede görünen en üst rol yalnız
 * `position` sırasının sonuncusudur. Bu yüzden sıralama uydurulmaz: varsayılan rol öne
 * çekilir, kalan her rol `position` artan gider (Discord anlambilimi: yüksek `position` =
 * yüksek rütbe). Eşit `position`'da kimlik ayırıcıdır, yoksa iki okuma iki farklı sıra verirdi.
 */
export function sortRolesForSettings(roles: readonly WorkspaceRole[]): WorkspaceRole[] {
  return [...roles].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.id.localeCompare(right.id);
  });
}

/** Rol satırındaki üye sayısı. Varsayılan rol **herkesi** kapsar (K12: tek kaynak). */
export function countRoleMembers(
  role: Pick<WorkspaceRole, "id" | "isDefault">,
  members: readonly { roles: readonly { id: string }[] }[],
  totalMemberCount: number,
): number {
  if (role.isDefault) {
    return totalMemberCount;
  }

  return members.filter((member) => member.roles.some((badge) => badge.id === role.id)).length;
}

/** Girdinin canlı kırpması. Sözleşme de aynı sayıda reddediyor; kullanıcı sınırı yazarken görür. */
export function clampRoleName(value: string): string {
  return Array.from(value).slice(0, ROLE_NAME_MAX_LENGTH).join("");
}

/** SPEC §8.5: taslak `Üye` ön ayarıyla, primary renkte ve etiketlenemez açılır. */
export function createRoleDraft(): ServerRoleDraft {
  return {
    mentionable: false,
    name: "",
    permissions: resolvePreset("member"),
    tone: DEFAULT_ROLE_TONE,
  };
}

/** Mevcut rolü düzenlenebilir taslağa çevirir; renk tamsayıdan tona döner. */
export function toRoleDraft(role: WorkspaceRole): ServerRoleDraft {
  return {
    mentionable: role.mentionable,
    name: role.name,
    permissions: [...role.permissions],
    tone: roleColorToTone(role.color),
  };
}

/** `Rol oluştur` düğmesi: SPEC §8.5 "ad boşken pasif". */
export function canSubmitRoleDraft(draft: ServerRoleDraft): boolean {
  return draft.name.trim().length > 0;
}

const KNOWN_PERMISSION_KEYS = new Set<WorkspacePermissionKey>(
  SERVER_PERMISSION_GROUPS.flatMap((group) =>
    group.rows.flatMap((row) => (row.key ? [row.key] : [])),
  ),
);

/**
 * Yetki anahtarını açıp kapatır.
 *
 * Sonuç **her zaman** SPEC'in 18 satırındaki sıraya göre yazılır ve bu kümenin dışındaki
 * anahtarlar (rolde duran ama tasarımda satırı olmayan `BAN_MEMBERS`, `VIEW_AUDIT_LOG` gibi 7
 * anahtar) **korunur**. Ekranda görünmeyen bir yetkiyi kaydederken düşürmek, kullanıcının hiç
 * dokunmadığı bir ayarı sessizce silmek olurdu.
 */
export function togglePermission(
  permissions: readonly WorkspacePermissionKey[],
  key: WorkspacePermissionKey,
  next: boolean,
): WorkspacePermissionKey[] {
  const selected = new Set(permissions);

  if (next) {
    selected.add(key);
  } else {
    selected.delete(key);
  }

  return [...selected];
}

/**
 * Hazır ayar uygular. Tasarımın kendi cümlesi: "Admin = hepsi, `Yönetici` hariç"
 * (`resolvePreset`). Görünmeyen anahtarlar burada da korunur — hazır ayar 18 satırı yazar,
 * rolün geri kalanını değil.
 */
export function applyRolePreset(
  permissions: readonly WorkspacePermissionKey[],
  preset: ServerRolePresetId,
): WorkspacePermissionKey[] {
  const preserved = permissions.filter((key) => !KNOWN_PERMISSION_KEYS.has(key));

  return [...new Set([...preserved, ...resolvePreset(preset)])];
}

/**
 * Hangi hazır ayar çipi işaretli görünür.
 *
 * **Referanstan bilinçli sapma.** `Sunucu-referans.html` çipi rolün **adına** bakarak
 * işaretliyor (`const on = rName === label`). Bu bir demo kısayolu: adı `Admin` olan ama tek
 * yetkisi olmayan bir rol de işaretli görünürdü. Üründe çip, görünen 18 satırın **tam olarak**
 * o ön ayarın kümesine eşit olmasıyla işaretlenir; yani gösterge yalan söylemez.
 */
export function matchRolePreset(
  permissions: readonly WorkspacePermissionKey[],
): ServerRolePresetId | null {
  const selected = new Set(permissions.filter((key) => KNOWN_PERMISSION_KEYS.has(key)));

  for (const preset of SERVER_ROLE_PRESETS) {
    const expected = resolvePreset(preset);

    if (expected.length === selected.size && expected.every((key) => selected.has(key))) {
      return preset;
    }
  }

  return null;
}

/**
 * Korunan rol guard'ları — eski `server-settings-overlay.tsx`'ten **taşındı**, yeniden
 * yazılmadı (Ş12 sınırı: "mevcut `isProtectedRole` / `getRoleGuardCopy` guard'ları korunur").
 *
 * Dosya K4 ile siliniyor; guard'ın kendisi silinmiyor. Sunucu tarafındaki
 * `lib/workspace/role-helpers.ts` aynı adı taşıyor ama Prisma kaydına bakıyor — bu ikisi
 * bilerek ayrı: istemci `WorkspaceRole` sözleşmesini okur, uç veritabanını.
 */
const ELEVATED_PERMISSION_KEYS: readonly WorkspacePermissionKey[] = [
  "ADMINISTRATOR",
  "MANAGE_ROLES",
  "MANAGE_SERVER",
];

export function isElevatedRole(role: Pick<WorkspaceRole, "permissions">): boolean {
  return role.permissions.some((permission) => ELEVATED_PERMISSION_KEYS.includes(permission));
}

export function isProtectedRole(
  role: Pick<WorkspaceRole, "isDefault" | "managed" | "permissions">,
): boolean {
  return role.isDefault || role.managed || isElevatedRole(role);
}

export type ServerRoleGuardCopy = {
  descriptionKey: string;
  labelKey: string;
};

/** Korunan rolün rozetleri; metin `server.settings.roles.guard.*` altında. */
export function getRoleGuardCopy(
  role: Pick<WorkspaceRole, "isDefault" | "managed" | "permissions">,
): ServerRoleGuardCopy | null {
  if (role.isDefault || role.managed) {
    return {
      descriptionKey: "server.settings.roles.guard.systemHint",
      labelKey: "server.settings.roles.guard.system",
    };
  }

  if (isElevatedRole(role)) {
    return {
      descriptionKey: "server.settings.roles.guard.safeHint",
      labelKey: "server.settings.roles.guard.safe",
    };
  }

  return null;
}

/**
 * `Rolü sil` düğmesinin kapısı. SPEC §8.5 kartı `yalnızca sahip` çipi taşıyor; korunan roller
 * (varsayılan, yönetilen, yüksek yetkili) sahip için de silinemez — uç zaten reddediyor
 * (`role-service.ts`), düğmenin bunu bilmesi kullanıcıyı boş bir hataya göndermemek içindir.
 */
export function canDeleteRole(
  role: Pick<WorkspaceRole, "isDefault" | "managed" | "permissions">,
  isOwner: boolean,
): boolean {
  return isOwner && !isProtectedRole(role);
}
