import { Prisma, prisma } from "@wizards/db";
import {
  ADMIN_FEEDBACK_PAGE_SIZE,
  AdminFeedbackDetailResponseSchema,
  AdminFeedbackListResponseSchema,
  AdminRoadmapItemResponseSchema,
  AdminRoadmapListResponseSchema,
  MOBILE_FEEDBACK_LIST_MAX_COUNT,
  MOBILE_ROADMAP_PREVIEW_COUNT,
  MobileFeedbackDetailResponseSchema,
  MobileFeedbackDiagnosticsSchema,
  MobileFeedbackListResponseSchema,
  MobileFeedbackSubmitResponseSchema,
  MobileRoadmapListResponseSchema,
  MobileRoadmapVoteResponseSchema,
  formatFeedbackPublicNumber,
  type AdminFeedbackDetailResponse,
  type AdminFeedbackListResponse,
  type AdminFeedbackUpdateRequest,
  type AdminRoadmapCreateRequest,
  type AdminRoadmapItemResponse,
  type AdminRoadmapListResponse,
  type AdminRoadmapUpdateRequest,
  type FeedbackStatus,
  type FeedbackTopic,
  type MobileFeedbackDetailResponse,
  type MobileFeedbackListResponse,
  type MobileFeedbackSubmitRequest,
  type MobileFeedbackSubmitResponse,
  type MobileRoadmapItem,
  type MobileRoadmapListResponse,
  type MobileRoadmapVoteResponse,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { claimMobileFeedbackAttachmentUploads } from "@/lib/mobile/mobile-media-upload-service";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { getSocketServer } from "@/lib/socket/runtime";
import { serializeWorkspaceNotification } from "@/lib/workspace/workspace-events";
import {
  buildFeedbackPreview,
  compareRoadmapItems,
  resolveMobileRoadmapPreview,
  shouldNotifyFeedbackStatusChange,
} from "./feedback-model";

const FEEDBACK_STATUS_MESSAGE_KEYS = {
  IN_PROGRESS: "feedback.status.inProgress",
  PLANNED: "feedback.status.planned",
  REVIEWING: "feedback.status.reviewing",
  SHIPPED: "feedback.status.shipped",
} as const satisfies Record<FeedbackStatus, string>;

const feedbackSummarySelect = {
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { height: true, id: true, url: true, width: true },
  },
  createdAt: true,
  id: true,
  message: true,
  publicNumber: true,
  rating: true,
  roadmapItemId: true,
  status: true,
  statusChangedAt: true,
  topic: true,
} satisfies Prisma.FeedbackSelect;

type FeedbackSummaryRow = Prisma.FeedbackGetPayload<{ select: typeof feedbackSummarySelect }>;

type RoadmapRow = {
  _count: { votes: number };
  createdAt: Date;
  description: string | null;
  featured: boolean;
  id: string;
  position: number;
  status: FeedbackStatus;
  title: string;
  updatedAt: Date;
  versionLabel: string | null;
};

function toFeedbackSummary(row: FeedbackSummaryRow) {
  return {
    attachments: row.attachments.map((attachment) => ({
      height: attachment.height,
      id: attachment.id,
      url: attachment.url,
      width: attachment.width,
    })),
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    message: row.message,
    publicNumber: row.publicNumber,
    rating: row.rating,
    roadmapItemId: row.roadmapItemId,
    status: row.status,
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    topic: row.topic,
  };
}

function toMobileRoadmapItem(
  row: RoadmapRow,
  viewer: { ownItemIds: ReadonlySet<string>; votedItemIds: ReadonlySet<string> },
): MobileRoadmapItem {
  return {
    description: row.description,
    id: row.id,
    isOwnSuggestion: viewer.ownItemIds.has(row.id),
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    versionLabel: row.versionLabel,
    voteCount: row._count.votes,
    votedByViewer: viewer.votedItemIds.has(row.id),
  };
}

/**
 * The roadmap is one query for everyone plus two viewer-scoped lookups: which
 * rows the viewer voted on, and which rows their own feedback feeds. Reading
 * those separately keeps the shared list cacheable and stops "senin önerin"
 * from needing a join per row.
 */
