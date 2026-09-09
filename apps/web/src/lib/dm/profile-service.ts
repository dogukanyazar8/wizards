import {
  deriveServerShortName,
  isMuteActive,
  resolveProfileTint,
  type DMNotifyLevel,
  type EarnedBadge,
  type ProfileTint,
  type ServerIconTone,
  type UserProfilePanelDTO,
} from "@wizards/types";
import { prisma, type PrismaClient } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { readUserBadges } from "@/lib/badges/badge-service";
import { listDirectMessageMutualServers } from "@/lib/dm/service";
import { getBlockStatus } from "@/lib/friends/helpers";
import {
  getMutualFriends,
  MUTUAL_FRIEND_DEFAULT_LIMIT,
  type MutualFriendsResult,
} from "@/lib/friends/mutual-friends";
import { toInitials, toMessagesPresence } from "@/lib/messages/rail-presentation";
import { readActiveCustomStatus } from "@/lib/social/mobile-user-profile-service";
import { readPresenceState, type PresenceFields } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { getRedis, getRedisOp } from "@/lib/redis";
import { countServerOnlineMembersBatch } from "@/lib/socket/server-online-presence";

/**
 * SPEC §15'in **DM** kolu — profil panelinin tek okuma ucu.
 *
 * Panel altı bölüm çiziyor (kimlik, hakkında, rozetler, tarih kartı, ortak
 * sunucular, ortak arkadaşlar) ve hepsi tek `UserProfilePanelDTO` içinde döner.
 * Altı ayrı istek altı ayrı yükleme iskeleti, altı ayrı hata durumu ve altı ayrı
 * hız sınırı kovası demekti; panel bir kere açılıyor, bir kere okunuyor.
 *
 * Sorgu bütçesi iki tur: (1) konuşma satırı, (2) rozet · arkadaşlık · ortak
 * arkadaş · ortak sunucu · gizlilik tercihi · engel durumu paralel, (3) presence
 * · sunucu çevrimiçi sayacı · "tanıştınız" satırı paralel. Üçüncü tur ikinciye
 * bağımlı çünkü kimin presence'ı okunacağı ortak arkadaş kesişiminden çıkıyor.
 */

/** SPEC §15.3.4 üç satır çiziyor; tavan mevcut mobil detay okumasıyla aynı. */
export const PROFILE_MUTUAL_SERVER_LIMIT = 12;

/**
 * Sunucunun kendi ikon tonu ile profil panelinin dört tintli paleti arasındaki
 * köprü. Sunucu rayında ve keşfet kartında hangi renkse panelde de o olsun diye
 * hash'e düşülmez; `info` bu palette `primary`'nin altına, `accent2` ise hiçbir
 * tintin altına düşmediği için `neutral` olur — `neutral`'ın tanımı zaten
 * "paletin rengi olmayan özne".
 */
const PROFILE_TINT_BY_SERVER_ICON_TONE: Readonly<Record<ServerIconTone, ProfileTint>> =
  Object.freeze({
    accent2: "neutral",
    danger: "danger",
    info: "primary",
    primary: "primary",
    success: "success",
    warning: "warning",
  });

export type DmProfileStore = {
  dMConversation: Pick<PrismaClient["dMConversation"], "findUnique">;
  friendRequest: Pick<PrismaClient["friendRequest"], "findFirst">;
  serverMember: Pick<PrismaClient["serverMember"], "findFirst">;
  userSettings: Pick<PrismaClient["userSettings"], "findUnique">;
};

export type ProfilePresenceSubject = {
  readonly customStatus: string | null;
  readonly userId: string;
};

export type ProfilePresenceReader = (
  viewerId: string,
  subjects: readonly ProfilePresenceSubject[],
) => Promise<ReadonlyMap<string, PresenceFields>>;

export type DmProfilePanelDependencies = {
  getBlockStatus: typeof getBlockStatus;
  getMutualFriends: (
    viewerId: string,
    otherUserId: string,
    limit?: number,
  ) => Promise<MutualFriendsResult>;
  listMutualServers: typeof listDirectMessageMutualServers;
  now: () => Date;
  readBadges: (userId: string) => Promise<EarnedBadge[]>;
  readPresence: ProfilePresenceReader;
  readServerOnlineCounts: (serverIds: readonly string[]) => Promise<ReadonlyMap<string, number>>;
  store: DmProfileStore;
};

/**
 * Presence tek yerden: Redis kaydı + görünürlük kararı + redaksiyon. DM
 * konuşmasının kendi presence yolu (`service.ts`) ile aynı üç adım — "görünmez"
 * modundaki biri panelde çevrimiçi görünemez.
 */
