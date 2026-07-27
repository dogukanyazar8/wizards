import type { FeedbackTopic, Prisma, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { writeAdminAuditLog } from "@/lib/admin/access";
import { updateAdminFeedback } from "@/lib/feedback/feedback-service";
import { proposeClusters, type ClusterInput } from "@/lib/feedback/clustering";

const RECOMPUTE_SCAN_LIMIT = 500;
const PREVIEW_LENGTH = 160;

export type ClusterServiceStore = Pick<PrismaClient, "feedback" | "feedbackClusterSuggestion">;

export type ClusterSuggestionDependencies = {
  linkFeedbackToRoadmapItem(feedbackId: string, roadmapItemId: string): Promise<unknown>;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: ClusterSuggestionDependencies = {
  linkFeedbackToRoadmapItem: (feedbackId, roadmapItemId) =>
    updateAdminFeedback(feedbackId, { roadmapItemId }),
  writeAuditLog: writeAdminAuditLog,
};

function readFeedbackIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Replaces the open proposals with a fresh pass. Accepted and rejected rows
 * stay: they are the record of what an operator already decided.
 */
export async function recomputeClusterSuggestions(client: ClusterServiceStore = prisma) {
  const feedback = await client.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: RECOMPUTE_SCAN_LIMIT,
    where: { roadmapItemId: null },
    select: { id: true, message: true, topic: true },
  });

  const candidates = proposeClusters(feedback as ClusterInput[]);

  await client.feedbackClusterSuggestion.deleteMany({ where: { status: "PENDING" } });

  for (const candidate of candidates) {
    await client.feedbackClusterSuggestion.create({
      data: {
        feedbackIds: candidate.feedbackIds as unknown as Prisma.InputJsonValue,
        score: candidate.score,
        topic: candidate.topic,
      },
    });
  }

  return { suggested: candidates.length };
}

export async function listClusterSuggestions(client: ClusterServiceStore = prisma) {
  const suggestions = await client.feedbackClusterSuggestion.findMany({
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    where: { status: "PENDING" },
    select: { createdAt: true, feedbackIds: true, id: true, score: true, topic: true },
  });

  const allIds = suggestions.flatMap((suggestion) => readFeedbackIds(suggestion.feedbackIds));
  const members =
    allIds.length === 0
      ? []
      : await client.feedback.findMany({
          where: { id: { in: allIds } },
          select: { id: true, message: true, publicNumber: true },
        });
  const memberById = new Map(members.map((member) => [member.id, member]));

  return suggestions.map((suggestion) => {
    const feedbackIds = readFeedbackIds(suggestion.feedbackIds);

    return {
      createdAt: suggestion.createdAt.toISOString(),
      id: suggestion.id,
      memberCount: feedbackIds.length,
      members: feedbackIds.flatMap((feedbackId) => {
        const member = memberById.get(feedbackId);

        return member
          ? [
              {
                id: member.id,
                preview: member.message.slice(0, PREVIEW_LENGTH),
                publicNumber: member.publicNumber,
              },
            ]
          : [];
      }),
      score: suggestion.score,
      topic: suggestion.topic as FeedbackTopic,
    };
  });
}

async function requireSuggestion(suggestionId: string, client: ClusterServiceStore) {
  const suggestion = await client.feedbackClusterSuggestion.findUnique({
    where: { id: suggestionId },
    select: { feedbackIds: true, id: true, status: true, topic: true },
  });

  if (!suggestion) {
    throw new ApiError("Cluster suggestion not found.", 404, "NOT_FOUND");
  }

  if (suggestion.status !== "PENDING") {
    throw new ApiError("This suggestion was already resolved.", 409, "ALREADY_RESOLVED");
  }

  return suggestion;
}

/**
 * Accepting is the only path that touches feedback rows, and it reuses the
 * existing admin update so the submitter's status notification still fires.
 */
export async function acceptClusterSuggestion(
  args: {
    adminUserId: string;
    headers?: Headers | Record<string, string | string[] | undefined> | null;
    roadmapItemId: string;
    suggestionId: string;
  },
  client: ClusterServiceStore = prisma,
  dependencies: ClusterSuggestionDependencies = defaultDependencies,
) {
  const suggestion = await requireSuggestion(args.suggestionId, client);
  const feedbackIds = readFeedbackIds(suggestion.feedbackIds);

  for (const feedbackId of feedbackIds) {
    await dependencies.linkFeedbackToRoadmapItem(feedbackId, args.roadmapItemId);
  }

  await client.feedbackClusterSuggestion.update({
    data: { resolvedAt: new Date(), resolvedById: args.adminUserId, status: "ACCEPTED" },
    where: { id: args.suggestionId },
  });

  await dependencies.writeAuditLog({
    action: "feedback.cluster.accept",
    adminUserId: args.adminUserId,
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    metadata: { feedbackIds, roadmapItemId: args.roadmapItemId },
    targetId: args.suggestionId,
    targetType: "FeedbackClusterSuggestion",
  });

  return { linkedCount: feedbackIds.length, suggestionId: args.suggestionId };
}

export async function rejectClusterSuggestion(
  args: {
    adminUserId: string;
    headers?: Headers | Record<string, string | string[] | undefined> | null;
    suggestionId: string;
  },
  client: ClusterServiceStore = prisma,
  dependencies: ClusterSuggestionDependencies = defaultDependencies,
) {
  await requireSuggestion(args.suggestionId, client);

  await client.feedbackClusterSuggestion.update({
    data: { resolvedAt: new Date(), resolvedById: args.adminUserId, status: "REJECTED" },
    where: { id: args.suggestionId },
  });

  await dependencies.writeAuditLog({
    action: "feedback.cluster.reject",
    adminUserId: args.adminUserId,
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    targetId: args.suggestionId,
    targetType: "FeedbackClusterSuggestion",
  });

  return { suggestionId: args.suggestionId };
}

export type AdminClusterSuggestion = Awaited<ReturnType<typeof listClusterSuggestions>>[number];
