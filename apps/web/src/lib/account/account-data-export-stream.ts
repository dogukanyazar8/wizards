import { ApiError } from "@/lib/api";

export const ACCOUNT_DATA_EXPORT_PAGE_SIZE = 250;

type ExportRow = { id: string } & Record<string, unknown>;

export type AccountDataExportSection = {
  close: string;
  loadPage(cursor: string | null, take: number): Promise<ExportRow[]>;
  open: string;
};

export type AccountDataExportHeader = {
  notificationSettings: unknown;
  settings: unknown;
  user: Record<string, unknown>;
};

export type AccountDataExportStreamSource = {
  loadHeader(userId: string): Promise<AccountDataExportHeader | null>;
  sections: AccountDataExportSection[];
};

type CreateAccountDataExportStreamOptions = {
  exportedAt?: Date;
  source?: AccountDataExportStreamSource;
};

function stringify(value: unknown) {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

async function pageById<T extends ExportRow>(
  load: (args: {
    cursor?: { id: string };
    orderBy: { id: "asc" };
    skip?: number;
    take: number;
  }) => Promise<T[]>,
  cursor: string | null,
  take: number,
) {
  return load({
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    take,
  });
}

async function createPrismaAccountDataExportSource(
  userId: string,
): Promise<AccountDataExportStreamSource> {
  const { prisma } = await import("@wizards/db");
  return {
    loadHeader: async () => {
      const [user, settings, notificationSettings] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            anonymizedAt: true,
            avatarUrl: true,
            bannerColor: true,
            bannerUrl: true,
            bio: true,
            createdAt: true,
            customStatus: true,
            deletedAt: true,
            displayName: true,
            email: true,
            emailVerified: true,
            emailVerifiedAt: true,
            id: true,
            isBanned: true,
            lastLoginAt: true,
            locale: true,
            phoneVerified: true,
            premiumSince: true,
            premiumType: true,
            pronouns: true,
            registeredAt: true,
            status: true,
            theme: true,
            username: true,
          },
        }),
        prisma.userSettings.findUnique({ where: { userId } }),
        prisma.userNotificationSettings.findUnique({ where: { userId } }),
      ]);

      return user ? { notificationSettings, settings, user } : null;
    },
    sections: [
      {
        open: ',"authentication":{"accounts":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.account.findMany({
                ...page,
                where: { userId },
                select: {
                  createdAt: true,
                  id: true,
                  provider: true,
                  providerAccountId: true,
                  scope: true,
                  type: true,
                  updatedAt: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"sessions":',
        close: "}",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.session.findMany({
                ...page,
                where: { userId },
                select: {
                  createdAt: true,
                  deviceType: true,
                  expiresAt: true,
                  id: true,
                  ipAddress: true,
                  userAgent: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"relationships":{"friendRequestsSent":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.friendRequest.findMany({
                ...page,
                where: { senderId: userId },
                select: {
                  createdAt: true,
                  id: true,
                  receiverId: true,
                  status: true,
                  updatedAt: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"friendRequestsReceived":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.friendRequest.findMany({
                ...page,
                where: { receiverId: userId },
                select: {
                  createdAt: true,
                  id: true,
                  senderId: true,
                  status: true,
                  updatedAt: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"serverMemberships":',
        close: "}",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.serverMember.findMany({
                ...page,
                where: { userId },
                select: {
                  id: true,
                  joinedAt: true,
                  nickname: true,
                  serverId: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"ownedServers":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.server.findMany({
                ...page,
                where: { ownerId: userId },
                select: { createdAt: true, id: true, name: true },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"content":{"attachments":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.attachment.findMany({
                ...page,
                where: { userId },
                select: {
                  contentType: true,
                  createdAt: true,
                  dmMessageId: true,
                  filename: true,
                  id: true,
                  messageId: true,
                  size: true,
                  url: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"authoredDMMessages":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.dMMessage.findMany({
                ...page,
                where: { userId },
                select: {
                  content: true,
                  conversationId: true,
                  createdAt: true,
                  deletedAt: true,
                  editedAt: true,
                  id: true,
                  threadParentId: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"authoredMessages":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.message.findMany({
                ...page,
                where: { userId },
                select: {
                  channelId: true,
                  content: true,
                  createdAt: true,
                  deletedAt: true,
                  editedAt: true,
                  id: true,
                  mentionEveryone: true,
                  threadParentId: true,
                  type: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"dmReactions":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.dMReaction.findMany({
                ...page,
                where: { userId },
                select: {
                  createdAt: true,
                  emoji: true,
                  emojiName: true,
                  id: true,
                  isCustom: true,
                  messageId: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"reactions":',
        close: "}",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.reaction.findMany({
                ...page,
                where: { userId },
                select: {
                  createdAt: true,
                  emoji: true,
                  emojiName: true,
                  id: true,
                  isCustom: true,
                  messageId: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"notifications":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.notification.findMany({
                ...page,
                where: { userId },
                select: {
                  actionUrl: true,
                  body: true,
                  createdAt: true,
                  id: true,
                  metadata: true,
                  read: true,
                  readAt: true,
                  title: true,
                  type: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"analytics":{"appSessions":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.appSession.findMany({
                ...page,
                where: { userId },
                select: {
                  browser: true,
                  clientType: true,
                  countryCode: true,
                  createdAt: true,
                  deviceType: true,
                  durationSeconds: true,
                  endedAt: true,
                  id: true,
                  os: true,
                  startedAt: true,
                },
              }),
            cursor,
            take,
          ),
      },
      {
        open: ',"dailyMetrics":',
        close: "",
        loadPage: (cursor, take) =>
          pageById(
            (page) => prisma.userDailyMetric.findMany({ ...page, where: { userId } }),
            cursor,
            take,
          ),
      },
      {
        open: ',"mediaUsageSessions":',
        close: "}",
        loadPage: (cursor, take) =>
          pageById(
            (page) =>
              prisma.mediaUsageSession.findMany({
                ...page,
                where: { userId },
                select: {
                  channelId: true,
                  createdAt: true,
                  durationSeconds: true,
                  endedAt: true,
                  id: true,
                  kind: true,
                  serverId: true,
                  startedAt: true,
                },
              }),
            cursor,
            take,
          ),
      },
    ],
  };
}

export async function createAccountDataExportStream(
  userId: string,
  options: CreateAccountDataExportStreamOptions = {},
) {
  const source = options.source ?? (await createPrismaAccountDataExportSource(userId));
  const header = await source.loadHeader(userId);
  if (!header) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }
  const exportHeader = header;

  const exportedAt = options.exportedAt ?? new Date();
  const encoder = new TextEncoder();
  async function* chunks(): AsyncGenerator<Uint8Array> {
    const documentHeader = {
      schemaVersion: 2,
      exportedAt,
      user: exportHeader.user,
      preferences: {
        notificationSettings: exportHeader.notificationSettings,
        settings: exportHeader.settings,
      },
    };
    yield encoder.encode(stringify(documentHeader).slice(0, -1));

    for (const [sectionIndex, section] of source.sections.entries()) {
      const open =
        sectionIndex === 0 && !section.open.startsWith(",") ? `,${section.open}` : section.open;
      yield encoder.encode(open);
      yield encoder.encode("[");
      let cursor: string | null = null;
      let first = true;

      while (true) {
        const page = await section.loadPage(cursor, ACCOUNT_DATA_EXPORT_PAGE_SIZE);
        for (const row of page) {
          yield encoder.encode(`${first ? "" : ","}${stringify(row)}`);
          first = false;
        }
        if (page.length < ACCOUNT_DATA_EXPORT_PAGE_SIZE) break;
        cursor = page.at(-1)?.id ?? null;
        if (!cursor) {
          throw new ApiError("Account export cursor was invalid", 500, "EXPORT_CURSOR_INVALID");
        }
      }

      yield encoder.encode(`]${section.close}`);
    }

    yield encoder.encode("}");
  }

  const iterator = chunks();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
