import type { Prisma, PrismaClient } from "@wizards/db";
import type {
  CreateServerScheduledEventInput,
  ServerScheduledEvent,
  UpdateServerScheduledEventInput,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import { PermissionBits } from "@/lib/workspace/permissions";

/**
 * `ScheduledEvent` shipped in the schema long before anything wrote to it (no
 * route, no UI, zero references under `apps/`). This service is the whole read
 * and write surface for it, so a caller never has to hand-select the model and
 * two surfaces can never disagree about what an event looks like.
 */
export const SERVER_SCHEDULED_EVENT_SELECT = {
  channel: {
    select: {
      _count: { select: { voiceStates: true } },
      id: true,
      name: true,
    },
  },
  channelId: true,
  description: true,
  entityType: true,
  externalLocation: true,
  id: true,
  interestedCount: true,
  name: true,
  scheduledEndAt: true,
  scheduledStartAt: true,
  serverId: true,
  status: true,
} satisfies Prisma.ScheduledEventSelect;

/**
 * `viewerInterested` cannot live in the static select: the filter depends on
 * who is asking. One bounded sub-select per event row (`take: 1`) keeps it in
 * the same round trip rather than a second query per event.
 */
function scheduledEventSelectForViewer(viewerId: string | null) {
  return {
    ...SERVER_SCHEDULED_EVENT_SELECT,
    interests: {
      select: { id: true },
      take: 1,
      where: viewerId === null ? { id: "" } : { userId: viewerId },
    },
  };
}

export type ServerScheduledEventSource = Prisma.ScheduledEventGetPayload<{
  select: typeof SERVER_SCHEDULED_EVENT_SELECT;
}> & {
  readonly interests: readonly { readonly id: string }[];
};

/** Pure so the projection can be asserted without a database. */
export function buildServerScheduledEvent(row: ServerScheduledEventSource): ServerScheduledEvent {
  return {
    // A bound voice channel's live headcount is the attendance; an external
    // event has no channel and therefore no one to count.
    attendeeCount: row.channel?._count.voiceStates ?? 0,
    channelId: row.channelId,
    channelName: row.channel?.name ?? null,
    description: row.description,
    entityType: row.entityType,
    externalLocation: row.externalLocation,
    id: row.id,
    // The counter is maintained transactionally, but a payload that has gone
    // negative would fail the schema and take the whole profile down with it.
    interestedCount: Math.max(0, row.interestedCount),
    name: row.name,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    scheduledStartAt: row.scheduledStartAt.toISOString(),
    serverId: row.serverId,
    status: row.status,
    viewerInterested: row.interests.length > 0,
  };
}

export type ListServerScheduledEventsOptions = {
  readonly includePast?: boolean;
};

export async function listServerScheduledEventsWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
  options: ListServerScheduledEventsOptions = {},
): Promise<ServerScheduledEvent[]> {
  const rows = await database.scheduledEvent.findMany({
    orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }],
    select: scheduledEventSelectForViewer(viewerId),
    where: {
      serverId,
      ...(options.includePast ? {} : { status: { in: ["SCHEDULED", "ACTIVE"] as const } }),
    },
  });

  return rows.map((row) => buildServerScheduledEvent(row as ServerScheduledEventSource));
}

export async function listServerScheduledEvents(
  serverId: string,
  viewerId: string,
  options: ListServerScheduledEventsOptions = {},
): Promise<ServerScheduledEvent[]> {
  const { prisma } = await import("@wizards/db");
  // Listing is a member surface: the profile card's single upcoming event is
  // what a non-member sees, and that comes through the profile read model.
  await getAccessContext(viewerId, serverId);

  return listServerScheduledEventsWithDatabase(prisma, serverId, viewerId, options);
}

/**
 * The profile card's one event: the next `SCHEDULED` one that has not started
 * yet. Served by `[serverId, status, scheduledStartAt]` -- without that index
 * this is a filter-and-sort over every event the server ever held.
 */
export async function getUpcomingServerScheduledEventWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
  now: Date = new Date(),
): Promise<ServerScheduledEvent | null> {
  const row = await database.scheduledEvent.findFirst({
    orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }],
    select: scheduledEventSelectForViewer(viewerId),
    where: {
      scheduledStartAt: { gte: now },
      serverId,
      status: "SCHEDULED",
    },
  });

  return row ? buildServerScheduledEvent(row as ServerScheduledEventSource) : null;
}

export async function getUpcomingServerScheduledEvent(
  serverId: string,
  viewerId: string | null,
): Promise<ServerScheduledEvent | null> {
  const { prisma } = await import("@wizards/db");
  return getUpcomingServerScheduledEventWithDatabase(prisma, serverId, viewerId);
}

/**
 * A channel from another server would otherwise be bindable to this server's
 * event, which is both a leak (the name comes back in the payload) and a join
 * button pointing somewhere the viewer may not belong.
 */
async function assertChannelBelongsToServer(
  database: PrismaClient,
  serverId: string,
  channelId: string,
): Promise<void> {
  const channel = await database.channel.findFirst({
    select: { id: true },
    where: { id: channelId, serverId },
  });

  if (!channel) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }
}

function notifyServerScheduledEventsChanged(serverId: string): void {
  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
}

export async function createServerScheduledEventWithDatabase(
  database: PrismaClient,
  userId: string,
  serverId: string,
  input: CreateServerScheduledEventInput,
): Promise<ServerScheduledEvent> {
  if (input.channelId) {
    await assertChannelBelongsToServer(database, serverId, input.channelId);
  }

  const created = await database.scheduledEvent.create({
    data: {
      channelId: input.channelId ?? null,
      creatorId: userId,
      description: input.description ?? null,
      entityType: input.entityType,
      externalLocation: input.externalLocation ?? null,
      name: input.name,
      scheduledEndAt: input.scheduledEndAt ? new Date(input.scheduledEndAt) : null,
      scheduledStartAt: new Date(input.scheduledStartAt),
      serverId,
    },
    select: scheduledEventSelectForViewer(userId),
  });

  notifyServerScheduledEventsChanged(serverId);

  return buildServerScheduledEvent(created as ServerScheduledEventSource);
}

