import { ApiError } from "@/lib/api";
import { getBlockedUserIdsForUser } from "@/lib/friends/helpers";

export type DMParticipantIdentity = {
  userId: string;
};

type FindBlockedUserIdsForUser = (
  userId: string,
  candidateUserIds: readonly string[],
) => Promise<Set<string>>;

export async function assertUnblockedDMParticipants(args: {
  blockedMessage?: string;
  currentUserId: string;
  findBlockedUserIdsForUser?: FindBlockedUserIdsForUser;
  participants: readonly DMParticipantIdentity[];
}) {
  const otherParticipantIds = Array.from(
    new Set(
      args.participants
        .map((participant) => participant.userId)
        .filter((participantUserId) => participantUserId !== args.currentUserId),
    ),
  );

  if (otherParticipantIds.length === 0) {
    return;
  }

  const blockedUserIds = await (args.findBlockedUserIdsForUser ?? getBlockedUserIdsForUser)(
    args.currentUserId,
    otherParticipantIds,
  );

  if (blockedUserIds.size > 0) {
    throw new ApiError(
      args.blockedMessage ?? "You cannot use this DM while a block is active",
      403,
      "BLOCKED",
    );
  }
}
