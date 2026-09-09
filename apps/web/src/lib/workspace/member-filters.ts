import type { Prisma } from "@wizards/db";
import type { WorkspaceMemberFilter } from "@wizards/types";

import {
  ADMIN_ACCESS_PERMISSIONS,
  PermissionBits,
  hasAnyPermission,
} from "@/lib/workspace/permissions";

/**
 * Üye listesinin arama + filtre sözleşmesi (SPEC-SUNUCU §8.6, Ş2).
 *
 * Buradaki her şey saf: girdisi rol satırları ve bir kullanıcı kimliği kümesi, çıktısı bir
 * Prisma `where` parçası. Filtre **sayfaya değil sorguya** giriyor, çünkü `N / toplam` sayacı
 * veritabanı sayımından okunuyor — sayfa üstünde süzmek 100. satırdan sonrasını görmezdi.
 */

/**
 * `moderator` çipi bir erişim seviyesi değil, bir yetenek kümesidir.
 *
 * `WorkspaceAccessLevel` üründe yalnız `OWNER | ADMIN | MEMBER` taşıyor ve mobil sözleşmesi
 * ona bağlı (K10), yani "MODERATOR" diye dördüncü bir seviye açmak iki istemciyi birden
 * kırardı. Bunun yerine çip, üyeye **başka bir üye üzerinde** işlem yaptıran dört bitten
 * herhangi birine bakar. `MUTE_MEMBERS`/`MOVE_MEMBERS` dışarıda: onlar ses odası kontrolü,
 * üye moderasyonu değil.
 */
export const MEMBER_MODERATION_PERMISSIONS = [
  PermissionBits.MANAGE_MESSAGES,
  PermissionBits.KICK_MEMBERS,
  PermissionBits.BAN_MEMBERS,
  PermissionBits.TIMEOUT_MEMBERS,
] as const;

export type MemberFilterRoleRecord = {
  id: string;
  permissions: bigint;
};

export type ServerRoleClassification = {
  adminRoleIds: string[];
  moderatorRoleIds: string[];
};

/**
 * Rolleri bir kez sınıflandır, sonra filtreyi rol kimlikleriyle kur.
 *
 * Prisma `where` içinde bit maskesi karşılaştıramaz; bir sunucunun rol sayısı ise onlarla
 * ölçülür. Rolleri okuyup kimliğe indirmek, filtreyi hem tam hem de sayfalanabilir yapan tek
 * yol — alternatifi her üyeyi belleğe çekip sınıflandırmaktı.
 */
export function classifyServerRoles(
  roles: readonly MemberFilterRoleRecord[],
): ServerRoleClassification {
  const adminRoleIds: string[] = [];
  const moderatorRoleIds: string[] = [];

  for (const role of roles) {
    if (hasAnyPermission(role.permissions, [...ADMIN_ACCESS_PERMISSIONS])) {
      adminRoleIds.push(role.id);
      continue;
    }

    if (hasAnyPermission(role.permissions, [...MEMBER_MODERATION_PERMISSIONS])) {
      moderatorRoleIds.push(role.id);
    }
  }

  return { adminRoleIds, moderatorRoleIds };
}

/**
 * Arama: görünen ad (sunucu takma adı), hesap adı ve kullanıcı adı. SPEC "ad veya kullanıcı
 * adı" diyor; takma ad listede **görünen** addır, onu dışarıda bırakmak "gördüğüm adı
 * arayamıyorum" demekti.
 */
export function buildMemberSearchWhere(query: string | undefined): Prisma.ServerMemberWhereInput {
  const trimmed = query?.trim();
  if (!trimmed) {
    return {};
  }

  return {
    OR: [
      { nickname: { contains: trimmed, mode: "insensitive" } },
      { user: { displayName: { contains: trimmed, mode: "insensitive" } } },
      { user: { username: { contains: trimmed, mode: "insensitive" } } },
    ],
  };
}

export type MemberFilterContext = ServerRoleClassification & {
  ownerId: string;
  /**
   * `online` çipinin geçireceği kullanıcılar. Presence Redis'te yaşıyor ve **izleyiciye göre
   * gizlenir**, bu yüzden çağıran onu kendisi çözer; boş küme "kimse çevrimiçi değil"dir,
   * "presence bilinmiyor" değil — presence okuması zaten aynı yönde bozulur.
   */
  onlineUserIds: readonly string[];
};

export function buildMemberFilterWhere(
  filter: WorkspaceMemberFilter,
  context: MemberFilterContext,
): Prisma.ServerMemberWhereInput {
  const { adminRoleIds, moderatorRoleIds, onlineUserIds, ownerId } = context;

  switch (filter) {
    case "all":
      return {};
    case "owner":
      return { userId: ownerId };
    case "admin":
      // Sahip `admin` çipine düşmez: tasarımda ikisi ayrı çip ve sahip her zaman kendi
      // çipindedir, rol maskesi ne olursa olsun.
      return {
        roles: { some: { roleId: { in: adminRoleIds } } },
        userId: { not: ownerId },
      };
    case "moderator":
      return {
        roles: {
          none: { roleId: { in: adminRoleIds } },
          some: { roleId: { in: moderatorRoleIds } },
        },
        userId: { not: ownerId },
      };
    case "member":
      return {
        roles: { none: { roleId: { in: [...adminRoleIds, ...moderatorRoleIds] } } },
        userId: { not: ownerId },
      };
    case "online":
      return { userId: { in: [...onlineUserIds] } };
    case "offline":
      return { userId: { notIn: [...onlineUserIds] } };
  }
}

/** `online`/`offline` dışındaki çipler presence okumaz; okuma yalnız gerektiğinde yapılır. */
export function memberFilterNeedsPresence(filter: WorkspaceMemberFilter) {
  return filter === "online" || filter === "offline";
}

/** Rol kimliği çözümü yalnız rol tabanlı çipler için gerekir. */
export function memberFilterNeedsRoles(filter: WorkspaceMemberFilter) {
  return filter === "admin" || filter === "moderator" || filter === "member";
}
