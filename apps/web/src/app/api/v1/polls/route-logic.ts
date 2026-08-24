import { z } from "zod";
import { PollCreateRequestSchema, PollVoteRequestSchema, type PollDTO } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { emitPollUpdated } from "@/lib/dm/group-realtime";
import {
  castPollVote,
  createPollMessage,
  getPollForViewer,
  listPollVoters,
} from "@/lib/polls/service";
import { getSocketServer } from "@/lib/socket/runtime";
import type { AppSocketServer } from "@/lib/socket/runtime";

/**
 * Mesajlar karar #1 — anket uçları.
 *
 * Dört uç, tek servis. Katılımcılık ve anonimlik `lib/polls/service` içinde,
 * sorgunun kendisinde zorlanır; bu katman kimliği, hız sınırını, gövdeyi ve
 * yayını taşır.
 */
export type PollRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  castVote: typeof castPollVote;
  createPoll: typeof createPollMessage;
  emitUpdated: typeof emitPollUpdated;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getIo(): AppSocketServer | null;
  getPoll: typeof getPollForViewer;
  listVoters: typeof listPollVoters;
};

const defaults: PollRouteDependencies = {
  authenticate: () => requireApiUserId(),
  castVote: castPollVote,
  createPoll: createPollMessage,
  emitUpdated: emitPollUpdated,
  enforceRateLimit: enforceApiRateLimit,
  getIo: () => getSocketServer(),
  getPoll: getPollForViewer,
  listVoters: listPollVoters,
};

const PollCreateBodySchema = PollCreateRequestSchema.extend({
  /**
   * The composer's own text, when the author typed one. Absent means the message
   * body is the question itself (`createPollMessage`).
   */
  content: z.string().max(2000).optional(),
  conversationId: z.string().min(1).max(128),
});

export async function pollCreateRoute(
  request: Request,
  dependencies: PollRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "poll:create");
    const { content, conversationId, ...poll } = await parseJsonBody(request, PollCreateBodySchema);

    const message = await dependencies.createPoll({
      ...(content === undefined ? {} : { content }),
      conversationId,
      io: dependencies.getIo(),
      poll,
      userId,
    });

    // No `poll:updated` here: the message itself already reached the room as
    // `dm:message:new`, carrying the poll inline. A second event would make the
    // card render twice from two sources.
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function pollReadRoute(
  request: Request,
  pollId: string,
  dependencies: PollRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "poll:read");
    const { poll } = await dependencies.getPoll(pollId, userId);

    return Response.json({ poll });
  } catch (error) {
    return jsonError(error);
  }
}

function announceVote(
  dependencies: PollRouteDependencies,
  result: { conversationId: string; poll: PollDTO },
): void {
  const io = dependencies.getIo();

  if (io && result.conversationId) {
    dependencies.emitUpdated(io, {
      conversationId: result.conversationId,
      pollId: result.poll.id,
    });
  }
}

export async function pollVoteRoute(
  request: Request,
  pollId: string,
  dependencies: PollRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "poll:vote");
    const { optionIds } = await parseJsonBody(request, PollVoteRequestSchema);
    const result = await dependencies.castVote({ optionIds, pollId, viewerId: userId });

    announceVote(dependencies, result);

    return Response.json({ poll: result.poll });
  } catch (error) {
    return jsonError(error);
  }
}

/** Withdrawing a vote is the same write with an empty set. */
export async function pollVoteClearRoute(
  request: Request,
  pollId: string,
  dependencies: PollRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "poll:vote");
    const result = await dependencies.castVote({ optionIds: [], pollId, viewerId: userId });

    announceVote(dependencies, result);

    return Response.json({ poll: result.poll });
  } catch (error) {
    return jsonError(error);
  }
}

export async function pollVotersRoute(
  request: Request,
  pollId: string,
  dependencies: PollRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "poll:read");
    const voters = await dependencies.listVoters(pollId, userId);

    return Response.json({ voters });
  } catch (error) {
    return jsonError(error);
  }
}
