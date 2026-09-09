import { ChannelType, MessageType, Prisma, prisma } from "@wizards/db";
import QRCode from "qrcode";
import {
  MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS,
  MOBILE_TARGETED_INVITE_MAX_USES,
  type CreateInviteInput,
  type CreateServerInviteInput,
  type MobileServerInviteSheetResponse,
  type MobileServerPendingInvite,
  type ServerPendingInvite,
  type WorkspaceInvite,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { onInviteRedeemed } from "@/lib/badges/badge-triggers";
import { areFriends } from "@/lib/friends/helpers";
import { listFriends } from "@/lib/friends/service";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import {
  canAddMembers,
  ensureServerPermission,
  ensureUserNotServerBanned,
  getAccessContext,
} from "@/lib/workspace/access-context";
import { getServerMediaSettings } from "@/lib/workspace/server-features";
import { generateInviteCode } from "@/lib/workspace/invite-code";
import { advanceMemberAuthorizationRevision } from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import {
  isLiveInvite,
  selectActiveLinkInvite,
  toMobileServerInvite,
} from "@/lib/workspace/invite-selection";
import { getMessageById } from "@/lib/workspace/message-service";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { mapInvites } from "@/lib/workspace/server-query-helpers";
import { reserveServerMemberCapacity } from "@/lib/workspace/server-member-counter";
import type { AccessContext } from "@/lib/workspace/workspace-types";

const workspaceInviteSelect = {
  channelId: true,
  code: true,
  createdAt: true,
  creator: {
    select: {
      displayName: true,
      username: true,
    },
  },
  expiresAt: true,
  id: true,
  maxUses: true,
  /** Hedefli davet (K3); `null` = herkese açık bağlantı. */
  targetUserId: true,
  uses: true,
} as const;

const MOBILE_INVITE_LIST_LIMIT = 100;

/** Identity-only shape for an invite's recipient; the sheet renders nothing else. */
const inviteSheetUserSelect = {
  avatarUrl: true,
  displayName: true,
  id: true,
  username: true,
} as const;

/**
 * "Hedef kanal" (SPEC §8.7) yalnız **yazı** kanalı olabilir; verilmezse sunucunun ilk yazı
 * kanalı seçilir.
 *
 * Yedeğin eski `parentId: null` filtresi kaldırıldı: kategori içindeki kanalları saymadığı
 * için bütün yazı kanalları kategorilenmiş bir sunucuda davet kanalsız oluşuyordu. SPEC'in
 * çip listesi (`# welcome-chat` … `# dokumanlar`) kategorili kanalları da içeriyor.
 */
async function resolveInviteChannelId(
  serverId: string,
  requestedChannelId: string | null,
): Promise<string | null> {
  if (requestedChannelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: requestedChannelId,
        serverId,
        type: ChannelType.TEXT,
      },
      select: {
        id: true,
      },
    });

    if (!channel) {
      throw new ApiError("Channel not found", 404);
    }

    return channel.id;
  }

  const fallbackChannel = await prisma.channel.findFirst({
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
    where: {
      serverId,
      type: ChannelType.TEXT,
    },
  });

  return fallbackChannel?.id ?? null;
}

/**
 * `Üyeler kullanıcı ekleyebilir` anahtarı (SPEC §8.6): kapalıyken davet oluşturmak
 * `MANAGE_INVITES` taşıyan düz üyeye de kapanır, yalnız admin ve sahip geçer. Aynı kapı
 * `member-service.ts`'in "üye ekle" yolunda da duruyor; iki yol tek kurala bakıyor.
 */
async function ensureInviteCreationAllowed(access: AccessContext, serverId: string) {
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { features: true },
  });

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  if (!canAddMembers(access.accessLevel, getServerMediaSettings(server.features).allowMemberAdds)) {
    throw new ApiError("Members are not allowed to add users to this server", 403, "FORBIDDEN");
  }
}

/**
 * "Arkadaş seçerek davet" (SPEC §8.7, K3) — web yolu.
 *
 * Mobil daldaki `createTargetedServerInvite`'tan iki noktada ayrılır, bu yüzden ayrı durur:
 * hedefin **arkadaş** olması şart (Ş3 §2), ve aynı hedefe açık bir davet varsa istek 409 ile
 * düşmez, mevcut davet döner — pencere aynı arkadaşa iki kez basmayı hata gibi göstermemeli.
 * Süre ve kullanım sınırı çiplerden gelir; mobil sabit 7 gün / tek kullanım kullanıyor.
 */