async function readMobileRoadmap(
  client: typeof prisma,
  userId: string,
): Promise<MobileRoadmapItem[]> {
  const [rows, votes, ownLinks] = await Promise.all([
    client.roadmapItem.findMany({
      select: {
        _count: { select: { votes: true } },
        createdAt: true,
        description: true,
        featured: true,
        id: true,
        position: true,
        status: true,
        title: true,
        updatedAt: true,
        versionLabel: true,
      },
      take: 200,
    }),
    client.roadmapVote.findMany({ select: { roadmapItemId: true }, where: { userId } }),
    client.feedback.findMany({
      distinct: ["roadmapItemId"],
      select: { roadmapItemId: true },
      where: { roadmapItemId: { not: null }, userId },
    }),
  ]);

  const votedItemIds = new Set(votes.map((vote) => vote.roadmapItemId));
  const ownItemIds = new Set(
    ownLinks.flatMap((link) => (link.roadmapItemId === null ? [] : [link.roadmapItemId])),
  );

  return rows
    .slice()
    .sort((left, right) =>
      compareRoadmapItems(
        {
          createdAt: left.createdAt.toISOString(),
          featured: left.featured,
          position: left.position,
          voteCount: left._count.votes,
        },
        {
          createdAt: right.createdAt.toISOString(),
          featured: right.featured,
          position: right.position,
          voteCount: right._count.votes,
        },
      ),
    )
    .map((row) => toMobileRoadmapItem(row, { ownItemIds, votedItemIds }));
}

export async function submitMobileFeedback(
  userId: string,
  input: MobileFeedbackSubmitRequest,
  client: typeof prisma = prisma,
): Promise<MobileFeedbackSubmitResponse> {
  const now = new Date();
  const diagnostics =
    input.diagnostics === null ? null : MobileFeedbackDiagnosticsSchema.parse(input.diagnostics);

  const created = await client.$transaction(async (tx) => {
    // Claimed inside the transaction: a submission either keeps its message and
    // its screenshots or neither, and a replayed claim id cannot ride along.
    const attachments = await claimMobileFeedbackAttachmentUploads(tx, {
      claimIds: input.attachmentClaimIds,
      now,
      userId,
    });

    return tx.feedback.create({
      data: {
        attachments: {
          create: attachments.map((attachment) => ({
            contentType: attachment.contentType,
            height: attachment.height,
            sizeBytes: attachment.sizeBytes,
            uploadId: attachment.uploadId,
            url: attachment.url,
            width: attachment.width,
          })),
        },
        ...(diagnostics === null
          ? {}
          : { diagnostics: diagnostics as unknown as Prisma.InputJsonValue }),
        message: input.message,
        rating: input.rating,
        topic: input.topic,
        userId,
      },
      select: feedbackSummarySelect,
    });
  });

  const roadmap = await readMobileRoadmap(client, userId);

  return MobileFeedbackSubmitResponseSchema.parse({
    feedback: toFeedbackSummary(created),
    roadmap: resolveMobileRoadmapPreview(roadmap, MOBILE_ROADMAP_PREVIEW_COUNT),
  });
}

export async function getMobileFeedbackDetail(
  userId: string,
  feedbackId: string,
  client: typeof prisma = prisma,
): Promise<MobileFeedbackDetailResponse> {
  const feedback = await client.feedback.findFirst({
    select: feedbackSummarySelect,
    // Scoped to the owner: a tracking view is the author's own receipt, and a
    // guessed id must not hand someone else's report to a stranger.
    where: { id: feedbackId, userId },
  });

  if (!feedback) {
    throw new ApiError("Feedback not found", 404, "FEEDBACK_NOT_FOUND");
  }

  const roadmap = await readMobileRoadmap(client, userId);

  return MobileFeedbackDetailResponseSchema.parse({
    feedback: toFeedbackSummary(feedback),
    roadmap: resolveMobileRoadmapPreview(roadmap, MOBILE_ROADMAP_PREVIEW_COUNT),
  });
}

/**
 * The "Bildirdiklerim" tab: the viewer's own reports, newest first, one line of
 * message each. The whole message, the diagnostics blob and the screenshots stay
 * behind the detail route — a list row does not need them and shipping them
 * would make a hundred-row response carry a hundred diagnostics payloads.
 */
