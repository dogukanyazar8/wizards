/**
 * İzleyicinin sunucu yetkileri — **istemci tarafı** türetme.
 *
 * `WorkspaceServerDetail` izleyicinin yetki bitlerini taşımıyor: özet yalnız `accessLevel`,
 * `isAdmin` ve `isOwner` veriyor. Ama SPEC §8.6/§8.7/§8.8 üç ayrı bite göre yüzey **gizliyor**
 * (`BAN_MEMBERS`, `MANAGE_INVITES`, `MANAGE_EVENTS`) ve 00 §5 "yetkisi olmayana hiç render
 * edilmez" diyor — pasifleştirme yeterli değil. Üç bitin karşılığı detayda **zaten var**:
 * `detail.roles` her rolün yetki anahtarlarını taşıyor ve `detail.members` izleyicinin hangi
 * rollerde olduğunu.
 *
 * Bu dosya o iki listeyi birleştirir. Sunucu tarafındaki `resolveServerPermissions` ile aynı
 * üç kuralı uygular ve **yalnız** onları:
 *
 * 1. Sahip her şeyi yapar (uçtaki `ensureServerPermission` de böyle davranır).
 * 2. `ADMINISTRATOR` taşıyan rol her şeyi açar.
 * 3. Geri kalan her bit rollerin birleşimidir; `@everyone` (`isDefault`) **her zaman** sayılır.
 *
 * Üçüncü kural neden `detail.roles`'tan okunuyor da üye satırının rozetlerinden değil: üye
 * satırındaki `roles` bir **rozet** listesi (`id`/`name`/`color`), yetki taşımıyor. Ve
 * `@everyone` bazı projeksiyonlarda üye satırına hiç girmiyor — varsayılan rolü rozetten
 * okumak, herkese açık yetkileri sessizce düşürürdü.
 *
 * Kapı yine **uçta** kapanır. Buradaki küme "ne çizilecek" sorusunu yanıtlar, "ne yapılabilir"
 * sorusunu değil; istemcide hesaplanan bir yetki hiçbir zaman bir yetki denetimi değildir.
 */

import type { WorkspacePermissionKey, WorkspaceRole } from "@wizards/types";

export type ServerViewerPermissionInput = {
  readonly currentUserId: string;
  readonly members: readonly {
    readonly roles: readonly { readonly id: string }[];
    readonly userId: string;
  }[];
  readonly roles: readonly WorkspaceRole[];
  readonly server: { readonly isOwner: boolean };
};

export type ServerViewerPermissions = {
  /** `true` ise `has()` her anahtara `true` der. */
  readonly all: boolean;
  readonly keys: ReadonlySet<WorkspacePermissionKey>;
};

export function resolveViewerPermissions(
  input: ServerViewerPermissionInput,
): ServerViewerPermissions {
  if (input.server.isOwner) {
    return { all: true, keys: new Set() };
  }

  const memberRoleIds = new Set(
    input.members
      .find((member) => member.userId === input.currentUserId)
      ?.roles.map((role) => role.id) ?? [],
  );
  const keys = new Set<WorkspacePermissionKey>();

  for (const role of input.roles) {
    if (!role.isDefault && !memberRoleIds.has(role.id)) {
      continue;
    }

    for (const key of role.permissions) {
      if (key === "ADMINISTRATOR") {
        return { all: true, keys: new Set() };
      }

      keys.add(key);
    }
  }

  return { all: false, keys };
}

export function viewerCan(
  permissions: ServerViewerPermissions,
  key: WorkspacePermissionKey,
): boolean {
  return permissions.all || permissions.keys.has(key);
}

/** Hiçbir yetkisi olmayan izleyici — negatif testlerin ve sunucu render'ının başlangıcı. */
export const NO_SERVER_PERMISSIONS: ServerViewerPermissions = { all: false, keys: new Set() };