async function createTargetedWorkspaceInviteRecord(args: {
  channelId: string | null;
  input: CreateServerInviteInput;
  serverId: string;
  targetUserId: string;
  userId: string;
}): Promise<WorkspaceInvite> {
  const { channelId, input, serverId, targetUserId, userId } = args;

  if (targetUserId === userId) {
    throw new ApiError("You cannot invite yourself", 400, "INVITE_SELF");
  }

  // Arkadaşlık kontrolü en önde: arkadaş olmayana dönen 400, hedefin var olup olmadığını
  // da söylemez. Sırayı çevirmek daveti bir kullanıcı arama aracına dönüştürürdü.
  if (!(await areFriends(userId, targetUserId))) {
    throw new ApiError("You can only invite a friend directly", 400, "NOT_FRIENDS");
  }

  const [target, existingMember, server, inviter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { ...inviteSheetUserSelect, isBanned: true, locale: true },
    }),
    prisma.serverMember.findUnique({
      where: { userId_serverId: { serverId, userId: targetUserId } },
      select: { id: true },
    }),
    prisma.server.findUnique({ where: { id: serverId }, select: { name: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true },
    }),
  ]);

  if (!target || target.isBanned) {
    throw new ApiError("User not found", 404);
  }

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  if (existingMember) {
    throw new ApiError("User is already a member of this server", 409, "ALREADY_MEMBER");
  }

  await ensureUserNotServerBanned(prisma, serverId, targetUserId);

  const now = Date.now();
  const openInvites = await prisma.serverInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: workspaceInviteSelect,
    where: { serverId, targetUserId },
  });
  const liveInvite = openInvites.find((invite) => isLiveInvite(invite, now));

  if (liveInvite) {
    return mapInvites([liveInvite])[0]!;
  }

  const targetedCode = await generateInviteCode();
  const targetedInvite = await prisma.serverInvite.create({
    data: {
      channelId,
      code: targetedCode,
      createdById: userId,
      expiresAt:
        input.expiresInHours != null ? new Date(now + input.expiresInHours * 60 * 60 * 1000) : null,
      maxUses: input.maxUses ?? null,
      serverId,
      targetUserId,
    },
    select: workspaceInviteSelect,
  });

  await notifyTargetedServerInvite({
    inviterName: inviter?.displayName ?? inviter?.username ?? "Whispr",
    inviteCode: targetedCode,
    serverId,
    serverName: server.name,
    target: { id: target.id, locale: target.locale },
  });

  return mapInvites([targetedInvite])[0]!;
}

async function createWorkspaceInviteRecord(
  userId: string,
  serverId: string,
  input: CreateServerInviteInput,
): Promise<WorkspaceInvite> {
  const access = await getAccessContext(userId, serverId);
  await ensureInviteCreationAllowed(access, serverId);

  const channelId = await resolveInviteChannelId(serverId, input.channelId ?? null);
  const targetUserId = input.targetUserId ?? null;

  if (targetUserId) {
    return createTargetedWorkspaceInviteRecord({
      channelId,
      input,
      serverId,
      targetUserId,
      userId,
    });
  }

  const code = await generateInviteCode();
  const expiresAt =
    input.expiresInHours != null
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

  const invite = await prisma.serverInvite.create({
    data: {
      channelId,
      code,
      createdById: userId,
      expiresAt,
      maxUses: input.maxUses ?? null,
      serverId,
    },
    select: workspaceInviteSelect,
  });

  return mapInvites([invite])[0]!;
}

/**
 * Web davet ucunun gövdesi. Eskiden yalnız `{ code }` dönüyordu; hedefli davet satırı
 * (kod + hedef + süre + kullanım) tek yanıtta lazım olduğu için tam davet dönüyor.
 * `code` alanı yerinde durduğundan eski çağıranlar kırılmıyor.
 */
export async function createWorkspaceInvite(
  userId: string,
  serverId: string,
  input: CreateServerInviteInput,
): Promise<WorkspaceInvite> {
  return createWorkspaceInviteRecord(userId, serverId, input);
}

export async function createWorkspaceInviteWithDetails(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
): Promise<WorkspaceInvite> {
  return createWorkspaceInviteRecord(userId, serverId, input);
}

export async function listWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<WorkspaceInvite[]> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invites = await prisma.serverInvite.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: workspaceInviteSelect,
    where: {
      serverId,
    },
  });

  return mapInvites(invites);
}