export async function listMobileFeedback(
  userId: string,
  client: typeof prisma = prisma,
): Promise<MobileFeedbackListResponse> {
  const rows = await client.feedback.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      id: true,
      message: true,
      publicNumber: true,
      rating: true,
      roadmapItem: { select: { versionLabel: true } },
      status: true,
      statusChangedAt: true,
      topic: true,
    },
    take: MOBILE_FEEDBACK_LIST_MAX_COUNT,
    where: { userId },
  });

  return MobileFeedbackListResponseSchema.parse({
    items: rows.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      preview: buildFeedbackPreview(row.message),
      publicNumber: row.publicNumber,
      rating: row.rating,
      status: row.status,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      topic: row.topic,
      versionLabel: row.roadmapItem?.versionLabel ?? null,
    })),
  });
}

export async function listMobileRoadmap(
  userId: string,
  client: typeof prisma = prisma,
): Promise<MobileRoadmapListResponse> {
  return MobileRoadmapListResponseSchema.parse({ items: await readMobileRoadmap(client, userId) });
}

export async function setMobileRoadmapVote(
  userId: string,
  roadmapItemId: string,
  voted: boolean,
  client: typeof prisma = prisma,
): Promise<MobileRoadmapVoteResponse> {
  const exists = await client.roadmapItem.findUnique({
    select: { id: true },
    where: { id: roadmapItemId },
  });
  if (!exists) {
    throw new ApiError("Roadmap item not found", 404, "ROADMAP_ITEM_NOT_FOUND");
  }

  // The request carries the desired end state, so a retried tap settles on the
  // same row rather than toggling twice.
  if (voted) {
    await client.roadmapVote.create({ data: { roadmapItemId, userId } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    });
  } else {
    await client.roadmapVote.deleteMany({ where: { roadmapItemId, userId } });
  }

  const roadmap = await readMobileRoadmap(client, userId);
  const item = roadmap.find((entry) => entry.id === roadmapItemId);
  if (!item) {
    throw new ApiError("Roadmap item not found", 404, "ROADMAP_ITEM_NOT_FOUND");
  }

  return MobileRoadmapVoteResponseSchema.parse({ item });
}

/* ---------------------------------------------------------------- admin --- */

export type AdminFeedbackListFilters = {
  cursor?: string | null;
  query?: string | null;
  rating?: "ALL" | "BAD" | "GOOD" | "GREAT" | "OKAY";
  status?: "ALL" | FeedbackStatus;
  topic?: "ALL" | FeedbackTopic;
};

function buildAdminFeedbackWhere(filters: AdminFeedbackListFilters): Prisma.FeedbackWhereInput {
  const search = filters.query?.trim() ?? "";
  const publicNumber = Number.parseInt(search.replace(/^WSP-/i, ""), 10);

  return {
    ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.topic && filters.topic !== "ALL" ? { topic: filters.topic } : {}),
    ...(filters.rating && filters.rating !== "ALL" ? { rating: filters.rating } : {}),
    ...(search
      ? {
          OR: [
            { message: { contains: search, mode: "insensitive" as const } },
            { user: { username: { contains: search, mode: "insensitive" as const } } },
            // "WSP-1284" and "1284" both find the same report.
            ...(Number.isFinite(publicNumber) ? [{ publicNumber }] : []),
          ],
        }
      : {}),
  };
}

export async function listAdminFeedback(
  filters: AdminFeedbackListFilters,
  client: typeof prisma = prisma,
): Promise<AdminFeedbackListResponse> {
  const where = buildAdminFeedbackWhere(filters);
  const [rows, total] = await Promise.all([
    client.feedback.findMany({
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        _count: { select: { attachments: true } },
        createdAt: true,
        id: true,
        message: true,
        publicNumber: true,
        rating: true,
        roadmapItemId: true,
        status: true,
        topic: true,
        user: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
      },
      take: ADMIN_FEEDBACK_PAGE_SIZE + 1,
      where,
    }),
    client.feedback.count({ where }),
  ]);

  const page = rows.slice(0, ADMIN_FEEDBACK_PAGE_SIZE);

  return AdminFeedbackListResponseSchema.parse({
    items: page.map((row) => ({
      attachmentCount: row._count.attachments,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      preview: buildFeedbackPreview(row.message),
      publicNumber: row.publicNumber,
      rating: row.rating,
      roadmapItemId: row.roadmapItemId,
      status: row.status,
      topic: row.topic,
      user: row.user,
    })),
    nextCursor: rows.length > ADMIN_FEEDBACK_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
    total,
  });
}

