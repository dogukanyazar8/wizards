import { prisma, type Prisma } from "@wizards/db";
import type { DiscoverEventPage } from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  hasPermission,
  PermissionBits,
  resolveChannelPermissions,
  type ChannelPermissionOverrideRecord,
  type RolePermissionRecord,
} from "@/lib/workspace/permissions";

export type DiscoverEventCursor = {
  id: string;
  scheduledStartAt: Date;
};

export type DiscoverEventSource = {
  channel: {
    name: string;
    permissionOverrides: ChannelPermissionOverrideRecord[];
  } | null;
  entityType: "STAGE" | "VOICE" | "EXTERNAL";
  externalLocation: string | null;
  id: string;
  interestedCount: number;
  name: string;
  scheduledEndAt: Date | null;
  scheduledStartAt: Date;
  server: {
    id: string;
    name: string;
    ownerId: string;
    roles: RolePermissionRecord[];
  };
  serverDiscoverable: boolean;
  serverPublic: boolean;
};

type LoadDiscoverEventsInput = {
  after: DiscoverEventCursor | null;
  now: Date;
  query: string | undefined;
  take: number;
};

export type DiscoverEventsDependencies = {
  loadEvents(input: LoadDiscoverEventsInput): Promise<DiscoverEventSource[]>;
  loadInterestedEventIds(
    viewerId: string,
    eventIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
};

const DISCOVER_EVENT_SELECT = {
  channel: {
    select: {
      name: true,
      permissionOverrides: {
        select: { allow: true, deny: true, targetId: true, targetType: true },
      },
    },
  },
  entityType: true,
  externalLocation: true,
  id: true,
  name: true,
  scheduledEndAt: true,
  scheduledStartAt: true,
  server: {
    select: {
      discoverable: true,
      id: true,
      isPublic: true,
      name: true,
      ownerId: true,
      roles: {
        where: { isDefault: true },
        select: { id: true, isDefault: true, permissions: true },
      },
    },
  },
  _count: {
    select: { interests: { where: { status: "GOING" as const } } },
  },
} satisfies Prisma.ScheduledEventSelect;

type PrismaDiscoverEvent = Prisma.ScheduledEventGetPayload<{
  select: typeof DISCOVER_EVENT_SELECT;
}>;

function mapPrismaDiscoverEvent(event: PrismaDiscoverEvent): DiscoverEventSource {
  return {
    channel: event.channel,
    entityType: event.entityType,
    externalLocation: event.externalLocation,
    id: event.id,
    interestedCount: event._count.interests,
    name: event.name,
    scheduledEndAt: event.scheduledEndAt,
    scheduledStartAt: event.scheduledStartAt,
    server: event.server,
    serverDiscoverable: event.server.discoverable,
    serverPublic: event.server.isPublic,
  };
}

const defaultDependencies: DiscoverEventsDependencies = {
  loadEvents: async ({ after, now, query, take }) => {
    const term = query?.trim();
    const events = await prisma.scheduledEvent.findMany({
      orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }],
      select: DISCOVER_EVENT_SELECT,
      take,
      where: {
        AND: [
          { isPublic: true },
          { status: "SCHEDULED" },
          { scheduledStartAt: { gte: now } },
          { server: { discoverable: true, isPublic: true } },
          ...(after
            ? [
                {
                  OR: [
                    { scheduledStartAt: { gt: after.scheduledStartAt } },
                    { id: { gt: after.id }, scheduledStartAt: after.scheduledStartAt },
                  ],
                },
              ]
            : []),
          ...(term
            ? [
                {
                  OR: [
                    { name: { contains: term, mode: "insensitive" as const } },
                    { externalLocation: { contains: term, mode: "insensitive" as const } },
                    { channel: { name: { contains: term, mode: "insensitive" as const } } },
                    { server: { name: { contains: term, mode: "insensitive" as const } } },
                  ],
                },
              ]
            : []),
        ],
      },
    });

    return events.map(mapPrismaDiscoverEvent);
  },
  loadInterestedEventIds: async (viewerId, eventIds) => {
    if (eventIds.length === 0) {
      return new Set();
    }

    const rows = await prisma.scheduledEventInterest.findMany({
      select: { eventId: true },
      where: { eventId: { in: [...eventIds] }, status: "GOING", userId: viewerId },
    });
    return new Set(rows.map((row) => row.eventId));
  },
};

export function encodeDiscoverEventCursor(cursor: DiscoverEventCursor) {
  return `e|${cursor.scheduledStartAt.getTime()}|${cursor.id}`;
}

export function decodeDiscoverEventCursor(raw: string): DiscoverEventCursor | null {
  const match = /^e\|(\d+)\|(.+)$/.exec(raw);
  if (!match) {
    return null;
  }

  const epochMs = Number(match[1]);
  if (!Number.isSafeInteger(epochMs)) {
    return null;
  }

  const scheduledStartAt = new Date(epochMs);
  return Number.isNaN(scheduledStartAt.getTime()) ? null : { id: match[2]!, scheduledStartAt };
}

export function isDiscoverEventChannelPublic(event: DiscoverEventSource) {
  if (!event.serverDiscoverable || !event.serverPublic) {
    return false;
  }
  if (!event.channel) {
    return true;
  }

  const permissions = resolveChannelPermissions({
    memberId: null,
    overrides: event.channel.permissionOverrides,
    ownerId: event.server.ownerId,
    roles: event.server.roles,
    userId: "",
  });
  return hasPermission(permissions, PermissionBits.VIEW_CHANNEL);
}

export function formatDiscoverEventDuration(start: Date, end: Date | null) {
  if (!end) {
    return "";
  }

  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours > 0 ? `${hours} sa` : "", minutes > 0 ? `${minutes} dk` : ""]
    .filter(Boolean)
    .join(" ");
}