/**
 * `GET /servers/[serverId]/invites?pending=1` — "Bekleyen davetler" (SPEC §8.7, K3).
 *
 * Bekleyen = hedefi olan, **hiç kullanılmamış** ve süresi geçmemiş davet. Ölçüt
 * `isLiveInvite`'ın "koltuk kaldı mı" kuralından bilerek dar: 25 kullanımlık bir hedefli
 * davet bir kez kullanıldıktan sonra teknik olarak canlı kalsa da artık *bekleyen* değildir,
 * hedef sunucuya girmiştir.
 */
export async function listPendingWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<ServerPendingInvite[]> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invites = await prisma.serverInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: workspaceInviteSelect,
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      serverId,
      targetUserId: { not: null },
      uses: 0,
    },
  });

  if (invites.length === 0) {
    return [];
  }

  // `ServerInvite.targetUserId` bir Prisma ilişkisi taşımıyor; kimlikler `include` ile değil
  // ayrı bir okumayla birleşiyor (mobil davet sayfasıyla aynı yöntem).
  const targetUsers = await prisma.user.findMany({
    select: inviteSheetUserSelect,
    where: {
      id: { in: Array.from(new Set(invites.map((invite) => invite.targetUserId ?? ""))) },
    },
  });
  const targetUserById = new Map(targetUsers.map((user) => [user.id, user]));

  const rows: ServerPendingInvite[] = [];
  for (const invite of mapInvites(invites)) {
    const targetUser = invite.targetUserId ? targetUserById.get(invite.targetUserId) : undefined;

    // Hesabı silinmiş bir hedefin satırı çizilemez; sessizce düşer.
    if (!targetUser) {
      continue;
    }

    rows.push({ ...invite, targetUser });
  }

  return rows;
}

export async function listMobileWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<WorkspaceInvite[]> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invites = await prisma.serverInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: workspaceInviteSelect,
    take: MOBILE_INVITE_LIST_LIMIT + 1,
    where: {
      serverId,
    },
  });

  if (invites.length > MOBILE_INVITE_LIST_LIMIT) {
    throw new ApiError(
      "Mobile invite list exceeds the supported limit",
      409,
      "MOBILE_RESPONSE_LIMIT_EXCEEDED",
    );
  }

  return mapInvites(invites);
}

function inviteConfigurationError(message: string) {
  return new ApiError(message, 500, "CONFIGURATION_ERROR");
}

export function buildMobileInviteShareUrl(
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const rawOrigin = [env.APP_URL, env.AUTH_URL, env.NEXTAUTH_URL]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  if (!rawOrigin) {
    throw inviteConfigurationError("Canonical application URL is not configured.");
  }

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw inviteConfigurationError("Canonical application URL is invalid.");
  }

  const protocolAllowed =
    origin.protocol === "https:" || (env.NODE_ENV === "development" && origin.protocol === "http:");
  if (!protocolAllowed) {
    throw inviteConfigurationError("Canonical application URL must use HTTPS.");
  }

  return new URL(`/invite/${encodeURIComponent(code)}`, `${origin.origin}/`).toString();
}

export async function revokeWorkspaceInvite(userId: string, serverId: string, inviteId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  // Ş3: hedefli davetin tek girişi bildirimidir. Satır silinip bildirim bırakılırsa hedef
  // hâlâ "Katıl" görür ve 404'e basar — kabul ve ret yollarının ikisi de aynı temizliği
  // yapıyor, iptal de yapmalı.
  const invite = await prisma.serverInvite.findFirst({
    where: { id: inviteId, serverId },
    select: { code: true, targetUserId: true },
  });

  await prisma.serverInvite.deleteMany({
    where: {
      id: inviteId,
      serverId,
    },
  });

  if (invite?.targetUserId) {
    await clearTargetedInviteNotifications(invite.code, invite.targetUserId);
  }
}

/**
 * Handoff 2a/2b — one read behind the whole "Davet et" sheet.
 *
 * The link card, the friends list and the pending targeted invites all depend
 * on the same server scope, and two of the three carry facts (`isMember`,
 * `pendingInviteId`) that neither the friends endpoint nor the invites list
 * knows about, so splitting this into three calls would still have meant
 * widening two contracts — for three staggered paints instead of one.
 */