export async function getAdminFeedbackDetail(
  feedbackId: string,
  client: typeof prisma = prisma,
): Promise<AdminFeedbackDetailResponse> {
  const row = await client.feedback.findUnique({
    select: {
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { height: true, id: true, url: true, width: true },
      },
      createdAt: true,
      diagnostics: true,
      id: true,
      message: true,
      publicNumber: true,
      rating: true,
      roadmapItemId: true,
      status: true,
      statusChangedAt: true,
      topic: true,
      updatedAt: true,
      user: {
        select: {
          _count: { select: { feedback: true } },
          avatarUrl: true,
          displayName: true,
          id: true,
          registeredAt: true,
          username: true,
        },
      },
    },
    where: { id: feedbackId },
  });

  if (!row) {
    throw new ApiError("Feedback not found", 404, "FEEDBACK_NOT_FOUND");
  }

  // Stored diagnostics predate any later contract change, so a snapshot that no
  // longer parses is shown as absent rather than failing the whole detail read.
  const diagnostics = MobileFeedbackDiagnosticsSchema.safeParse(row.diagnostics);

  return AdminFeedbackDetailResponseSchema.parse({
    feedback: {
      attachments: row.attachments,
      createdAt: row.createdAt.toISOString(),
      diagnostics: diagnostics.success ? diagnostics.data : null,
      id: row.id,
      message: row.message,
      publicNumber: row.publicNumber,
      rating: row.rating,
      roadmapItemId: row.roadmapItemId,
      status: row.status,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      topic: row.topic,
      updatedAt: row.updatedAt.toISOString(),
      user: {
        avatarUrl: row.user.avatarUrl,
        displayName: row.user.displayName,
        feedbackCount: row.user._count.feedback,
        id: row.user.id,
        registeredAt: row.user.registeredAt.toISOString(),
        username: row.user.username,
      },
    },
  });
}

export type FeedbackNotificationDependencies = {
  emitSocket: (userId: string, payload: ReturnType<typeof serializeWorkspaceNotification>) => void;
  sendPush: typeof sendMobilePushForNotifications;
};

const defaultNotificationDependencies: FeedbackNotificationDependencies = {
  emitSocket(userId, payload) {
    getSocketServer()?.to(`user:${userId}`).emit("notification:new", payload);
  },
  sendPush: sendMobilePushForNotifications,
};

/**
 * Status changes reach the author through the notification pipeline every other
 * product event already uses — row, socket push, mobile push — so a feedback
 * update behaves exactly like a mention in the list, the badge and the tray.
 */
async function notifyFeedbackStatusChange(
  input: {
    feedbackId: string;
    publicNumber: number;
    status: FeedbackStatus;
    userId: string;
  },
  client: typeof prisma,
  dependencies: FeedbackNotificationDependencies,
) {
  const target = await client.user.findUnique({
    select: { locale: true },
    where: { id: input.userId },
  });
  const locale = normalizeAppLocale(target?.locale ?? null);
  const number = formatFeedbackPublicNumber(input.publicNumber);
  const status = translate(locale, FEEDBACK_STATUS_MESSAGE_KEYS[input.status]);

  const notification = await client.notification.create({
    data: {
      actionUrl: `/feedback/${input.feedbackId}`,
      body: translate(locale, "feedback.notification.body", { status }),
      metadata: { feedbackId: input.feedbackId, status },
      title: translate(locale, "feedback.notification.title", { number, status }),
      type: "FEEDBACK",
      userId: input.userId,
    },
  });

  dependencies.emitSocket(input.userId, serializeWorkspaceNotification(notification));
  void dependencies.sendPush([notification]);
}

