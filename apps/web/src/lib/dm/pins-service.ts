import { prisma } from "@wizards/db";
import {
  DM_PINNED_MESSAGE_MAX,
  GROUP_PINNED_EXCERPT_MAX_LENGTH,
  type PinnedMessageDTO,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import { toHistoryWindowFilter, toUnexpiredFilter } from "@/lib/dm/service";

/**
 * Mesajlar paketi karar #7 — bir sohbette birden çok sabitlenen mesaj.
 *
 * Eskisi `DMConversation.pinnedMessageId`'ydi: tek satır, yalnız gruplarda ve
 * yalnız yöneticilerde. SPEC §5.2 ise grupta "2 sabitlenen mesaj" ve DM'de
 * "1 sabitlenen mesaj" gösteriyor, ikisinde de "Tümünü gör" ile.
 *
 * **Yetki sorgunun içindedir.** Her okuma ve yazma, konuşmayı görüntüleyenin
 * katılımcı satırıyla birlikte çeker; katılımcı olmayan hiçbir satır bulamaz ve
 * varlık sızdırmayan 404 oradan gelir. "Önce konuşmayı yükle, sonra üyeliği kontrol et" yazılmaz —
 * sızıntı yüzeyi tam olarak o iki adımın arasındadır.
 */

/** Sabitleme izni: 1:1 DM'de her iki taraf, grupta `permPinMessage`. */
type PinContext = {
  readonly canPin: boolean;
  readonly historyFromAt: Date | null;
  readonly isGroup: boolean;
};

export type PinRow = {
  readonly messageId: string;
  readonly pinnedAt: Date;
  readonly pinnedById: string;
  readonly message: {
    readonly content: string;
    readonly createdAt: Date;
    readonly deletedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly author: { readonly displayName: string | null; readonly username: string };
  };
};

export type PinsServiceDependencies = {
  deletePin(input: { conversationId: string; messageId: string }): Promise<number>;
  insertPin(input: {
    conversationId: string;
    messageId: string;
    pinnedById: string;
  }): Promise<void>;
  loadContext(input: { conversationId: string; viewerId: string }): Promise<PinContext | null>;
  loadPinnableMessage(input: {
    conversationId: string;
    historyFromAt: Date | null;
    messageId: string;
    now: Date;
  }): Promise<{ createdAt: Date } | null>;
  loadPins(input: {
    conversationId: string;
    historyFromAt: Date | null;
    now: Date;
  }): Promise<PinRow[]>;
  now(): Date;
};

const PIN_MESSAGE_SELECT = {
  messageId: true,
  pinnedAt: true,
  pinnedById: true,
  message: {
    select: {
      content: true,
      createdAt: true,
      deletedAt: true,
      expiresAt: true,
      author: { select: { displayName: true, username: true } },
    },
  },
} as const;

const defaults: PinsServiceDependencies = {
  deletePin: async ({ conversationId, messageId }) => {
    const result = await prisma.dMPinnedMessage.deleteMany({
      where: { conversationId, messageId },
    });
    return result.count;
  },

  insertPin: async ({ conversationId, messageId, pinnedById }) => {
    // Pinning the same message twice is the same pin, not a second one. The
    // unique index says so; `skipDuplicates` keeps a double tap from being a 500.
    await prisma.dMPinnedMessage.createMany({
      data: [{ conversationId, messageId, pinnedById }],
      skipDuplicates: true,
    });
  },

  loadContext: async ({ conversationId, viewerId }) => {
    const conversation = await prisma.dMConversation.findFirst({
      where: { id: conversationId, participants: { some: { userId: viewerId } } },
      select: {
        type: true,
        permPinMessage: true,
        participants: {
          where: { userId: viewerId },
          select: { historyFromAt: true, role: true },
        },
      },
    });

    const viewer = conversation?.participants[0];

    if (!conversation || !viewer) {
      return null;
    }

    const isGroup = conversation.type === "GROUP_DM";

    return {
      // A 1:1 DM has no admin tier, so the group permission has nothing to say
      // about it: both sides may pin, the way both sides may send.
      canPin:
        !isGroup ||
        conversation.permPinMessage === "ALL" ||
        viewer.role === "OWNER" ||
        viewer.role === "ADMIN",
      historyFromAt: viewer.historyFromAt,
      isGroup,
    };
  },

  loadPinnableMessage: ({ conversationId, historyFromAt, messageId, now }) =>
    prisma.dMMessage.findFirst({
      // Scoped to the conversation on purpose: a message id from elsewhere would
      // pin content these members may not read, and the foreign key alone would
      // accept it happily.
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        placeholderRemovedAt: null,
        ...toHistoryWindowFilter(historyFromAt, null),
        ...toUnexpiredFilter(now),
      },
      select: { createdAt: true },
    }),

  loadPins: ({ conversationId, historyFromAt, now }) =>
    prisma.dMPinnedMessage.findMany({
      where: {
        conversationId,
        message: {
          deletedAt: null,
          placeholderRemovedAt: null,
          ...toHistoryWindowFilter(historyFromAt, null),
          ...toUnexpiredFilter(now),
        },
      },
      orderBy: { pinnedAt: "desc" },
      take: DM_PINNED_MESSAGE_MAX,
      select: PIN_MESSAGE_SELECT,
    }),

  now: () => new Date(),
};

