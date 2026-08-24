import { prisma } from "@wizards/db";

import { normalizeAppLocale, translate } from "@/lib/locale";
import type { NotificationRecord } from "@/lib/socket/notification-payload";
import type { AppSocketServer } from "@/lib/socket/runtime";
import {
  buildMentionPreview,
  chunkForFanOut,
  collectQuietUserIds,
  createChannelMuteFilter,
  deliverChannelNotifications,
  readMentionNotificationSettings,
  readMentionSetting,
} from "@/lib/workspace/message-notification-service";
import { matchRoleNameCandidate, parseMentionTokens } from "@/lib/workspace/mention-parser";
import { filterUserIdsByChannelPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

/**
 * Bahsedilmeler Ş2 / karar K1 — rol bahsetmesi, uçtan uca.
 *
 * Ayrıştırıcı bir token'ın rol mü kullanıcı mı olduğunu **bilmez**; kararı bu modül veriyle
 * verir. Sıra: önce gerçek `User.username` eşlemesi, kalan token'lar `Role.name`. İki tarafta da
 * eşleşen token kullanıcı sayılır — kullanıcı adı benzersizdir, rol adı değildir.
 */

export type ResolvedRoleMention = {
  id: string;
  name: string;
};

type ServerRoleRow = {
  id: string;
  isDefault: boolean;
  mentionable: boolean;
  name: string;
};

/**
 * `Role.mentionable = false` bir rolü bahsetmek `MENTION_EVERYONE` ister (Discord'un kuralı).
 * İzin yoksa **hata atılmaz**: mesaj gider, o rol yalnız bahsetme üretmez. `@everyone`'ın 403'ü
 * (`assertCanMentionEveryone`) olduğu gibi kalır — orada kullanıcı kitleye seslenmeyi bilerek
 * deniyor, burada bir rol adını yazmış olabilir.
 */
export async function resolveRoleMentions(args: {
  channelId: string;
  content: string;
  senderCanMentionRestrictedRoles?: boolean | null;
  senderId: string;
  serverId: string;
}): Promise<ResolvedRoleMention[]> {
  const tokens = parseMentionTokens(args.content);
  if (tokens.roleNames.length === 0) {
    return [];
  }

  const roles = (await prisma.role.findMany({
    where: { serverId: args.serverId },
    select: { id: true, isDefault: true, mentionable: true, name: true },
  })) as ServerRoleRow[];

  if (roles.length === 0) {
    return [];
  }

  // Varsayılan rol bu yoldan bahsedilmez: o `@herkes`in kendisidir ve K2 üye başına satır
  // yazmamak için ona ayrı bir dal tutuyor.
  const mentionableRoles = roles.filter((entry) => !entry.isDefault);
  const matched = new Map<string, { candidate: string; role: ServerRoleRow }>();
  for (const candidate of tokens.roleNames) {
    const role = matchRoleNameCandidate(mentionableRoles, candidate);
    if (role && !matched.has(role.id)) {
      matched.set(role.id, { candidate, role });
    }
  }

  if (matched.size === 0) {
    return [];
  }

  // Belirsiz token: hem rol adına hem kullanıcı adı desenine uyuyor. Karar veriyle verilir ve
  // kullanıcı kazanır — kullanıcı adı benzersiz, rol adı değil.
  const ambiguousTokens = [
    ...new Set(
      [...matched.values()]
        .map((entry) => entry.candidate.toLocaleLowerCase("en-US"))
        .filter((candidate) => tokens.usernames.includes(candidate)),
    ),
  ];

  if (ambiguousTokens.length > 0) {
    const realUsernames = new Set(
      (
        await prisma.user.findMany({
          where: { username: { in: ambiguousTokens } },
          select: { username: true },
        })
      ).map((user) => user.username),
    );

    for (const [roleId, entry] of matched) {
      if (realUsernames.has(entry.candidate.toLocaleLowerCase("en-US"))) {
        matched.delete(roleId);
      }
    }
  }

  const matchedRoles = [...matched.values()].map((entry) => entry.role);
  if (matchedRoles.every((role) => role.mentionable)) {
    return matchedRoles.map((role) => ({ id: role.id, name: role.name }));
  }

  const canMentionRestricted =
    args.senderCanMentionRestrictedRoles ??
    (
      await filterUserIdsByChannelPermission(
        args.channelId,
        [args.senderId],
        PermissionBits.MENTION_EVERYONE,
      )
    ).includes(args.senderId);

  return matchedRoles
    .filter((role) => role.mentionable || canMentionRestricted)
    .map((role) => ({ id: role.id, name: role.name }));
}

/**
 * Rol fan-out'u. Outbox işinden çağrılır, gönderim yolundan **değil** (tuzak #9).
 *
 * Alıcı kümesi: rolün üyeleri ∩ kanalı görebilenler − gönderen − kanal/sunucu sessize alanlar −
 * `suppressRoleMentions` açık olanlar − bu mesajda **adıyla** bahsedilenler. Son eleme sıra
 * bağımlılığını ortadan kaldırıyor: `SELF` işi henüz koşmamış olsa bile aynı kullanıcıya `ROLE`
 * satırı yazılmaz, dolayısıyla iki işin drenaj sırası sonucu değiştiremez.
 */
export async function createRoleMentionNotifications(args: {
  channelId: string;
  channelName: string;
  content: string;
  io?: AppSocketServer;
  messageId: string;
  senderCanMentionRestrictedRoles?: boolean | null;
  senderId: string;
  senderName: string;
  serverId: string;
  skipUserIds?: string[];
}) {
  const roles = await resolveRoleMentions({
    channelId: args.channelId,
    content: args.content,
    ...(args.senderCanMentionRestrictedRoles === undefined
      ? {}
      : { senderCanMentionRestrictedRoles: args.senderCanMentionRestrictedRoles }),
    senderId: args.senderId,
    serverId: args.serverId,
  });

  if (roles.length === 0) {
    return;
  }

  const roleIds = roles.map((role) => role.id);
  const memberRoles = await prisma.memberRole.findMany({
    where: { roleId: { in: roleIds }, member: { serverId: args.serverId } },
    select: {
      roleId: true,
      member: {
        select: { joinedAt: true, userId: true, user: { select: { locale: true } } },
      },
    },
  });

  const skipUserIds = new Set([...(args.skipUserIds ?? []), args.senderId]);
  const candidates = new Map<
    string,
    { joinedAt: Date; locale: string | null; roleId: string; roleName: string }
  >();
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  for (const row of memberRoles) {
    const userId = row.member.userId;
    if (skipUserIds.has(userId) || candidates.has(userId)) {
      continue;
    }

    candidates.set(userId, {
      joinedAt: row.member.joinedAt,
      locale: row.member.user.locale,
      roleId: row.roleId,
      roleName: roleNameById.get(row.roleId) ?? "",
    });
  }

  // Adıyla bahsedilen üye rol dalından düşer; kalan tek satır `SELF` olur (kabul maddesi).
  const tokens = parseMentionTokens(args.content);
  if (tokens.usernames.length > 0 && candidates.size > 0) {
    const directlyMentioned = await prisma.serverMember.findMany({
      where: {
        serverId: args.serverId,
        userId: { in: [...candidates.keys()] },
        user: { username: { in: tokens.usernames } },
      },
      select: { userId: true },
    });
    for (const member of directlyMentioned) {
      candidates.delete(member.userId);
    }
  }

  if (candidates.size === 0) {
    return;
  }

  const visibleUserIds = new Set(
    await filterUserIdsByChannelPermission(
      args.channelId,
      [...candidates.keys()],
      PermissionBits.VIEW_CHANNEL,
    ),
  );
  for (const userId of [...candidates.keys()]) {
    if (!visibleUserIds.has(userId)) {
      candidates.delete(userId);
    }
  }

  if (candidates.size === 0) {
    return;
  }

  const [isNotMuted, settings] = await Promise.all([
    createChannelMuteFilter({
      channelId: args.channelId,
      serverId: args.serverId,
      userIds: [...candidates.keys()],
    }),
    readMentionNotificationSettings([...candidates.keys()]),
  ]);
  const recipients = [...candidates.entries()]
    .filter(
      ([userId]) =>
        isNotMuted(userId) && !readMentionSetting(settings, userId).suppressRoleMentions,
    )
    .map(([userId, entry]) => ({ userId, ...entry }));

  if (recipients.length === 0) {
    return;
  }

  const preview = buildMentionPreview(args.content);
  const pushBodyByUserId = new Map<string, string>();
  const notifications: NotificationRecord[] = [];

  // 500'lük partiler: 2.000 üyeli bir rol tek `createMany` ile yazılmaz (kabul maddesi).
  for (const batch of chunkForFanOut(recipients)) {
    const created = await prisma.$transaction(async (tx) => {
      const createdMentions = await tx.messageMention.createManyAndReturn({
        data: batch.map((recipient) => ({
          kind: "ROLE" as const,
          messageId: args.messageId,
          roleId: recipient.roleId,
          userId: recipient.userId,
        })),
        skipDuplicates: true,
      });
      const newMentionUserIds = new Set(createdMentions.map((mention) => mention.userId));

      if (newMentionUserIds.size > 0) {
        // İki set-tabanlı deyim, alıcı başına bir `upsert` değil: 500 kişilik bir partide
        // 500 gidiş-dönüş, işlemi açık tuttuğu süre boyunca kanalın okuma durumunu kilitlerdi.
        const existing = await tx.channelReadState.findMany({
          where: { channelId: args.channelId, userId: { in: [...newMentionUserIds] } },
          select: { userId: true },
        });
        const existingUserIds = new Set(existing.map((row) => row.userId));
        const missing = batch.filter(
          (recipient) =>
            newMentionUserIds.has(recipient.userId) && !existingUserIds.has(recipient.userId),
        );

        if (missing.length > 0) {
          await tx.channelReadState.createMany({
            data: missing.map((recipient) => ({
              channelId: args.channelId,
              lastReadAt: recipient.joinedAt,
              mentionCount: 1,
              userId: recipient.userId,
            })),
            skipDuplicates: true,
          });
        }

        if (existingUserIds.size > 0) {
          await tx.channelReadState.updateMany({
            where: { channelId: args.channelId, userId: { in: [...existingUserIds] } },
            data: { mentionCount: { increment: 1 } },
          });
        }
      }

      return tx.notification.createManyAndReturn({
        data: batch.map((recipient) => {
          const locale = normalizeAppLocale(recipient.locale);
          pushBodyByUserId.set(
            recipient.userId,
            preview
              ? translate(locale, "chat.mentions.notifyRoleBodyWithMessage", {
                  channel: args.channelName,
                  name: args.senderName,
                  preview,
                  role: recipient.roleName,
                })
              : translate(locale, "chat.mentions.notifyRoleBody", {
                  channel: args.channelName,
                  name: args.senderName,
                  role: recipient.roleName,
                }),
          );

          return {
            actionUrl: `/channels/${args.serverId}/${args.channelId}`,
            body: translate(locale, "chat.mentions.notifyRoleBody", {
              channel: args.channelName,
              name: args.senderName,
              role: recipient.roleName,
            }),
            // Önek `channel-mention:` — `mentions-service` okuma tarafı bu anahtarı kullanıyor
            // ve rol bahsetmesi de bir `MessageMention` satırıdır; ayrı önek satırı okunmuş
            // gösterirdi (tuzak #2).
            dedupeKey: `channel-mention:${args.messageId}:${recipient.userId}`,
            metadata: {
              channelId: args.channelId,
              ...(preview ? { messagePreview: preview } : {}),
              messageId: args.messageId,
              roleId: recipient.roleId,
              senderId: args.senderId,
              serverId: args.serverId,
            },
            title: translate(locale, "chat.mentions.notifyRoleTitle"),
            type: "MENTION" as const,
            userId: recipient.userId,
          };
        }),
        skipDuplicates: true,
      });
    });

    notifications.push(...(created as NotificationRecord[]));
  }

  await deliverChannelNotifications({
    channelId: args.channelId,
    channelName: args.channelName,
    emitServerUnread: true,
    ...(args.io ? { io: args.io } : {}),
    notifications,
    pushBodyByUserId,
    quietUserIds: collectQuietUserIds(
      settings,
      recipients.map((recipient) => recipient.userId),
    ),
    senderId: args.senderId,
    serverId: args.serverId,
  });
}