export async function updateAdminFeedback(
  feedbackId: string,
  input: AdminFeedbackUpdateRequest,
  client: typeof prisma = prisma,
  dependencies: FeedbackNotificationDependencies = defaultNotificationDependencies,
): Promise<AdminFeedbackDetailResponse> {
  const current = await client.feedback.findUnique({
    select: { publicNumber: true, roadmapItemId: true, status: true, userId: true },
    where: { id: feedbackId },
  });
  if (!current) {
    throw new ApiError("Feedback not found", 404, "FEEDBACK_NOT_FOUND");
  }

  const nextStatus = input.status;
  const notifies = shouldNotifyFeedbackStatusChange(current.status, nextStatus);
  const now = new Date();

  await client.$transaction(async (tx) => {
    if (input.roadmapItemId) {
      const target = await tx.roadmapItem.findUnique({
        select: { id: true },
        where: { id: input.roadmapItemId },
      });
      if (!target) {
        throw new ApiError("Roadmap item not found", 404, "ROADMAP_ITEM_NOT_FOUND");
      }
    }

    await tx.feedback.update({
      data: {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(notifies ? { statusChangedAt: now } : {}),
        ...(input.roadmapItemId === undefined ? {} : { roadmapItemId: input.roadmapItemId }),
      },
      where: { id: feedbackId },
    });

    // Linking a report to a roadmap row makes its author a supporter of that
    // row: they asked for it, so the vote they would obviously cast is recorded
    // once. `createMany`+skipDuplicates keeps a re-link from stacking votes.
    if (input.roadmapItemId) {
      await tx.roadmapVote.createMany({
        data: [{ roadmapItemId: input.roadmapItemId, userId: current.userId }],
        skipDuplicates: true,
      });
    }
  });

  if (notifies) {
    await notifyFeedbackStatusChange(
      {
        feedbackId,
        publicNumber: current.publicNumber,
        status: nextStatus,
        userId: current.userId,
      },
      client,
      dependencies,
    );
  }

  return getAdminFeedbackDetail(feedbackId, client);
}

const adminRoadmapSelect = {
  _count: { select: { feedback: true, votes: true } },
  createdAt: true,
  description: true,
  featured: true,
  id: true,
  position: true,
  status: true,
  title: true,
  versionLabel: true,
} satisfies Prisma.RoadmapItemSelect;

type AdminRoadmapRow = Prisma.RoadmapItemGetPayload<{ select: typeof adminRoadmapSelect }>;

function toAdminRoadmapItem(row: AdminRoadmapRow) {
  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    featured: row.featured,
    feedbackCount: row._count.feedback,
    id: row.id,
    position: row.position,
    status: row.status,
    title: row.title,
    versionLabel: row.versionLabel,
    voteCount: row._count.votes,
  };
}

export async function listAdminRoadmap(
  client: typeof prisma = prisma,
): Promise<AdminRoadmapListResponse> {
  const rows = await client.roadmapItem.findMany({
    orderBy: [{ featured: "desc" }, { position: "asc" }, { createdAt: "desc" }],
    select: adminRoadmapSelect,
    take: 200,
  });

  return AdminRoadmapListResponseSchema.parse({ items: rows.map(toAdminRoadmapItem) });
}

export async function createAdminRoadmapItem(
  input: AdminRoadmapCreateRequest,
  client: typeof prisma = prisma,
): Promise<AdminRoadmapItemResponse> {
  const row = await client.roadmapItem.create({
    data: {
      description: input.description ?? null,
      featured: input.featured ?? false,
      position: input.position ?? 0,
      status: input.status ?? "REVIEWING",
      title: input.title,
      versionLabel: input.versionLabel ?? null,
    },
    select: adminRoadmapSelect,
  });

  return AdminRoadmapItemResponseSchema.parse({ item: toAdminRoadmapItem(row) });
}

export async function updateAdminRoadmapItem(
  roadmapItemId: string,
  input: AdminRoadmapUpdateRequest,
  client: typeof prisma = prisma,
): Promise<AdminRoadmapItemResponse> {
  const exists = await client.roadmapItem.findUnique({
    select: { id: true },
    where: { id: roadmapItemId },
  });
  if (!exists) {
    throw new ApiError("Roadmap item not found", 404, "ROADMAP_ITEM_NOT_FOUND");
  }

  const row = await client.roadmapItem.update({
    data: {
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.featured === undefined ? {} : { featured: input.featured }),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.versionLabel === undefined ? {} : { versionLabel: input.versionLabel }),
    },
    select: adminRoadmapSelect,
    where: { id: roadmapItemId },
  });

  return AdminRoadmapItemResponseSchema.parse({ item: toAdminRoadmapItem(row) });
}
