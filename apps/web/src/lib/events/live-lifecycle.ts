import type { Prisma, ScheduledEventEntityType, ScheduledEventStatus } from "@wizards/db";
import { SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS } from "@wizards/types";

/**
 * Etkinlikler Ş3 §6 — canlı geçişi.
 *
 * `ScheduledEventStatus.ACTIVE` şemada baştan beri vardı ve bugüne kadar **kimse yazmadı**;
 * `Canlı` sekmesi, ajanda rayındaki nokta ve gezinme panelindeki `--danger` işareti hep bu
 * kolonu okuyor. Bu modül onu yazan tek yer.
 *
 * Geçiş kaynağı **doluluk**tur, olay değil. Voice üyelik yazılarıyla eşitleme aynı kanalın
 * PostgreSQL advisory transaction lock'ını alır; böylece geç kalan bir ayrılma, yeni katılımı
 * `COMPLETED` durumuyla ezemez. Durum filtresi de yinelenen yayınları engeller.
 */

/** Katılma penceresi web ve mobilde tek sabittir; ikinci bir 15 dakika tanımlanmaz. */
export const EVENT_LIVE_START_WINDOW_MS = SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS;

/**
 * Süresi dolan ama kanalı boşalmayan etkinlik için pay. Payı olmasaydı, biten bir toplantının
 * ardından sohbete kalan iki kişi etkinliği süresiz `Canlı` gösterirdi.
 */
export const EVENT_LIVE_COMPLETE_GRACE_MS = 15 * 60 * 1000;

export type EventLiveTransitionKind = "end" | "start";

export type EventLiveTransition = {
  readonly eventId: string;
  readonly isPublic: boolean;
  readonly serverId: string;
  readonly transition: EventLiveTransitionKind;
};

export type EventLivePublisher = {
  publishEventLiveEnded(payload: { eventId: string; serverId: string }, isPublic?: boolean): void;
  publishEventLiveStarted(payload: { eventId: string; serverId: string }, isPublic?: boolean): void;
};

export type EventLiveLifecycleClient = {
  readonly scheduledEvent: {
    findMany(args: {
      select: {
        entityType: true;
        id: true;
        isPublic: true;
        scheduledEndAt: true;
        scheduledStartAt: true;
        serverId: true;
        status: true;
      };
      where: { channelId: string; status: { in: ScheduledEventStatus[] } };
    }): Promise<
      readonly {
        readonly entityType: ScheduledEventEntityType;
        readonly id: string;
        readonly isPublic: boolean;
        readonly scheduledEndAt: Date | null;
        readonly scheduledStartAt: Date;
        readonly serverId: string;
        readonly status: ScheduledEventStatus;
      }[]
    >;
    updateMany(args: Prisma.ScheduledEventUpdateManyArgs): Promise<{ count: number }>;
  };
  readonly voiceState: {
    count(args: { where: { channelId: string } }): Promise<number>;
  };
};

export type EventLiveLifecycleTransaction = EventLiveLifecycleClient & {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
};

export type EventLiveLifecycleDatabase = {
  $transaction<T>(callback: (transaction: EventLiveLifecycleTransaction) => Promise<T>): Promise<T>;
};

export type EventLiveTransitionInput = {
  readonly durationMinutes: number | null;
  readonly entityType: ScheduledEventEntityType;
  /** Bağlı kanaldaki canlı `voiceState` sayısı. */
  readonly occupancy: number;
  readonly now: Date;
  readonly startsAt: Date;
  readonly status: ScheduledEventStatus;
};

/**
 * Saf karar: durumdan, doluluktan ve saatten hangi geçişin gerektiği. Veritabanına dokunmaz,
 * böylece sınır koşulları (pencerenin tam ucu, payın tam ucu) tek tek yazılabiliyor.
 */
export function resolveEventLiveTransition(
  input: EventLiveTransitionInput,
): EventLiveTransitionKind | null {
  /**
   * Harici etkinlikte otomatik geçiş **yok**: sayacak bir kanal yok ve bir bağlantıya kimin
   * girdiğini Whispr bilmiyor. Sahibi `PUT /events/[eventId]` ile elle başlatır ve bitirir.
   * Bu bir `TODO(api):` değil, bilinçli sınır.
   */
  if (input.entityType === "EXTERNAL") {
    return null;
  }

  const nowMs = input.now.getTime();
  const startMs = input.startsAt.getTime();

  if (input.status === "SCHEDULED") {
    if (input.occupancy === 0 || startMs - nowMs > EVENT_LIVE_START_WINDOW_MS) {
      return null;
    }

    if (input.durationMinutes !== null) {
      const expiresAtMs = startMs + input.durationMinutes * 60_000 + EVENT_LIVE_COMPLETE_GRACE_MS;
      if (nowMs > expiresAtMs) {
        return null;
      }
    }

    return "start";
  }

  if (input.status !== "ACTIVE") {
    return null;
  }

  if (input.occupancy === 0) {
    return "end";
  }

  if (input.durationMinutes === null) {
    return null;
  }

  const expiresAtMs = startMs + input.durationMinutes * 60_000 + EVENT_LIVE_COMPLETE_GRACE_MS;
  return nowMs > expiresAtMs ? "end" : null;
}