function toLocationLabel(event: DiscoverEventSource) {
  const location = event.channel?.name ?? event.externalLocation?.trim();
  return location ? `${event.server.name} › ${location}` : event.server.name;
}

function isCandidateEligible(event: DiscoverEventSource, now: Date) {
  return event.scheduledStartAt >= now && isDiscoverEventChannelPublic(event);
}

export async function listDiscoverEvents(
  viewerId: string,
  input: { cursor?: string; query?: string },
  context: { limit?: number; now?: Date } = {},
  dependencies: DiscoverEventsDependencies = defaultDependencies,
): Promise<DiscoverEventPage> {
  const now = context.now ?? new Date();
  const limit = Math.min(Math.max(context.limit ?? 24, 1), 50);
  let after = input.cursor ? decodeDiscoverEventCursor(input.cursor) : null;
  if (input.cursor && !after) {
    throw new ApiError("Invalid discover event cursor.", 400, "INVALID_CURSOR");
  }

  const visible: DiscoverEventSource[] = [];
  const batchSize = limit + 1;
  while (visible.length < limit + 1) {
    const candidates = await dependencies.loadEvents({
      after,
      now,
      query: input.query?.trim() || undefined,
      take: batchSize,
    });
    if (candidates.length === 0) {
      break;
    }

    visible.push(...candidates.filter((candidate) => isCandidateEligible(candidate, now)));
    const lastCandidate = candidates.at(-1)!;
    after = { id: lastCandidate.id, scheduledStartAt: lastCandidate.scheduledStartAt };
    if (candidates.length < batchSize) {
      break;
    }
  }

  const page = visible.slice(0, limit);
  const interestedIds = await dependencies.loadInterestedEventIds(
    viewerId,
    page.map((event) => event.id),
  );
  const lastPageEvent = page.at(-1);

  return {
    items: page.map((event) => ({
      durationLabel: formatDiscoverEventDuration(event.scheduledStartAt, event.scheduledEndAt),
      entityType: event.entityType,
      id: event.id,
      interested: interestedIds.has(event.id),
      interestedCount: event.interestedCount,
      locationLabel: toLocationLabel(event),
      name: event.name,
      scheduledStartAt: event.scheduledStartAt.toISOString(),
      serverId: event.server.id,
    })),
    nextCursor:
      visible.length > limit && lastPageEvent
        ? encodeDiscoverEventCursor({
            id: lastPageEvent.id,
            scheduledStartAt: lastPageEvent.scheduledStartAt,
          })
        : null,
  };
}

export type DiscoverEventInterestTransaction = {
  countInterested(eventId: string): Promise<number>;
  countMaybe(eventId: string): Promise<number>;
  deleteInterest(eventId: string, userId: string): Promise<void>;
  findEligibleEvent(eventId: string, now: Date): Promise<DiscoverEventSource | null>;
  synchronizeInterestedCount(
    eventId: string,
    counts: { interestedCount: number; maybeCount: number },
  ): Promise<void>;
  upsertInterest(eventId: string, userId: string): Promise<void>;
};

export type DiscoverEventInterestDependencies = {
  transaction<T>(run: (tx: DiscoverEventInterestTransaction) => Promise<T>): Promise<T>;
};

function prismaInterestTransaction(tx: Prisma.TransactionClient): DiscoverEventInterestTransaction {
  return {
    countInterested: (eventId) =>
      tx.scheduledEventInterest.count({ where: { eventId, status: "GOING" } }),
    countMaybe: (eventId) =>
      tx.scheduledEventInterest.count({ where: { eventId, status: "MAYBE" } }),
    deleteInterest: async (eventId, userId) => {
      await tx.scheduledEventInterest.deleteMany({ where: { eventId, userId } });
    },
    findEligibleEvent: async (eventId, now) => {
      const event = await tx.scheduledEvent.findFirst({
        select: DISCOVER_EVENT_SELECT,
        where: {
          id: eventId,
          isPublic: true,
          scheduledStartAt: { gte: now },
          server: { discoverable: true, isPublic: true },
          status: "SCHEDULED",
        },
      });
      return event ? mapPrismaDiscoverEvent(event) : null;
    },
    synchronizeInterestedCount: async (eventId, counts) => {
      await tx.scheduledEvent.update({ data: counts, where: { id: eventId } });
    },
    upsertInterest: async (eventId, userId) => {
      await tx.scheduledEventInterest.upsert({
        create: { eventId, status: "GOING", userId },
        update: { status: "GOING" },
        where: { eventId_userId: { eventId, userId } },
      });
    },
  };
}

const defaultInterestDependencies: DiscoverEventInterestDependencies = {
  transaction: (run) =>
    prisma.$transaction((tx) => run(prismaInterestTransaction(tx)), {
      isolationLevel: "Serializable",
    }),
};

export async function setDiscoverEventInterest(
  viewerId: string,
  eventId: string,
  interested: boolean,
  context: { now?: Date } = {},
  dependencies: DiscoverEventInterestDependencies = defaultInterestDependencies,
) {
  return dependencies.transaction(async (tx) => {
    const event = await tx.findEligibleEvent(eventId, context.now ?? new Date());
    if (!event || !isDiscoverEventChannelPublic(event)) {
      throw new ApiError("Event not found.", 404, "EVENT_NOT_FOUND");
    }

    if (interested) {
      await tx.upsertInterest(eventId, viewerId);
    } else {
      await tx.deleteInterest(eventId, viewerId);
    }

    const [interestedCount, maybeCount] = await Promise.all([
      tx.countInterested(eventId),
      tx.countMaybe(eventId),
    ]);
    await tx.synchronizeInterestedCount(eventId, { interestedCount, maybeCount });
    return { interested, interestedCount };
  });
}