export async function getMobileServerInviteSheet(
  userId: string,
  serverId: string,
): Promise<MobileServerInviteSheetResponse> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const [friends, invites] = await Promise.all([
    listFriends(userId),
    prisma.serverInvite.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: workspaceInviteSelect,
      take: MOBILE_INVITE_LIST_LIMIT + 1,
      where: { serverId },
    }),
  ]);

  if (invites.length > MOBILE_INVITE_LIST_LIMIT) {
    throw new ApiError(
      "Mobile invite list exceeds the supported limit",
      409,
      "MOBILE_RESPONSE_LIMIT_EXCEEDED",
    );
  }

  const now = Date.now();
  const linkInvite = selectActiveLinkInvite(invites, now);

  // Newest-first ordering means the first row per recipient is the one to show.
  const liveTargetedInvites: { createdAt: Date; id: string; targetUserId: string }[] = [];
  const pendingInviteIdByUserId = new Map<string, string>();
  for (const invite of invites) {
    if (!invite.targetUserId || pendingInviteIdByUserId.has(invite.targetUserId)) {
      continue;
    }
    if (!isLiveInvite(invite, now)) {
      continue;
    }
    pendingInviteIdByUserId.set(invite.targetUserId, invite.id);
    liveTargetedInvites.push({
      createdAt: invite.createdAt,
      id: invite.id,
      targetUserId: invite.targetUserId,
    });
  }

  // `ServerInvite.targetUserId` carries no Prisma relation, so the recipient
  // identities are joined here rather than through an `include`.
  const [memberships, targetUsers] = await Promise.all([
    prisma.serverMember.findMany({
      select: { userId: true },
      where: { serverId, userId: { in: friends.map((friend) => friend.id) } },
    }),
    liveTargetedInvites.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          select: inviteSheetUserSelect,
          where: { id: { in: liveTargetedInvites.map((invite) => invite.targetUserId) } },
        }),
  ]);
  const memberUserIds = new Set(memberships.map((membership) => membership.userId));
  const targetUserById = new Map(targetUsers.map((user) => [user.id, user]));

  const pendingInvites: MobileServerInviteSheetResponse["pendingInvites"] = [];
  for (const invite of liveTargetedInvites) {
    const user = targetUserById.get(invite.targetUserId);
    if (!user) {
      continue;
    }
    pendingInvites.push({ createdAt: invite.createdAt.toISOString(), id: invite.id, user });
  }

  return {
    friends: friends.map((friend) => ({
      avatarUrl: friend.avatarUrl,
      displayName: friend.displayName,
      id: friend.id,
      isMember: memberUserIds.has(friend.id),
      lastSeenAt: friend.lastSeenAt,
      pendingInviteId: pendingInviteIdByUserId.get(friend.id) ?? null,
      status: friend.status,
      username: friend.username,
    })),
    // Projected, never spread: the stored row carries `code`, which the strict
    // mobile contract rejects and a device must never receive.
    linkInvite: linkInvite
      ? toMobileServerInvite(mapInvites([linkInvite])[0]!, buildMobileInviteShareUrl)
      : null,
    pendingInvites,
  };
}

/**
 * "Düzenle": a `ServerInvite` row is immutable, so changing the link's lifetime
 * means minting a replacement and dropping the old one. Admin-only — plain
 * invite creation needs MANAGE_INVITES, but re-cutting the shared link does not
 * belong to everyone who can hand it out.
 */
export async function replaceMobileServerLinkInvite(
  userId: string,
  serverId: string,
  input: { expiresInHours: number | null; maxUses: number | null },
): Promise<WorkspaceInvite> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

  const existing = await prisma.serverInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      maxUses: true,
      targetUserId: true,
      uses: true,
    },
    take: MOBILE_INVITE_LIST_LIMIT + 1,
    where: { serverId },
  });
  const previous = selectActiveLinkInvite(existing, Date.now());

  const invite = await createWorkspaceInviteRecord(userId, serverId, {
    expiresInHours: input.expiresInHours,
    maxUses: input.maxUses,
  });

  if (previous) {
    await prisma.serverInvite.deleteMany({ where: { id: previous.id, serverId } });
  }

  return invite;
}

/**
 * Targeted invite: the seat is reserved for one person, so it is single-use and
 * only that account may redeem it (see `joinWorkspaceServerByInvite`). The
 * recipient learns about it through the normal notification lifecycle.
 */
