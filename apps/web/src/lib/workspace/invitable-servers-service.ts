import { prisma } from "@wizards/db";

import {
  PermissionBits,
  hasPermission,
  resolveServerPermissions,
} from "@/lib/workspace/permissions";

/**
 * "Bu kullanıcı hangi sunucularıma davet edebilir?" — SPEC-MESAJLAR §4.
 *
 * Arkadaş satırındaki `Sunucuya davet et` bu listeyi bekliyor ve liste boşken
 * satır **hiç çizilmiyor**. Yetkiyi istemcide tahmin etmek (ör. "üyeyse davet
 * edebilir") kullanıcıya yapamayacağı bir işi göstermek ve sonra 403 yedirmek
 * olurdu; karar sunucuda veriliyor.
 *
 * Sorgu bilinçli olarak **dar**: sunucu başına yalnız kimlik, ad, ikon, sahip ve
 * görüntüleyenin rolleri okunuyor. `listWorkspaceServers` aynı cevabı verebilirdi
 * ama kanalları, kategori ağacını ve üye sayımlarını da beraberinde getirirdi —
 * bir menü satırı için ödenmeyecek bir bedel.
 */

/** Davet üretmeye yeten izinler. `ADMINISTRATOR` `hasPermission` içinde kapsanıyor. */
const INVITE_PERMISSION = PermissionBits.MANAGE_INVITES;

export type InvitableServerRow = {
  iconUrl: string | null;
  id: string;
  name: string;
};

/** Servisin okuduğu **tek** şekil. Prisma'nın imzası değil: testin sahtesi de bu şekli verir. */
export type InvitableMembershipRow = {
  roles: { role: { id: string; isDefault: boolean; name: string; permissions: bigint } }[];
  server: {
    iconUrl: string | null;
    id: string;
    name: string;
    ownerId: string;
    roles: { id: string; isDefault: boolean; name: string; permissions: bigint }[];
  };
};

export type InvitableServersDeps = {
  findMemberships: (userId: string) => Promise<InvitableMembershipRow[]>;
};

const defaultDeps: InvitableServersDeps = {
  findMemberships: (userId) =>
    prisma.serverMember.findMany({
      orderBy: { joinedAt: "asc" },
      where: {
        userId,
        // Yasaklı olduğu bir sunucuya kimseyi davet edemez.
        server: { bans: { none: { userId } } },
      },
      select: {
        roles: {
          select: {
            role: { select: { id: true, isDefault: true, name: true, permissions: true } },
          },
        },
        server: {
          select: {
            iconUrl: true,
            id: true,
            name: true,
            ownerId: true,
            // Rol satırı olmayan eski üyelikler için `@everyone` yedeği;
            // `resolveServerPermissions` bu yedeği bekliyor.
            roles: {
              where: { isDefault: true },
              select: { id: true, isDefault: true, name: true, permissions: true },
            },
          },
        },
      },
    }),
};

export async function listInvitableServers(
  userId: string,
  deps: InvitableServersDeps = defaultDeps,
): Promise<InvitableServerRow[]> {
  const memberships = await deps.findMemberships(userId);

  const rows: InvitableServerRow[] = [];

  for (const membership of memberships) {
    const permissions = resolveServerPermissions({
      ownerId: membership.server.ownerId,
      roles: [...membership.server.roles, ...membership.roles.map((entry) => entry.role)],
      userId,
    });

    if (!hasPermission(permissions, INVITE_PERMISSION)) {
      continue;
    }

    rows.push({
      iconUrl: membership.server.iconUrl,
      id: membership.server.id,
      name: membership.server.name,
    });
  }

  return rows;
}