const LIVE_LIFECYCLE_STATUSES = [
  "SCHEDULED",
  "ACTIVE",
] as const satisfies readonly ScheduledEventStatus[];

const NEXT_STATUS: Readonly<Record<EventLiveTransitionKind, ScheduledEventStatus>> = {
  end: "COMPLETED",
  start: "ACTIVE",
};

function durationMinutesOf(startsAt: Date, endsAt: Date | null): number | null {
  return endsAt === null ? null : Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}

/**
 * Bir sesli/sahne kanalının bütün etkinliklerini bugünkü durumuyla eşitler.
 *
 * Sesli katılma, ayrılma ve zaman aşımı temizliği bu fonksiyonu doluluk değiştikten sonra
 * çağırır. Böylece durum bir socket olayının teslimine değil, veritabanındaki gerçek doluluğa
 * dayanır.
 */
export async function syncEventLiveStateForChannel(
  client: EventLiveLifecycleClient,
  input: { readonly channelId: string; readonly now: Date },
): Promise<EventLiveTransition[]> {
  const events = await client.scheduledEvent.findMany({
    select: {
      entityType: true,
      id: true,
      isPublic: true,
      scheduledEndAt: true,
      scheduledStartAt: true,
      serverId: true,
      status: true,
    },
    where: { channelId: input.channelId, status: { in: [...LIVE_LIFECYCLE_STATUSES] } },
  });

  if (events.length === 0) {
    return [];
  }

  const occupancy = await client.voiceState.count({ where: { channelId: input.channelId } });
  const transitions: EventLiveTransition[] = [];

  for (const event of events) {
    const kind = resolveEventLiveTransition({
      durationMinutes: durationMinutesOf(event.scheduledStartAt, event.scheduledEndAt),
      entityType: event.entityType,
      now: input.now,
      occupancy,
      startsAt: event.scheduledStartAt,
      status: event.status,
    });

    if (kind === null) {
      continue;
    }

    // Durum ve doluluk aynı UPDATE snapshot'ında doğrulanır. Ayrı `count()` yalnızca geçiş
    // kararını ucuzlatır; arada biri katılır/ayrılırsa ilişki filtresi eski kararı reddeder.
    const occupancyGuard: Prisma.ScheduledEventWhereInput =
      kind === "start"
        ? { channel: { is: { voiceStates: { some: {} } } } }
        : occupancy === 0
          ? { channel: { is: { voiceStates: { none: {} } } } }
          : {};

    const { count } = await client.scheduledEvent.updateMany({
      data: { status: NEXT_STATUS[kind] },
      where: { id: event.id, status: event.status, ...occupancyGuard },
    });

    if (count > 0) {
      transitions.push({
        eventId: event.id,
        isPublic: event.isPublic,
        serverId: event.serverId,
        transition: kind,
      });
    }
  }

  return transitions;
}

/**
 * Transaction-scoped and connection-local. A hash collision only serializes two unrelated
 * channels; it cannot mix their data. The lock is released automatically on commit/rollback.
 */
export async function lockEventLiveChannel(
  client: Pick<EventLiveLifecycleTransaction, "$queryRaw">,
  channelId: string,
): Promise<void> {
  await client.$queryRaw`
    SELECT 1 AS "locked"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${channelId}, 0))) AS channel_lock
  `;
}

export function publishEventLiveTransitions(
  transitions: readonly EventLiveTransition[],
  publisher: EventLivePublisher,
): void {
  for (const { eventId, isPublic, serverId, transition } of transitions) {
    const payload = { eventId, serverId };
    if (transition === "start") {
      publisher.publishEventLiveStarted(payload, isPublic);
    } else {
      publisher.publishEventLiveEnded(payload, isPublic);
    }
  }
}

export async function syncAndPublishEventLiveStateForChannel(
  database: EventLiveLifecycleDatabase,
  input: { readonly channelId: string; readonly now: Date },
  publisher: EventLivePublisher,
): Promise<EventLiveTransition[]> {
  const transitions = await database.$transaction(async (transaction) => {
    await lockEventLiveChannel(transaction, input.channelId);
    return syncEventLiveStateForChannel(transaction, input);
  });

  publishEventLiveTransitions(transitions, publisher);

  return transitions;
}