export async function createTargetedServerInvite(
  userId: string,
  serverId: string,
  targetUserId: string,
): Promise<MobileServerPendingInvite> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  if (targetUserId === userId) {
    throw new ApiError("You are already a member of this server", 409, "ALREADY_MEMBER");
  }

  const [target, existingMember, server, inviter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { ...inviteSheetUserSelect, isBanned: true, locale: true },
    }),
    prisma.serverMember.findUnique({
      where: { userId_serverId: { serverId, userId: targetUserId } },
      select: { id: true },
    }),
    prisma.server.findUnique({ where: { id: serverId }, select: { name: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true },
    }),
  ]);

  if (!target || target.isBanned) {
    throw new ApiError("User not found", 404);
  }

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  if (existingMember) {
    throw new ApiError("User is already a member of this server", 409, "ALREADY_MEMBER");
  }

  await ensureUserNotServerBanned(prisma, serverId, targetUserId);

  const now = Date.now();
  const openInvites = await prisma.serverInvite.findMany({
    where: { serverId, targetUserId },
    select: { expiresAt: true, id: true, maxUses: true, uses: true },
  });
  if (openInvites.some((invite) => isLiveInvite(invite, now))) {
    throw new ApiError("This user already has a pending invite", 409, "INVITE_ALREADY_PENDING");
  }

  const code = await generateInviteCode();
  const invite = await prisma.serverInvite.create({
    data: {
      code,
      createdById: userId,
      expiresAt: new Date(now + MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS * 60 * 60 * 1000),
      maxUses: MOBILE_TARGETED_INVITE_MAX_USES,
      serverId,
      targetUserId,
    },
    select: { createdAt: true, id: true },
  });

  await notifyTargetedServerInvite({
    inviterName: inviter?.displayName ?? inviter?.username ?? "Whispr",
    inviteCode: code,
    serverId,
    serverName: server.name,
    target: { id: target.id, locale: target.locale },
  });

  return {
    createdAt: invite.createdAt.toISOString(),
    id: invite.id,
    user: {
      avatarUrl: target.avatarUrl,
      displayName: target.displayName,
      id: target.id,
      username: target.username,
    },
  };
}

/** Same notification lifecycle friend requests use: row, socket push, mobile push. */
async function notifyTargetedServerInvite(input: {
  inviteCode: string;
  inviterName: string;
  serverId: string;
  serverName: string;
  target: { id: string; locale: string | null };
}) {
  const locale = normalizeAppLocale(input.target.locale);
  const notification = await prisma.notification.create({
    data: {
      actionUrl: `/invite/${encodeURIComponent(input.inviteCode)}`,
      body: translate(locale, "workspace.notification.serverInvite.body", {
        name: input.inviterName,
        server: input.serverName,
      }),
      metadata: {
        inviteCode: input.inviteCode,
        serverId: input.serverId,
      },
      title: translate(locale, "workspace.notification.serverInvite.title"),
      type: "SERVER_INVITE",
      userId: input.target.id,
    },
  });

  getSocketServer()
    ?.to(`user:${input.target.id}`)
    .emit("notification:new", {
      actionUrl: notification.actionUrl,
      body: notification.body,
      createdAt: notification.createdAt.toISOString(),
      id: notification.id,
      imageUrl: notification.imageUrl,
      metadata: (notification.metadata as Record<string, unknown>) || null,
      read: notification.read,
      readAt: notification.readAt?.toISOString() ?? null,
      title: notification.title,
      type: "SERVER_INVITE",
      userId: notification.userId,
    });

  void sendMobilePushForNotifications([
    {
      actionUrl: notification.actionUrl,
      body: notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    },
  ]).catch(() => undefined);
}

/**
 * A targeted invite's notification is its only entry point, so once the invite
 * is answered the row has to go — otherwise it keeps offering accept/decline on
 * an invite that no longer exists. Mirrors how a friend request clears its own.
 */
async function clearTargetedInviteNotifications(code: string, userId: string) {
  await prisma.notification.deleteMany({
    where: {
      metadata: { path: ["inviteCode"], equals: code },
      type: "SERVER_INVITE",
      userId,
    },
  });
}

/**
 * Tells the inviter their pending row is gone. Scoped to that one user rather
 * than the whole server room: nobody else's view changed. Reuses the settings
 * event the device already maps onto an invite-sheet refresh instead of minting
 * a realtime event for a single row.
 */
function notifyInviterOfInviteChange(inviterUserId: string, serverId: string) {
  getSocketServer()?.to(`user:${inviterUserId}`).emit("server:settings:updated", { serverId });
}

/**
 * Recipient declines a targeted invite.
 *
 * Declining deletes the invite rather than marking it: the schema has no
 * declined state, and the design shows no "reddedildi" row — a declined invite
 * simply stops existing, which also leaves the inviter free to try again.
 */
