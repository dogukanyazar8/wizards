import type { Prisma, ScheduledEventEntityType, ScheduledEventStatus } from "@wizards/db";
import { SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS } from "@wizards/types";

/**
 * Etkinlikler Ş3 §6 — canlı geçişi.
 *
 * `ScheduledEventStatus.ACTIVE` şemada baştan beri vardı ve bugüne kadar **kimse yazmadı**;
 * `Canlı` sekmesi, ajanda rayındaki nokta ve gezinme panelindeki `--danger` işareti hep bu
 * kolonu okuyor. Bu modül onu yazan tek yer.
 *
 * Geçiş kaynağı **doluluk**tur, olay değil: bir katılma isteği kaybolsa bile bir sonraki
 * çağrı aynı sonucu üretir. Bütün geçişler `updateMany` + `where: { status: <önceki> }` ile
 * korunur, dolayısıyla yarışan iki katılım tek geçiş üretir ve ikinci çağrı 0 satır günceller.
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
  readonly serverId: string;
  readonly transition: EventLiveTransitionKind;
};

export type EventLiveLifecycleClient = {
  readonly scheduledEvent: {
    findMany(args: {
      select: {
        entityType: true;
        id: true;
        scheduledEndAt: true;
        scheduledStartAt: true;
        serverId: true;
        status: true;
      };
      where: { channelId: string; status: { in: readonly ScheduledEventStatus[] } };
    }): Promise<
      readonly {
        readonly entityType: ScheduledEventEntityType;
        readonly id: string;
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
    return input.occupancy > 0 && startMs - nowMs <= EVENT_LIVE_START_WINDOW_MS ? "start" : null;
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

const PREVIOUS_STATUS: Readonly<Record<EventLiveTransitionKind, ScheduledEventStatus>> = {
  end: "ACTIVE",
  start: "SCHEDULED",
};

function durationMinutesOf(startsAt: Date, endsAt: Date | null): number | null {
  return endsAt === null ? null : Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}

/**
 * Bir sesli/sahne kanalının bütün etkinliklerini bugünkü durumuyla eşitler.
 *
 * Çağrı yeri sesli katılma ve ayrılma yollarıdır (`lib/voice/service.ts` →
 * `upsertVoiceState`, `clearVoiceState`, `detachUserFromVoiceSurface`). O dosya bu şeritte
 * **okunur, yazılmaz** olduğu için bağlama Ş4'e devrediliyor; modül ve sözleşmesi burada
 * hazır ve tek satırlık bir çağrıyla takılıyor.
 *
 * TODO(Ş4): `syncEventLiveStateForChannel` çağrısını sesli yaşam döngüsüne bağla ve dönen
 * geçişleri `event:live:started` / `event:live:ended` olarak yayınla.
 */
export async function syncEventLiveStateForChannel(
  client: EventLiveLifecycleClient,
  input: { readonly channelId: string; readonly now: Date },
): Promise<EventLiveTransition[]> {
  const events = await client.scheduledEvent.findMany({
    select: {
      entityType: true,
      id: true,
      scheduledEndAt: true,
      scheduledStartAt: true,
      serverId: true,
      status: true,
    },
    where: { channelId: input.channelId, status: { in: LIVE_LIFECYCLE_STATUSES } },
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

    // `where` önceki durumu taşıyor: iki eşzamanlı katılımın ikincisi 0 satır günceller ve
    // olay iki kez yayılmaz.
    const { count } = await client.scheduledEvent.updateMany({
      data: { status: NEXT_STATUS[kind] },
      where: { id: event.id, status: PREVIOUS_STATUS[kind] },
    });

    if (count > 0) {
      transitions.push({ eventId: event.id, serverId: event.serverId, transition: kind });
    }
  }

  return transitions;
}
