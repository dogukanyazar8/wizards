import type { Prisma } from "@wizards/db";
import type { PresenceVisibility, ProfileVisibility } from "@wizards/types";

import type { PresenceFields, VisiblePresenceStatus } from "@/lib/presence";

type VisibilitySubject = {
  id: string;
  settings: {
    presenceVisibility: PresenceVisibility;
    profileVisibility: ProfileVisibility;
  } | null;
};

type VisibilityRelationship = {
  receiverId: string;
  senderId: string;
  status: string;
};

export type VisibilityDecision = {
  canViewPresence: boolean;
  canViewProfile: boolean;
};

export type VisibilityPolicyDependencies = {
  findRelationships(
    viewerId: string,
    subjectIds: readonly string[],
  ): Promise<VisibilityRelationship[]>;
  findSubjects(subjectIds: readonly string[]): Promise<VisibilitySubject[]>;
};

const defaultDependencies: VisibilityPolicyDependencies = {
  findRelationships: async (viewerId, subjectIds) => {
    const { prisma } = await import("@wizards/db");
    return prisma.friendRequest.findMany({
      where: {
        status: { in: ["ACCEPTED", "BLOCKED"] },
        OR: [
          { senderId: viewerId, receiverId: { in: [...subjectIds] } },
          { senderId: { in: [...subjectIds] }, receiverId: viewerId },
        ],
      },
      select: { receiverId: true, senderId: true, status: true },
    });
  },
  findSubjects: async (subjectIds) => {
    const { prisma } = await import("@wizards/db");
    return prisma.user.findMany({
      where: { deletedAt: null, id: { in: [...subjectIds] } },
      select: {
        id: true,
        settings: { select: { presenceVisibility: true, profileVisibility: true } },
      },
    });
  },
};

function allowsVisibility(preference: PresenceVisibility | ProfileVisibility, isFriend: boolean) {
  return preference === "EVERYONE" || (preference === "FRIENDS" && isFriend);
}

export function evaluateVisibilityPolicy(input: {
  blocked: boolean;
  isFriend: boolean;
  presenceVisibility: PresenceVisibility;
  profileVisibility: ProfileVisibility;
  self: boolean;
}): VisibilityDecision {
  if (input.self) {
    return { canViewPresence: true, canViewProfile: true };
  }

  if (input.blocked) {
    return { canViewPresence: false, canViewProfile: false };
  }

  return {
    canViewPresence: allowsVisibility(input.presenceVisibility, input.isFriend),
    canViewProfile: allowsVisibility(input.profileVisibility, input.isFriend),
  };
}

export function buildPresenceBroadcastAudience(input: {
  blockedUserIds: readonly string[];
  friendUserIds: readonly string[];
  presenceVisibility: PresenceVisibility;
  serverIds: readonly string[];
  userId: string;
}): {
  blockedUserIds: string[];
  directUserIds: string[];
  serverIds: string[];
} {
  const blockedUserIds = [...new Set(input.blockedUserIds.filter(Boolean))];
  const blocked = new Set(blockedUserIds);
  const directUserIds = [input.userId];

  if (input.presenceVisibility !== "NOBODY") {
    directUserIds.push(...input.friendUserIds.filter((id) => id && !blocked.has(id)));
  }

  return {
    blockedUserIds,
    directUserIds: [...new Set(directUserIds)],
    serverIds:
      input.presenceVisibility === "EVERYONE" ? [...new Set(input.serverIds.filter(Boolean))] : [],
  };
}