export async function declineTargetedServerInvite(
  userId: string,
  code: string,
): Promise<{ serverId: string }> {
  const invite = await prisma.serverInvite.findUnique({
    where: { code },
    select: { createdById: true, id: true, serverId: true, targetUserId: true },
  });

  if (!invite || invite.targetUserId === null) {
    throw new ApiError("Invite not found", 404);
  }

  // Only the addressee may decline; anyone else holding the code is a stranger
  // to this invite and must not be able to burn it.
  if (invite.targetUserId !== userId) {
    throw new ApiError("This invite was sent to someone else", 403, "INVITE_NOT_FOR_USER");
  }

  await prisma.serverInvite.deleteMany({ where: { id: invite.id } });
  await clearTargetedInviteNotifications(code, userId);
  notifyInviterOfInviteChange(invite.createdById, invite.serverId);

  return { serverId: invite.serverId };
}

/** QR view for the link card, generated the same way the 2FA setup QR is. */
export async function buildMobileServerInviteQrCode(
  userId: string,
  serverId: string,
  inviteId: string,
): Promise<string> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invite = await prisma.serverInvite.findFirst({
    where: { id: inviteId, serverId },
    select: { code: true },
  });

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  return QRCode.toDataURL(buildMobileInviteShareUrl(invite.code), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
}

type ServerMembershipCreationInput = {
  defaultRoleId: string | null;
  joiningUserDisplayName: string;
  preferredChannelId: string | null;
  serverId: string;
  userId: string;
};

type ServerMembershipCreationMessage = {
  channelId: string;
  createdAt: Date;
  id: string;
};

type ServerMembershipCreationResult = {
  authorizationRevision: Awaited<ReturnType<typeof advanceMemberAuthorizationRevision>>;
  message: ServerMembershipCreationMessage | null;
};

/**
 * The membership-creation body every "become a member" entry point shares
 * (invite accept, S3's invite-free public join): create the row, bump the
 * live counter, assign the default role, and drop the "joined" system
 * message. Takes an already-open transaction rather than opening its own, so
 * a path-specific precondition that must commit atomically with the
 * membership row — an invite's use-count claim, for instance — stays in the
 * same transaction as the row it gates.
 */
async function createServerMembership(
  tx: Prisma.TransactionClient,
  input: ServerMembershipCreationInput,
): Promise<ServerMembershipCreationResult> {
  const capacityReserved = await reserveServerMemberCapacity(tx, input.serverId);

  if (!capacityReserved) {
    throw new ApiError("This server is full", 403, "SERVER_FULL");
  }

  const member = await tx.serverMember.create({
    data: {
      serverId: input.serverId,
      userId: input.userId,
    },
    select: {
      id: true,
    },
  });

  if (input.defaultRoleId) {
    await tx.memberRole.create({
      data: {
        memberId: member.id,
        roleId: input.defaultRoleId,
      },
    });
  }

  const targetChannelId =
    input.preferredChannelId ??
    (
      await tx.channel.findFirst({
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
        },
        where: {
          parentId: null,
          serverId: input.serverId,
          type: ChannelType.TEXT,
        },
      })
    )?.id ??
    null;

  if (!targetChannelId) {
    return {
      authorizationRevision: await advanceMemberAuthorizationRevision(
        tx,
        input.serverId,
        input.userId,
      ),
      message: null,
    };
  }

  const message = await tx.message.create({
    data: {
      channelId: targetChannelId,
      content: `${input.joiningUserDisplayName} joined the server.`,
      type: MessageType.SYSTEM_JOIN,
      userId: input.userId,
    },
  });

  return {
    authorizationRevision: await advanceMemberAuthorizationRevision(
      tx,
      input.serverId,
      input.userId,
    ),
    message: {
      channelId: targetChannelId,
      createdAt: message.createdAt,
      id: message.id,
    },
  };
}

/**
 * The socket/cache half of membership creation, run once the transaction
 * above has committed -- a Redis invalidation or a socket emit is not a
 * transactional resource, so neither belongs inside `$transaction`. Shared by
 * the same two callers as `createServerMembership` for the same reason: one
 * copy of "what happens right after someone joins," so the invite path and
 * the public-join path can never drift on cache invalidation or room
 * attachment the way two hand-written copies eventually would.
 */