function toExcerpt(content: string): string {
  const flattened = content.replace(/\s+/g, " ").trim();

  return flattened.length > GROUP_PINNED_EXCERPT_MAX_LENGTH
    ? `${flattened.slice(0, GROUP_PINNED_EXCERPT_MAX_LENGTH)}…`
    : flattened;
}

async function requireContext(
  conversationId: string,
  viewerId: string,
  dependencies: PinsServiceDependencies,
): Promise<PinContext> {
  const context = await dependencies.loadContext({ conversationId, viewerId });

  if (!context) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  return context;
}

/**
 * Sabitlenenler, en yeniden eskiye.
 *
 * İki eleme okuma anında yapılır:
 *
 * - **Silinmiş mesaj** hiç çizilmez. Mesaj listesi onun yerine "silinmiş mesaj"
 *   yer tutucusu gösterir, ama şeritte alıntılamak silinmiş içeriği ekrana geri
 *   koymak olurdu.
 * - **`historyFromAt` öncesi** sabit, o üyenin okumasına izin verilmeyen bir
 *   mesajdır. Sabitlenmiş olması onu görünür kılmaz; gruba sonradan katılan
 *   biri için geçmiş penceresi sabitlemeyi de kapsar.
 */
export async function listConversationPins(
  conversationId: string,
  viewerId: string,
  dependencies: PinsServiceDependencies = defaults,
): Promise<PinnedMessageDTO[]> {
  const context = await requireContext(conversationId, viewerId, dependencies);
  const now = dependencies.now();
  const rows = await dependencies.loadPins({
    conversationId,
    historyFromAt: context.historyFromAt,
    now,
  });

  return rows
    .filter((row) => row.message.deletedAt === null)
    .filter((row) => row.message.expiresAt === null || row.message.expiresAt > now)
    .filter((row) => !context.historyFromAt || row.message.createdAt >= context.historyFromAt)
    .map((row) => ({
      authorName: row.message.author.displayName ?? row.message.author.username,
      excerpt: toExcerpt(row.message.content),
      messageId: row.messageId,
      pinnedAt: row.pinnedAt.toISOString(),
      removable: context.canPin,
    }));
}

export async function pinConversationMessage(
  conversationId: string,
  messageId: string,
  viewerId: string,
  dependencies: PinsServiceDependencies = defaults,
): Promise<PinnedMessageDTO[]> {
  const context = await requireContext(conversationId, viewerId, dependencies);

  if (!context.canPin) {
    throw new ApiError("Only admins can pin messages in this group", 403, "FORBIDDEN");
  }

  const now = dependencies.now();
  const message = await dependencies.loadPinnableMessage({
    conversationId,
    historyFromAt: context.historyFromAt,
    messageId,
    now,
  });

  if (!message) {
    throw new ApiError("Message not found in this conversation", 404, "NOT_FOUND");
  }

  // `loadPins` already takes the ceiling, so its length *is* the count as far as
  // this check is concerned — no second counting query.
  //
  // Re-pinning a message already pinned is a no-op, so it must not be refused at
  // the ceiling: nothing is being added. The viewer history floor is null here:
  // a pin hidden only from this viewer still occupies a conversation slot.
  const existing = await dependencies.loadPins({
    conversationId,
    historyFromAt: null,
    now,
  });

  if (
    !existing.some((row) => row.messageId === messageId) &&
    existing.length >= DM_PINNED_MESSAGE_MAX
  ) {
    throw new ApiError(
      `A conversation can pin at most ${DM_PINNED_MESSAGE_MAX} messages`,
      400,
      "PINS_FULL",
    );
  }

  await dependencies.insertPin({ conversationId, messageId, pinnedById: viewerId });

  return await listConversationPins(conversationId, viewerId, dependencies);
}

export async function unpinConversationMessage(
  conversationId: string,
  messageId: string,
  viewerId: string,
  dependencies: PinsServiceDependencies = defaults,
): Promise<PinnedMessageDTO[]> {
  const context = await requireContext(conversationId, viewerId, dependencies);

  if (!context.canPin) {
    throw new ApiError("Only admins can unpin messages in this group", 403, "FORBIDDEN");
  }

  const message = await dependencies.loadPinnableMessage({
    conversationId,
    historyFromAt: context.historyFromAt,
    messageId,
    now: dependencies.now(),
  });

  if (!message) {
    throw new ApiError("Message not found in this conversation", 404, "NOT_FOUND");
  }

  const removed = await dependencies.deletePin({ conversationId, messageId });

  if (removed === 0) {
    throw new ApiError("That message is not pinned", 404, "NOT_FOUND");
  }

  return await listConversationPins(conversationId, viewerId, dependencies);
}
