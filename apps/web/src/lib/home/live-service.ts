import { ChannelType, type PrismaClient } from "@wizards/db";

import { groupCallStateKey, parseGroupCallState } from "@/lib/dm/group-call-state";
import { buildChannelHref, buildDMHref } from "@/lib/home/href";
import {
  HOME_ACTOR_SELECT,
  defaultVisibleChannelResolver,
  listVisibleChannelIds,
  listViewerServerIds,
  toHomeActor,
  type HomePresenceStateReader,
  type VisibleChannelResolver,
} from "@/lib/home/service";
import type { HomeActor, HomeLiveRoom, VoiceLiveResponse } from "@/lib/home/types";
import { getRedisOp } from "@/lib/redis";
import { getStaleVoiceHeartbeatCutoff } from "@/lib/voice/service";

/**
 * Ana Sayfa 1a — Faz 3 §3.4, "Şu an canlı".
 *
 * Two sources normalized into one row shape (karar #6): server voice channels
 * from `VoiceState`, and group calls from the Redis record that owns them.
 *
 * Three rules the card depends on:
 * - A `VoiceState` whose heartbeat went stale is not a live room. The cutoff is
 *   read from `voice/service.ts`, never restated here.
 * - `participants` is at most four; `participantCount` carries the real total so
 *   the "+8" chip is not a lie.
 * - A participant the redaction hid from this viewer — invisible, or presence
 *   closed to them — is not in the roster and not in the count. Redacting only
 *   the dot would still say "they are in this room", which is the one thing
 *   invisible mode promises not to say; `friends/queries.ts` drops the room on
 *   the same set. A room whose whole roster is hidden is not a live room.
 */

export const HOME_LIVE_PARTICIPANT_LIMIT = 4;
/** A rail can hold 50 servers; a call roster read is one Redis round trip. */
const HOME_LIVE_CONVERSATION_SCAN = 60;

export type HomeLiveDependencies = {
  readonly database: PrismaClient;
  readonly listVisibleChannels?: VisibleChannelResolver;
  readonly now: Date;
  readonly readCallStates: (keys: readonly string[]) => Promise<(string | null)[]>;
  readonly readPresence: HomePresenceStateReader;
};

export function readGroupCallStatesFromRedis(keys: readonly string[]): Promise<(string | null)[]> {
  if (keys.length === 0) {
    return Promise.resolve([]);
  }

  return getRedisOp()
    .mget(...keys)
    .catch(() => keys.map(() => null));
}