async function finishServerMembershipCreation(
  serverId: string,
  userId: string,
  authorizationRevision: Awaited<ReturnType<typeof advanceMemberAuthorizationRevision>>,
  message: ServerMembershipCreationMessage | null,
): Promise<void> {
  await Promise.all([
    publishCommittedAuthorizationRevision(authorizationRevision),
    invalidateServerRoomIdsCache(userId),
  ]);

  if (message) {
    const activeViewerUserIds = await getActiveChannelViewerUserIds(message.channelId);
    await markChannelReadStates({
      channelId: message.channelId,
      lastReadAt: message.createdAt,
      lastReadMessageId: message.id,
      userIds: [userId, ...activeViewerUserIds],
    });
    const fullMessage = await getMessageById(message.id, userId);
    if (fullMessage) {
      getSocketServer()?.to(message.channelId).emit("message:new", fullMessage);
    }
    await emitServerUnreadUpdatesForServer(serverId);
  }

  const io = getSocketServer();

  if (io) {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      socket.join(`server:${serverId}`);
    }

    io.to(`server:${serverId}`).emit("server:settings:updated", {
      serverId,
    });
    io.to(`user:${userId}`).emit("server:settings:updated", {
      serverId,
    });
  }
}

const workspaceJoinInviteSelect = {
  channelId: true,
  createdById: true,
  expiresAt: true,
  id: true,
  maxUses: true,
  server: {
    select: {
      id: true,
      name: true,
      ownerId: true,
      roles: {
        orderBy: {
          position: "desc" as const,
        },
        select: {
          id: true,
          isDefault: true,
        },
      },
    },
  },
  targetUserId: true,
  uses: true,
} as const;

export async function joinWorkspaceServerByInvite(userId: string, code: string) {
  const directInvite = await prisma.serverInvite.findUnique({
    select: workspaceJoinInviteSelect,
    where: {
      code,
    },
  });
  // Community links use a stable human-readable slug. Resolve that slug to the
  // newest public link invite, then continue through this same join lifecycle;
  // no second mutation endpoint or permission path is introduced.
  const invite =
    directInvite ??
    (await prisma.serverInvite.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: workspaceJoinInviteSelect,
      where: {
        server: { vanityUrlCode: code },
        targetUserId: null,
      },
    }));

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  // A targeted invite reserves one seat for one account; nobody else may spend
  // it, even with the code in hand.
  const inviteTargetUserId = invite.targetUserId ?? null;
  if (inviteTargetUserId !== null && inviteTargetUserId !== userId) {
    throw new ApiError("This invite was sent to someone else", 403, "INVITE_NOT_FOR_USER");
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError("Invite has expired", 400);
  }

  const joiningUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      displayName: true,
      isBanned: true,
      username: true,
    },
  });

  if (!joiningUser) {
    throw new ApiError("User not found", 404);
  }

  if (joiningUser.isBanned) {
    throw new ApiError("Your account has been suspended", 403);
  }

  await ensureUserNotServerBanned(prisma, invite.server.id, userId);

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId: invite.server.id,
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existingMember) {
    const defaultRole = invite.server.roles.find((role) => role.isDefault);

    const transactionResult = await prisma.$transaction(async (tx) => {
      await ensureUserNotServerBanned(tx, invite.server.id, userId);

      if (invite.maxUses != null) {
        const claimResult = await tx.serverInvite.updateMany({
          where: {
            id: invite.id,
            uses: {
              lt: invite.maxUses,
            },
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });

        if (claimResult.count !== 1) {
          throw new ApiError("Invite has reached its usage limit", 400);
        }
      } else {
        await tx.serverInvite.update({
          where: {
            id: invite.id,
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });
      }

      return createServerMembership(tx, {
        defaultRoleId: defaultRole?.id ?? null,
        joiningUserDisplayName:
          joiningUser.displayName ?? joiningUser.username ?? "A new Whispr user",
        preferredChannelId: invite.channelId,
        serverId: invite.server.id,
        userId,
      });
    });

    await finishServerMembershipCreation(
      invite.server.id,
      userId,
      transactionResult.authorizationRevision,
      transactionResult.message,
    );

    // Outside the transaction on purpose: the join is already committed, and a
    // badge counter must never be able to roll it back or hold it open.
    await onInviteRedeemed({ inviterId: invite.createdById, joinedUserId: userId });
  }

  const targetChannel =
    invite.channelId ??
    (
      await prisma.channel.findFirst({
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
        },
        where: {
          parentId: null,
          serverId: invite.server.id,
          type: ChannelType.TEXT,
        },
      })
    )?.id ??
    null;

  // An accepted targeted invite is answered, so its notification stops offering
  // accept/decline and the inviter's pending row clears — the same two effects a
  // decline has, reached from the other side.
  if (inviteTargetUserId !== null) {
    await clearTargetedInviteNotifications(code, userId);
    notifyInviterOfInviteChange(invite.createdById, invite.server.id);
  }

  return {
    alreadyMember: Boolean(existingMember),
    channelId: targetChannel,
    name: invite.server.name,
    serverId: invite.server.id,
  };
}