export async function resolveVisibilityDecisions(
  viewerId: string,
  subjectIds: readonly string[],
  dependencies: VisibilityPolicyDependencies = defaultDependencies,
): Promise<Map<string, VisibilityDecision>> {
  const ids = [...new Set(subjectIds.filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }

  const externalIds = ids.filter((id) => id !== viewerId);
  const [subjects, relationships] = await Promise.all([
    dependencies.findSubjects(externalIds),
    dependencies.findRelationships(viewerId, externalIds),
  ]);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const relationshipStateById = new Map<string, { blocked: boolean; isFriend: boolean }>();

  for (const row of relationships) {
    const subjectId = row.senderId === viewerId ? row.receiverId : row.senderId;
    const state = relationshipStateById.get(subjectId) ?? { blocked: false, isFriend: false };
    relationshipStateById.set(subjectId, {
      blocked: state.blocked || row.status === "BLOCKED",
      isFriend: state.isFriend || row.status === "ACCEPTED",
    });
  }

  return new Map(
    ids.map((subjectId) => {
      if (subjectId === viewerId) {
        return [subjectId, { canViewPresence: true, canViewProfile: true }];
      }

      const subject = subjectById.get(subjectId);
      if (!subject) {
        return [subjectId, { canViewPresence: false, canViewProfile: false }];
      }

      const relationship = relationshipStateById.get(subjectId) ?? {
        blocked: false,
        isFriend: false,
      };
      return [
        subjectId,
        evaluateVisibilityPolicy({
          ...relationship,
          presenceVisibility: subject.settings?.presenceVisibility ?? "EVERYONE",
          profileVisibility: subject.settings?.profileVisibility ?? "EVERYONE",
          self: false,
        }),
      ];
    }),
  );
}

/**
 * Query-boundary equivalent of `evaluateVisibilityPolicy` for candidate lists.
 * It filters before pagination, so hidden accounts cannot consume a search or
 * suggestion page and accidentally suppress later visible candidates.
 */
export function profileVisibilityWhereForViewer(viewerId: string): Prisma.UserWhereInput {
  const acceptedFriend = {
    OR: [
      { friendRequestsSent: { some: { receiverId: viewerId, status: "ACCEPTED" as const } } },
      { friendRequestsReceived: { some: { senderId: viewerId, status: "ACCEPTED" as const } } },
    ],
  };

  return {
    AND: [
      {
        friendRequestsSent: { none: { receiverId: viewerId, status: "BLOCKED" } },
        friendRequestsReceived: { none: { senderId: viewerId, status: "BLOCKED" } },
      },
      {
        OR: [
          { settings: { is: null } },
          { settings: { is: { profileVisibility: "EVERYONE" } } },
          { AND: [{ settings: { is: { profileVisibility: "FRIENDS" } } }, acceptedFriend] },
        ],
      },
    ],
  };
}

export function redactPresenceForViewer<TStatus extends VisiblePresenceStatus>(input: {
  canViewPresence: boolean;
  invisible: boolean;
  presence: PresenceFields & { lastSeenAt?: string | null; status: TStatus };
}): PresenceFields & { lastSeenAt: string | null } {
  if (!input.canViewPresence || input.invisible) {
    return { customStatus: null, lastSeenAt: null, status: "OFFLINE" };
  }

  return {
    customStatus: input.presence.customStatus,
    lastSeenAt: input.presence.lastSeenAt ?? null,
    status: input.presence.status,
  };
}

export function redactPresenceCollectionForViewer(input: {
  decisions: ReadonlyMap<string, VisibilityDecision>;
  invisibleUserIds: ReadonlySet<string>;
  lastSeenByUserId: ReadonlyMap<string, string | null>;
  presenceByUserId: ReadonlyMap<string, PresenceFields>;
  subjectIds: readonly string[];
}): {
  hiddenUserIds: Set<string>;
  lastSeenByUserId: Map<string, string | null>;
  presenceByUserId: Map<string, PresenceFields>;
} {
  const hiddenUserIds = new Set<string>();
  const lastSeenByUserId = new Map<string, string | null>();
  const presenceByUserId = new Map<string, PresenceFields>();

  for (const subjectId of new Set(input.subjectIds)) {
    const decision = input.decisions.get(subjectId);
    const invisible = input.invisibleUserIds.has(subjectId);
    const redacted = redactPresenceForViewer({
      canViewPresence: decision?.canViewPresence ?? false,
      invisible,
      presence: {
        ...(input.presenceByUserId.get(subjectId) ?? {
          customStatus: null,
          status: "OFFLINE" as const,
        }),
        lastSeenAt: input.lastSeenByUserId.get(subjectId) ?? null,
      },
    });

    presenceByUserId.set(subjectId, {
      customStatus: redacted.customStatus,
      status: redacted.status,
    });
    lastSeenByUserId.set(subjectId, redacted.lastSeenAt);
    if (invisible || !decision?.canViewPresence) {
      hiddenUserIds.add(subjectId);
    }
  }

  return { hiddenUserIds, lastSeenByUserId, presenceByUserId };
}
