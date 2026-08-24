import { type Prisma, prisma } from "@wizards/db";

/**
 * Bahsedilmeler Ş2 — thread takibi (karar K3).
 *
 * Takip iki yoldan doğar: **örtük** (thread'i açan, içine yanıt yazan, içinde bahsedilen) ve
 * **açık** (thread panelindeki `Takip` düğmesi). Kapatma satırı silmez, `mutedAt` yazar —
 * silinseydi kullanıcının thread'e bir sonraki yanıtı takibi sessizce geri açardı.
 */

export type ThreadFollowOriginName = "AUTHOR" | "REPLY" | "MENTION" | "EXPLICIT";

type ThreadFollowWriteClient = {
  threadFollow: {
    upsert(args: Prisma.ThreadFollowUpsertArgs): Promise<unknown>;
  };
};

type ThreadFollowReadClient = {
  threadFollow: {
    findMany(args: Prisma.ThreadFollowFindManyArgs): Promise<
      Array<{
        mutedAt: Date | null;
        origin: ThreadFollowOriginName;
        userId: string;
      }>
    >;
  };
};

export type ThreadFollower = {
  origin: ThreadFollowOriginName;
  userId: string;
};

/**
 * Örtük takip. `update: {}` bilerek boş: var olan satıra dokunmaz, bu yüzden
 *
 * - `mutedAt` dolu bir satır **yeniden açılmaz** (kullanıcı bilerek kapattı), ve
 * - ilk sebep korunur; `AUTHOR` olarak doğan takip ikinci yanıtta `REPLY`ye düşmez.
 *
 * Aynı çağrı defalarca yapılabilir; `@@unique([userId, parentMessageId])` üzerinden idempotent.
 */
export async function ensureImplicitFollow(args: {
  channelId: string;
  client?: ThreadFollowWriteClient;
  origin: Exclude<ThreadFollowOriginName, "EXPLICIT">;
  parentMessageId: string;
  userId: string;
}) {
  const client = args.client ?? prisma;

  await client.threadFollow.upsert({
    where: {
      userId_parentMessageId: {
        parentMessageId: args.parentMessageId,
        userId: args.userId,
      },
    },
    create: {
      channelId: args.channelId,
      origin: args.origin,
      parentMessageId: args.parentMessageId,
      userId: args.userId,
    },
    update: {},
  });
}

/**
 * Açık takip. Açarken `mutedAt` temizlenir ve sebep `EXPLICIT` olur — kullanıcı kendi eliyle
 * açtığı bir takibi kapattığında, örtük kuralların onu geri açmadığını görmeli. Kapatırken satır
 * **yoksa da** yazılır: kapatma kaydı olmadan bir sonraki örtük tetikleyici takibi geri açardı.
 */
export async function setExplicitFollow(args: {
  channelId: string;
  client?: ThreadFollowWriteClient;
  following: boolean;
  parentMessageId: string;
  userId: string;
}) {
  const client = args.client ?? prisma;
  const mutedAt = args.following ? null : new Date();

  await client.threadFollow.upsert({
    where: {
      userId_parentMessageId: {
        parentMessageId: args.parentMessageId,
        userId: args.userId,
      },
    },
    create: {
      channelId: args.channelId,
      mutedAt,
      origin: "EXPLICIT",
      parentMessageId: args.parentMessageId,
      userId: args.userId,
    },
    update: args.following ? { mutedAt: null, origin: "EXPLICIT" } : { mutedAt },
  });

  return { following: args.following };
}

/** Fan-out'un alıcı kümesi: sessize alınmamış takipçiler. */
export async function listThreadFollowers(
  parentMessageId: string,
  options: { client?: ThreadFollowReadClient } = {},
): Promise<ThreadFollower[]> {
  const client = options.client ?? prisma;
  const rows = await client.threadFollow.findMany({
    where: { mutedAt: null, parentMessageId },
    select: { mutedAt: true, origin: true, userId: true },
  });

  return rows.map((row) => ({ origin: row.origin, userId: row.userId }));
}

/**
 * Üst mesaj yazarının bugünkü bildirimini korumak için gereken tek bilgi: bu kullanıcı thread'i
 * **bilerek** kapattı mı? Satırı olmayan (eski) thread'lerde cevap hayır ve bildirim düşmeye
 * devam eder (K3 kabul maddesi).
 */
export async function listMutedThreadFollowerIds(
  parentMessageId: string,
  options: { client?: ThreadFollowReadClient } = {},
): Promise<string[]> {
  const client = options.client ?? prisma;
  const rows = await client.threadFollow.findMany({
    where: { mutedAt: { not: null }, parentMessageId },
    select: { mutedAt: true, origin: true, userId: true },
  });

  return rows.map((row) => row.userId);
}

export async function isThreadFollowed(args: {
  client?: ThreadFollowReadClient;
  parentMessageId: string;
  userId: string;
}): Promise<boolean> {
  const client = args.client ?? prisma;
  const rows = await client.threadFollow.findMany({
    where: { mutedAt: null, parentMessageId: args.parentMessageId, userId: args.userId },
    select: { mutedAt: true, origin: true, userId: true },
    take: 1,
  });

  return rows.length > 0;
}
