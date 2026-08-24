import type { FocusProjection } from "@/lib/home/focus-machine";
import type {
  AppAwaitingResponse,
  AppRecentResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  HomeAwaitingItem,
  HomeNextEvent,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5 §2. Targeted cache writes for the optimistic paths.
 *
 * The rule for every one of them: **write hopefully, undo on failure, say so.**
 * §7 forbids answering a failure with a `refetch` — a refetch hides the mistake
 * behind a spinner and costs a round trip to say what the client already knew.
 *
 * Every function here is pure and returns a new object (or the same reference
 * when nothing changed, so `React.memo` sees no reason to re-render).
 */

export type RemovedAwaitingRow = {
  /** Where the row sat, so a failed accept puts it back in its own place. */
  readonly index: number;
  readonly item: HomeAwaitingItem;
  readonly newCount: number;
  readonly next: AppAwaitingResponse;
  readonly total: number;
};

/** §2.2 — the row leaves and both counters drop by one, floored at zero. */
export function removeAwaitingItem(
  data: AppAwaitingResponse | undefined,
  id: string,
): RemovedAwaitingRow | null {
  if (!data) {
    return null;
  }

  const index = data.items.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const item = data.items[index]!;

  return {
    index,
    item,
    newCount: data.newCount,
    next: {
      items: [...data.items.slice(0, index), ...data.items.slice(index + 1)],
      newCount: Math.max(0, data.newCount - 1),
      total: Math.max(0, data.total - 1),
    },
    total: data.total,
  };
}

/**
 * §2.2 — the undo. The counters go back to the values that were read, not to
 * "current + 1": a socket event may have moved them while the request was out.
 */
export function restoreAwaitingItem(
  data: AppAwaitingResponse | undefined,
  removed: RemovedAwaitingRow,
): AppAwaitingResponse {
  const items = data?.items ?? [];
  const index = Math.min(removed.index, items.length);

  return {
    items: [...items.slice(0, index), removed.item, ...items.slice(index)],
    newCount: removed.newCount,
    total: removed.total,
  };
}

/** §2.1 — presence and focus only; the summary's counters belong to other events. */
export function applyPresenceProjection(
  data: AppSummaryResponse | undefined,
  projection: FocusProjection,
): AppSummaryResponse | undefined {
  if (!data) {
    return undefined;
  }

  return { ...data, focus: projection.focus, presence: projection.presence };
}

/**
 * §2.3 — `ScheduledEventInterest` is idempotent, so the attendee count moves
 * only when the flag actually flips. A second tap on `Hatırlatılacak` must not
 * inflate the count.
 */
function applyInterestToEvent(
  event: HomeNextEvent,
  input: { eventId: string; interested: boolean },
): HomeNextEvent {
  if (event.id !== input.eventId || event.interested === input.interested) {
    return event;
  }

  return {
    ...event,
    attendeeCount: Math.max(0, event.attendeeCount + (input.interested ? 1 : -1)),
    interested: input.interested,
  };
}

export function applyEventInterest(
  data: EventsUpcomingResponse | undefined,
  input: { eventId: string; interested: boolean },
): EventsUpcomingResponse | undefined {
  if (!data?.next) {
    return data;
  }

  const next = applyInterestToEvent(data.next, input);

  return next === data.next ? data : { ...data, next };
}

/*
 * Ş10 — `applyEventInterestToList` silindi. Faz 6'nın sayfalı Etkinlikler listesi artık yok;
 * `Hatırlat` tek bir önbelleği ("Sıradaki" kartı) yamalıyor.
 */

/**
 * §2.4 — the badge clears the moment the row is followed, because the row is
 * about to be read. The real read receipt is the destination screen's own job;
 * a second "mark read" call from here would be a duplicate write.
 */
export function clearRecentUnread(
  data: AppRecentResponse | undefined,
  id: string,
): AppRecentResponse | undefined {
  if (!data) {
    return undefined;
  }

  const target = data.items.find((item) => item.id === id);
  if (!target || (target.unreadCount === 0 && !target.mentioned)) {
    return data;
  }

  return {
    items: data.items.map((item) =>
      item.id === id ? { ...item, mentioned: false, unreadCount: 0 } : item,
    ),
  };
}