async function readProfilePanelPresence(
  viewerId: string,
  subjects: readonly ProfilePresenceSubject[],
): Promise<ReadonlyMap<string, PresenceFields>> {
  if (subjects.length === 0) {
    return new Map();
  }

  const subjectIds = subjects.map((subject) => subject.userId);
  const [presenceState, decisions] = await Promise.all([
    readPresenceState(
      getRedis(),
      subjects.map((subject) => ({
        customStatus: subject.customStatus,
        status: "OFFLINE" as const,
        userId: subject.userId,
      })),
    ),
    resolveVisibilityDecisions(viewerId, subjectIds),
  ]);

  return redactPresenceCollectionForViewer({
    decisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    lastSeenByUserId: new Map(),
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds,
  }).presenceByUserId;
}

async function readMutualServerOnlineCounts(
  serverIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (serverIds.length === 0) {
    return new Map();
  }

  // Sunucu başına bir `SCARD` yerine tek boru hattı; keşfet listesinin okuduğu
  // `server:<id>:online` kümesinin **aynısı**, yani sayaçlar ayrışamaz.
  return countServerOnlineMembersBatch(getRedisOp(), serverIds);
}

const defaultDependencies: DmProfilePanelDependencies = {
  getBlockStatus,
  getMutualFriends: (viewerId, otherUserId, limit) =>
    getMutualFriends(viewerId, otherUserId, limit),
  listMutualServers: listDirectMessageMutualServers,
  now: () => new Date(),
  readBadges: (userId) => readUserBadges({ userId }),
  readPresence: readProfilePanelPresence,
  readServerOnlineCounts: readMutualServerOnlineCounts,
  store: prisma as unknown as DmProfileStore,
};

const dmProfileConversationSelect = {
  id: true,
  participants: {
    select: {
      muted: true,
      mutedUntil: true,
      notifyLevel: true,
      userId: true,
      user: {
        select: {
          bio: true,
          customStatus: true,
          customStatusExpiresAt: true,
          displayName: true,
          id: true,
          username: true,
        },
      },
    },
  },
  type: true,
} as const;

/**
 * K7'nin tarih kartındaki "1 yıl 6 ay". Servis **ay sayısı** döner, cümleyi
 * değil: çoğul kuralı ve tarih biçimi görüntüleyenin diline bağlı ve sunucudan
 * çıkan Türkçe bir cümle, dil değiştiğinde değişmeyen bir cümle olurdu.
 */
export function monthsBetween(since: Date, now: Date): number {
  const months =
    (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth());
  const beforeAnniversary = now.getDate() < since.getDate();

  return Math.max(0, months - (beforeAnniversary ? 1 : 0));
}

export function resolveMutualServerTint(iconColor: ServerIconTone | null): ProfileTint {
  return iconColor === null ? "neutral" : PROFILE_TINT_BY_SERVER_ICON_TONE[iconColor];
}

/**
 * Süresi geçmiş bir sessizlik **sessizlik değildir** (K8). Okuma tarafı onu yok
 * sayar; satırı geri yazmaz — `muted` ile `notifyLevel` ikizdir ve ikisini
 * birlikte yazmak sessize alma ucunun işidir, bir GET'in değil. `NONE`,
 * sessizliğin kendisiydi: süre dolunca tercih de `ALL`'a döner, yoksa başlık
 * "sessiz değil" derken Ayarlar sekmesi "Kapalı" gösterirdi.
 */
export function resolveEffectiveMute(
  participant: { muted: boolean; mutedUntil: Date | null; notifyLevel: DMNotifyLevel },
  now: Date,
): { muted: boolean; mutedUntil: string | null; notifyLevel: DMNotifyLevel } {
  if (isMuteActive({ muted: participant.muted, mutedUntil: participant.mutedUntil }, now)) {
    return {
      muted: true,
      mutedUntil: participant.mutedUntil?.toISOString() ?? null,
      notifyLevel: participant.notifyLevel,
    };
  }

  return {
    muted: false,
    mutedUntil: null,
    notifyLevel: participant.notifyLevel === "NONE" ? "ALL" : participant.notifyLevel,
  };
}