const JOIN_PUBLIC_SERVER_SELECT = {
  id: true,
  isPublic: true,
  maxMembers: true,
  memberCount: true,
  name: true,
  roles: {
    orderBy: {
      position: "desc" as const,
    },
    select: {
      id: true,
      isDefault: true,
    },
  },
} satisfies Prisma.ServerSelect;

/**
 * The invite-free join path: visibility resolves first, then everything
 * else -- existence, ban, membership, capacity. Any failure means no
 * membership row is created and `memberCount` never increments.
 *
 * A server that does not exist, and a private server the caller is not
 * already a member of, are denied identically -- 404 `SERVER_NOT_FOUND`,
 * never 403 -- so posting a private server's id here cannot be told apart
 * from posting one that does not exist at all. That mirrors the access rule
 * `getVisibleServerPublicProfile` already enforces for the profile card;
 * this function does not re-derive it, it just applies the same outcome to
 * the join mutation. Membership itself grants visibility, so an
 * already-a-member caller is exempt from the `isPublic` gate -- which is why
 * a banned member of a private server still gets `SERVER_BANNED` below
 * rather than `SERVER_NOT_FOUND`: they could already see the server, so a
 * 403 tells them nothing a 404 would have hidden.
 *
 * The membership row is read once (`existingMember`) and reused for both
 * the visibility gate and the idempotent "already a member" return below it
 * -- two facts, one query.
 *
 * Ban and capacity are re-verified inside the transaction, so a same-user
 * double submit and a same-server concurrent join cannot slip through on the
 * strength of a pre-transaction read that only ran once. Capacity is reserved
 * through one conditional `UPDATE`, not a transaction-local read followed by
 * a later increment. A concurrent duplicate join surfaces from
 * `createServerMembership`'s insert as Postgres unique-violation `P2002` on
 * `ServerMember`'s `[userId, serverId]` constraint (`schema.prisma`); that is
 * caught around the transaction and answered with the same idempotent
 * success shape the pre-existing-member branch above returns, rather than a
 * 500. Visibility is not re-checked inside the transaction -- a server
 * flipping public/private mid-join is not a race either check above closes,
 * and `joinWorkspaceServerByInvite` does not re-derive its own analogous
 * preconditions (target user, expiry) inside its transaction either.
 */
export async function joinPublicWorkspaceServer(
  userId: string,
  serverId: string,
): Promise<{ alreadyMember: boolean; name: string; serverId: string }> {
  const server = await prisma.server.findUnique({
    select: JOIN_PUBLIC_SERVER_SELECT,
    where: { id: serverId },
  });

  if (!server) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId,
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!server.isPublic && !existingMember) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  await ensureUserNotServerBanned(prisma, serverId, userId);

  if (existingMember) {
    return { alreadyMember: true, name: server.name, serverId };
  }

  if (server.memberCount >= server.maxMembers) {
    throw new ApiError("This server is full", 403, "SERVER_FULL");
  }

  const joiningUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, isBanned: true, username: true },
  });

  if (!joiningUser) {
    throw new ApiError("User not found", 404);
  }

  if (joiningUser.isBanned) {
    throw new ApiError("Your account has been suspended", 403);
  }

  const defaultRole = server.roles.find((role) => role.isDefault);

  let transactionResult: ServerMembershipCreationResult;

  try {
    transactionResult = await prisma.$transaction(async (tx) => {
      await ensureUserNotServerBanned(tx, serverId, userId);

      return createServerMembership(tx, {
        defaultRoleId: defaultRole?.id ?? null,
        joiningUserDisplayName:
          joiningUser.displayName ?? joiningUser.username ?? "A new Whispr user",
        preferredChannelId: null,
        serverId,
        userId,
      });
    });
  } catch (error) {
    // Two same-user requests can both pass the `existingMember` pre-read
    // above and both reach `createServerMembership`'s insert; the loser hits
    // `ServerMember`'s `[userId, serverId]` unique constraint. That is the
    // same outcome the pre-read's "already a member" branch reports above,
    // so answer it the same way instead of letting a 500 escape.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { alreadyMember: true, name: server.name, serverId };
    }

    throw error;
  }

  await finishServerMembershipCreation(
    serverId,
    userId,
    transactionResult.authorizationRevision,
    transactionResult.message,
  );

  return { alreadyMember: false, name: server.name, serverId };
}