export async function createServerScheduledEvent(
  userId: string,
  serverId: string,
  input: CreateServerScheduledEventInput,
): Promise<ServerScheduledEvent> {
  const { prisma } = await import("@wizards/db");
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

  return createServerScheduledEventWithDatabase(prisma, userId, serverId, input);
}

async function findServerScheduledEvent(
  database: PrismaClient,
  serverId: string,
  eventId: string,
): Promise<{ id: string }> {
  const event = await database.scheduledEvent.findFirst({
    select: { id: true },
    where: { id: eventId, serverId },
  });

  if (!event) {
    throw new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND");
  }

  return event;
}

export async function updateServerScheduledEventWithDatabase(
  database: PrismaClient,
  userId: string,
  serverId: string,
  eventId: string,
  input: UpdateServerScheduledEventInput,
): Promise<ServerScheduledEvent> {
  await findServerScheduledEvent(database, serverId, eventId);

  if (input.channelId) {
    await assertChannelBelongsToServer(database, serverId, input.channelId);
  }

  const data: Prisma.ScheduledEventUpdateInput = {};

  if (input.channelId !== undefined) {
    data.channel = input.channelId ? { connect: { id: input.channelId } } : { disconnect: true };
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.entityType !== undefined) {
    data.entityType = input.entityType;
  }

  if (input.externalLocation !== undefined) {
    data.externalLocation = input.externalLocation;
  }

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.scheduledEndAt !== undefined) {
    data.scheduledEndAt = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null;
  }

  if (input.scheduledStartAt !== undefined) {
    data.scheduledStartAt = new Date(input.scheduledStartAt);
  }

  const updated = await database.scheduledEvent.update({
    data,
    select: scheduledEventSelectForViewer(userId),
    where: { id: eventId },
  });

  notifyServerScheduledEventsChanged(serverId);

  return buildServerScheduledEvent(updated as ServerScheduledEventSource);
}

export async function updateServerScheduledEvent(
  userId: string,
  serverId: string,
  eventId: string,
  input: UpdateServerScheduledEventInput,
): Promise<ServerScheduledEvent> {
  const { prisma } = await import("@wizards/db");
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

  return updateServerScheduledEventWithDatabase(prisma, userId, serverId, eventId, input);
}

export async function cancelServerScheduledEventWithDatabase(
  database: PrismaClient,
  userId: string,
  serverId: string,
  eventId: string,
): Promise<ServerScheduledEvent> {
  await findServerScheduledEvent(database, serverId, eventId);

  // Cancelled, never deleted: the row is what "Bu etkinlik iptal edildi" is
  // rendered from, and an interested user's client would otherwise just see
  // the card vanish.
  const cancelled = await database.scheduledEvent.update({
    data: { status: "CANCELLED" },
    select: scheduledEventSelectForViewer(userId),
    where: { id: eventId },
  });

  notifyServerScheduledEventsChanged(serverId);

  return buildServerScheduledEvent(cancelled as ServerScheduledEventSource);
}

export async function cancelServerScheduledEvent(
  userId: string,
  serverId: string,
  eventId: string,
): Promise<ServerScheduledEvent> {
  const { prisma } = await import("@wizards/db");
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

  return cancelServerScheduledEventWithDatabase(prisma, userId, serverId, eventId);
}

/**
 * Idempotent by construction: the counter only moves when the interest row
 * actually appeared or disappeared. `skipDuplicates` on the insert and the
 * affected-row count on the delete are what make a double tap a no-op rather
 * than a double increment, and both halves run in one transaction so the
 * counter cannot drift away from the rows it counts.
 */
export async function setServerScheduledEventInterestWithDatabase(
  database: PrismaClient,
  userId: string,
  serverId: string,
  eventId: string,
  interested: boolean,
): Promise<ServerScheduledEvent> {
  await findServerScheduledEvent(database, serverId, eventId);

  return database.$transaction(async (transaction) => {
    if (interested) {
      const { count } = await transaction.scheduledEventInterest.createMany({
        data: [{ eventId, userId }],
        skipDuplicates: true,
      });

      if (count > 0) {
        await transaction.scheduledEvent.update({
          data: { interestedCount: { increment: 1 } },
          select: { id: true },
          where: { id: eventId },
        });
      }
    } else {
      const { count } = await transaction.scheduledEventInterest.deleteMany({
        where: { eventId, userId },
      });

      if (count > 0) {
        await transaction.scheduledEvent.update({
          data: { interestedCount: { decrement: 1 } },
          select: { id: true },
          where: { id: eventId },
        });
      }
    }

    const row = await transaction.scheduledEvent.findUniqueOrThrow({
      select: scheduledEventSelectForViewer(userId),
      where: { id: eventId },
    });

    return buildServerScheduledEvent(row as ServerScheduledEventSource);
  });
}

export async function setServerScheduledEventInterest(
  userId: string,
  serverId: string,
  eventId: string,
  interested: boolean,
): Promise<ServerScheduledEvent> {
  const { prisma } = await import("@wizards/db");
  // Any member may express interest; only managing the event needs the
  // MANAGE_SERVER permission the write paths above check.
  await getAccessContext(userId, serverId);

  return setServerScheduledEventInterestWithDatabase(prisma, userId, serverId, eventId, interested);
}