export async function listHomeLiveRooms(
  userId: string,
  limit: number,
  dependencies: HomeLiveDependencies,
): Promise<VoiceLiveResponse> {
  const { database, now, readCallStates, readPresence } = dependencies;
  const serverIds = await listViewerServerIds(database, userId);
  const visible = await listVisibleChannelIds(
    userId,
    serverIds,
    ChannelType.VOICE,
    dependencies.listVisibleChannels ?? defaultVisibleChannelResolver,
  );

  const [voiceStates, groupParticipations] = await Promise.all([
    visible.all.length > 0
      ? database.voiceState.findMany({
          orderBy: [{ channelId: "asc" }, { joinedAt: "asc" }],
          select: {
            channel: {
              select: {
                id: true,
                name: true,
                server: { select: { id: true, name: true } },
                topic: true,
              },
            },
            channelId: true,
            user: { select: HOME_ACTOR_SELECT },
          },
          where: {
            channelId: { in: [...visible.all] },
            lastHeartbeat: { gte: getStaleVoiceHeartbeatCutoff(now) },
          },
        })
      : Promise.resolve([]),
    database.dMParticipant.findMany({
      orderBy: { conversation: { lastMessageAt: "desc" } },
      select: { conversation: { select: { id: true, name: true } } },
      take: HOME_LIVE_CONVERSATION_SCAN,
      where: { conversation: { is: { type: "GROUP_DM" } }, userId },
    }),
  ]);

  const callStates = await readCallStates(
    groupParticipations.map((participation) => groupCallStateKey(participation.conversation.id)),
  );

  const callRosters = groupParticipations.flatMap((participation, index) => {
    const state = parseGroupCallState(callStates[index] ?? null);
    if (!state || state.participants.length === 0) {
      return [];
    }

    return [{ conversation: participation.conversation, state }];
  });

  // Roster'ın tamamı okunur, ilk dördü değil: gizlenen katılımcılar elendikten sonra görünür
  // kalan beşinci kişi adsız kalırdı. Bir grup çağrısının roster'ı grup boyutuyla sınırlı.
  const callParticipantIds = [
    ...new Set(
      callRosters.flatMap((roster) =>
        roster.state.participants.map((participant) => participant.userId),
      ),
    ),
  ];

  const callUsers =
    callParticipantIds.length > 0
      ? await database.user.findMany({
          select: HOME_ACTOR_SELECT,
          where: { id: { in: callParticipantIds } },
        })
      : [];

  const { hiddenUserIds, presenceByUserId } = await readPresence(userId, [
    ...voiceStates.map((state) => state.user.id),
    ...callParticipantIds,
  ]);
  const callUserById = new Map(callUsers.map((user) => [user.id, user]));

  const byChannel = new Map<string, { rooms: HomeLiveRoom; total: number }>();
  for (const state of voiceStates) {
    if (hiddenUserIds.has(state.user.id)) {
      continue;
    }

    const existing = byChannel.get(state.channelId);
    const actor = toHomeActor(state.user, presenceByUserId);

    if (!existing) {
      byChannel.set(state.channelId, {
        rooms: {
          caption: state.channel.topic ?? "",
          href: buildChannelHref(state.channel.server?.id ?? "", state.channel.id),
          id: state.channel.id,
          kind: "voice",
          name: state.channel.name,
          participantCount: 1,
          participants: [actor],
          serverId: state.channel.server?.id ?? null,
          serverName: state.channel.server?.name ?? null,
          speaker: null,
        },
        total: 1,
      });
      continue;
    }

    existing.total += 1;
    if (existing.rooms.participants.length < HOME_LIVE_PARTICIPANT_LIMIT) {
      existing.rooms.participants.push(actor);
    }
  }

  const voiceRooms: HomeLiveRoom[] = [...byChannel.values()].map((entry) => ({
    ...entry.rooms,
    participantCount: entry.total,
  }));

  const callRooms: HomeLiveRoom[] = callRosters.flatMap((roster): HomeLiveRoom[] => {
    const visibleParticipantIds = roster.state.participants
      .map((participant) => participant.userId)
      .filter((participantId) => !hiddenUserIds.has(participantId));

    if (visibleParticipantIds.length === 0) {
      return [];
    }

    const participants = visibleParticipantIds
      .slice(0, HOME_LIVE_PARTICIPANT_LIMIT)
      .flatMap((participantId): HomeActor[] => {
        const user = callUserById.get(participantId);
        return user ? [toHomeActor(user, presenceByUserId)] : [];
      });

    return [
      {
        caption: "",
        href: buildDMHref(roster.conversation.id),
        id: roster.conversation.id,
        kind: "call",
        name: roster.conversation.name ?? "",
        participantCount: visibleParticipantIds.length,
        participants,
        // A group call lives on a conversation, not on a server; `Katıl` joins it
        // through the DM call path rather than `joinChannel`.
        serverId: null,
        serverName: null,
        // Audio level is live data. The server never stores one; the card fills
        // this in from `voice:audio-level:update`.
        speaker: null,
      },
    ];
  });

  const rooms = [...voiceRooms, ...callRooms].sort(
    (left, right) => right.participantCount - left.participantCount,
  );

  return {
    rooms: rooms.slice(0, limit),
    // The header counts open rooms, not rendered ones; the scale step shortens
    // the list and would otherwise turn "5 oda açık" into "2 oda açık".
    totalCount: rooms.length,
  };
}