export async function getDmProfilePanel(
  viewerId: string,
  conversationId: string,
  dependencies: DmProfilePanelDependencies = defaultDependencies,
): Promise<UserProfilePanelDTO> {
  const conversation = await dependencies.store.dMConversation.findUnique({
    select: dmProfileConversationSelect,
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const viewer = conversation.participants.find((participant) => participant.userId === viewerId);

  // 403, 404 değil: konuşma var, çağıran içinde değil. Kural 8 üyeliği her uçta
  // yeniden doğrulatıyor; istemcinin elindeki id yetki değildir.
  if (!viewer) {
    throw new ApiError("You are not a participant of this conversation", 403, "FORBIDDEN");
  }

  if (conversation.type === "GROUP_DM") {
    throw new ApiError(
      "This conversation is a group; read the group profile instead",
      400,
      "GROUP_CONVERSATION",
    );
  }

  const counterpart = conversation.participants.find(
    (participant) => participant.userId !== viewerId,
  );

  if (!counterpart) {
    throw new ApiError("Conversation participant not found", 404, "PARTICIPANT_NOT_FOUND");
  }

  const now = dependencies.now();
  const otherUserId = counterpart.userId;
  const [badges, friendRequest, mutualFriends, mutualServers, settings, blockStatus] =
    await Promise.all([
      dependencies.readBadges(otherUserId),
      dependencies.store.friendRequest.findFirst({
        select: { updatedAt: true },
        where: {
          status: "ACCEPTED",
          OR: [
            { receiverId: otherUserId, senderId: viewerId },
            { receiverId: viewerId, senderId: otherUserId },
          ],
        },
      }),
      dependencies.getMutualFriends(viewerId, otherUserId, MUTUAL_FRIEND_DEFAULT_LIMIT),
      dependencies.listMutualServers(viewerId, otherUserId, {
        limit: PROFILE_MUTUAL_SERVER_LIMIT,
      }),
      dependencies.store.userSettings.findUnique({
        select: { showReadReceipts: true, showTypingIndicator: true },
        where: { userId: viewerId },
      }),
      dependencies.getBlockStatus(viewerId, otherUserId),
    ]);

  const blocked = blockStatus.blocked;
  const mutualFriendIds = blocked ? [] : mutualFriends.users.map((friend) => friend.id);
  const mutualServerIds = blocked ? [] : mutualServers.map((server) => server.id);
  const [presenceByUserId, onlineCountByServerId, metVia] = await Promise.all([
    dependencies.readPresence(viewerId, [
      {
        customStatus: readActiveCustomStatus(
          counterpart.user.customStatus,
          counterpart.user.customStatusExpiresAt,
          now,
        ),
        userId: otherUserId,
      },
      ...mutualFriendIds.map((userId) => ({ customStatus: null, userId })),
    ]),
    dependencies.readServerOnlineCounts(mutualServerIds),
    // K6: tarih kartının ikinci cümlesi yalnız arkadaşken çiziliyor, arkadaş
    // değilken sorulmaz da.
    friendRequest === null || blocked
      ? Promise.resolve(null)
      : dependencies.store.serverMember.findFirst({
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: { server: { select: { name: true } } },
          where: {
            pending: false,
            server: {
              AND: [
                { members: { some: { pending: false, userId: viewerId } } },
                { members: { some: { pending: false, userId: otherUserId } } },
              ],
            },
            userId: { in: [viewerId, otherUserId] },
          },
        }),
  ]);

  const name = counterpart.user.displayName?.trim() || counterpart.user.username;
  const presence = presenceByUserId.get(otherUserId) ?? { customStatus: null, status: "OFFLINE" };
  const mute = resolveEffectiveMute(viewer, now);

  return {
    // Engelli bir çiftte kimlik kalır, kişisel ayrıntı kalmaz: panel adı ve
    // "Engellemeyi kaldır" satırını çizebilmeli, ama biyografi, rozet ve ortak
    // listeler engelin iki yanında da görünmemeli. Mobil profil kartının
    // engelli kabuğuyla aynı kural.
    badges: blocked ? [] : badges,
    bio: blocked ? null : counterpart.user.bio,
    blocked,
    friendship:
      blocked || friendRequest === null
        ? null
        : {
            durationMonths: monthsBetween(friendRequest.updatedAt, now),
            metViaServerName: metVia?.server.name ?? null,
            since: friendRequest.updatedAt.toISOString(),
          },
    // Çıplak kullanıcı adı; baştaki `@` panelin çizdiği süstür, verinin parçası
    // değil (emsal: keşfet ve bahsedilmeler uçları).
    handle: counterpart.user.username,
    initials: toInitials(name),
    muted: mute.muted,
    mutedUntil: mute.mutedUntil,
    mutualFriends: blocked
      ? []
      : mutualFriends.users.map((friend) => {
          const friendName = friend.displayName?.trim() || friend.username;

          return {
            id: friend.id,
            initials: toInitials(friendName),
            name: friendName,
            presence: toMessagesPresence(presenceByUserId.get(friend.id)?.status),
            tint: resolveProfileTint(friend.id),
          };
        }),
    mutualFriendTotal: blocked ? 0 : mutualFriends.total,
    mutualServers: blocked
      ? []
      : mutualServers.map((server) => ({
          id: server.id,
          initials: server.shortName ?? deriveServerShortName(server.name),
          name: server.name,
          onlineCount: onlineCountByServerId.get(server.id) ?? 0,
          tint: resolveMutualServerTint(server.iconColor),
        })),
    name,
    notifyLevel: mute.notifyLevel,
    presence: blocked ? "offline" : toMessagesPresence(presence.status),
    // Gizlilik kartı **görüntüleyenin kendi** hesap tercihini gösterir; karşı
    // tarafın tercihi ona ait bir bilgidir ve panelde yeri yoktur.
    privacy: {
      readReceipts: settings?.showReadReceipts ?? true,
      typingIndicator: settings?.showTypingIndicator ?? true,
    },
    statusText: blocked ? null : presence.customStatus,
    tint: resolveProfileTint(otherUserId),
    userId: otherUserId,
  };
}
