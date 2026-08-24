import type { QueryClient, QueryKey, UseMutationOptions } from "@tanstack/react-query";

import {
  homeQueryKeys,
  type joinServerByInvite,
  type setHomeEventInterest,
} from "@/lib/home/client";
import type { FocusProjection } from "@/lib/home/focus-machine";
import {
  applyEventInterest,
  applyPresenceProjection,
  removeAwaitingItem,
  restoreAwaitingItem,
  type RemovedAwaitingRow,
} from "@/lib/home/optimistic";
import type {
  AppAwaitingResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  HomeAwaitingItem,
  PresenceUpdateBody,
  PresenceUpdateResponse,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5 §2 and §7. Every optimistic write, as `onMutate` /
 * `onError` / `onSettled` triples.
 *
 * These are plain factories rather than hooks on purpose: a `QueryClient` and a
 * `MutationObserver` run perfectly well without React, so "the row comes back
 * when the endpoint answers 500" is a unit test instead of a promise
 * (`mutations.test.ts`).
 *
 * Failure is answered with a **targeted cache write**, never a refetch (§7): the
 * client already knows what the value was a moment ago, and a round trip to
 * re-learn it shows the user a spinner in place of an answer.
 */

const INVITE_CODE = /^[A-Za-z0-9_-]{1,96}$/;

export type AwaitingAcceptTarget =
  | { readonly kind: "friend_request"; readonly requestId: string }
  | { readonly inviteCode: string; readonly kind: "server_invite" };

/**
 * Which existing endpoint a `Kabul et` row belongs to.
 *
 * The friend request id travels in the row id (`friend_request:<id>`, set by
 * `awaiting-service.ts`); the invite code travels in the row's `actionUrl`,
 * which already passed the relative-path guard. It is re-validated here anyway —
 * the notification row is stored text (§5.1.7) and the code is about to become a
 * request body. The server validates it a third time; none of these three is the
 * security boundary on its own.
 */
export function resolveAwaitingAcceptTarget(item: HomeAwaitingItem): AwaitingAcceptTarget | null {
  if (item.source === "friend_request") {
    const requestId = item.id.slice("friend_request:".length);

    return requestId.length > 0 ? { kind: "friend_request", requestId } : null;
  }

  if (item.source !== "server_invite") {
    return null;
  }

  const segments = item.href.split("?")[0]!.split("/");
  if (segments.length !== 3 || segments[1] !== "invite") {
    return null;
  }

  let inviteCode: string;
  try {
    inviteCode = decodeURIComponent(segments[2]!);
  } catch {
    return null;
  }

  return INVITE_CODE.test(inviteCode) ? { inviteCode, kind: "server_invite" } : null;
}

export type AcceptAwaitingContext = RemovedAwaitingRow | null;

export function createAcceptAwaitingMutation(input: {
  acceptFriendRequest: (requestId: string) => Promise<unknown>;
  awaitingKey: QueryKey;
  joinServerByInvite: typeof joinServerByInvite;
  /** Told after the cache has been put back, so the card can say what happened. */
  onFailure?: () => void;
  /** Where the caller lands after joining a server; absent on a friend request. */
  onJoined?: (href: string) => void;
  queryClient: QueryClient;
}): UseMutationOptions<void, unknown, HomeAwaitingItem, AcceptAwaitingContext> {
  const { awaitingKey, queryClient } = input;

  return {
    mutationFn: async (item) => {
      const target = resolveAwaitingAcceptTarget(item);

      // Refusing here rather than guessing keeps a malformed row from spending
      // a request; `onError` has already put it back by the time this throws.
      if (!target) {
        throw new Error(`Unsupported awaiting row: ${item.id}`);
      }

      if (target.kind === "friend_request") {
        await input.acceptFriendRequest(target.requestId);
        return;
      }

      const joined = await input.joinServerByInvite(target.inviteCode);
      input.onJoined?.(joined.href);
    },
    onError: (_error, _item, context) => {
      if (context) {
        queryClient.setQueryData<AppAwaitingResponse>(awaitingKey, (current) =>
          restoreAwaitingItem(current, context),
        );
      }

      input.onFailure?.();
    },
    onMutate: async (item) => {
      // An in-flight refetch would land after the optimistic write and undo it.
      await queryClient.cancelQueries({ queryKey: awaitingKey });

      const removed = removeAwaitingItem(
        queryClient.getQueryData<AppAwaitingResponse>(awaitingKey),
        item.id,
      );

      if (removed) {
        queryClient.setQueryData<AppAwaitingResponse>(awaitingKey, removed.next);
      }

      return removed;
    },
    onSuccess: async () => {
      // §2.2. Both lists changed shape server-side: the request is gone, and the
      // summary's pending count moved with it.
      await queryClient.invalidateQueries({ queryKey: awaitingKey });
      await queryClient.invalidateQueries({ queryKey: homeQueryKeys.summary });
    },
  };
}

export type PresenceMutationVariables = {
  readonly body: PresenceUpdateBody;
  readonly optimistic: FocusProjection;
};

export function createPresenceMutation(input: {
  onFailure?: () => void;
  queryClient: QueryClient;
  updatePresence: (body: PresenceUpdateBody) => Promise<PresenceUpdateResponse>;
}): UseMutationOptions<
  PresenceUpdateResponse,
  unknown,
  PresenceMutationVariables,
  AppSummaryResponse | undefined
> {
  const { queryClient } = input;

  return {
    mutationFn: (variables) => input.updatePresence(variables.body),
    onError: (_error, _variables, previous) => {
      queryClient.setQueryData<AppSummaryResponse>(homeQueryKeys.summary, previous);
      input.onFailure?.();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: homeQueryKeys.summary });
      const previous = queryClient.getQueryData<AppSummaryResponse>(homeQueryKeys.summary);

      queryClient.setQueryData<AppSummaryResponse>(homeQueryKeys.summary, (current) =>
        applyPresenceProjection(current, variables.optimistic),
      );

      return previous;
    },
    onSuccess: (result) => {
      // The endpoint's answer is the same value the sweep and `presence:update`
      // will publish, so writing it here just gets there first.
      queryClient.setQueryData<AppSummaryResponse>(homeQueryKeys.summary, (current) =>
        applyPresenceProjection(current, result),
      );
    },
  };
}

export type EventInterestVariables = {
  readonly eventId: string;
  readonly interested: boolean;
  readonly serverId: string;
};

export type EventInterestSnapshot = {
  readonly upcoming: EventsUpcomingResponse | undefined;
};

/**
 * `Hatırlat` — tek önbellek.
 *
 * Ana Sayfa'nın kartı `events/upcoming` okuyor. Faz 6'nın sayfalı `events/list` ekranı Ş10'da
 * **silindi**, dolayısıyla ikinci bir önbellek yok: yama tek yerde yazılıyor ve başarısızlıkta
 * tek yerden geri alınıyor — yine `refetch` yok (§7).
 */
export function createEventInterestMutation(input: {
  onFailure?: () => void;
  queryClient: QueryClient;
  setInterest: typeof setHomeEventInterest;
  upcomingKey: QueryKey;
}): UseMutationOptions<void, unknown, EventInterestVariables, EventInterestSnapshot> {
  const { queryClient, upcomingKey } = input;

  return {
    mutationFn: (variables) => input.setInterest(variables),
    onError: (_error, _variables, previous) => {
      queryClient.setQueryData<EventsUpcomingResponse>(upcomingKey, previous?.upcoming);

      input.onFailure?.();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: upcomingKey });
      const upcoming = queryClient.getQueryData<EventsUpcomingResponse>(upcomingKey);

      queryClient.setQueryData<EventsUpcomingResponse>(upcomingKey, (current) =>
        applyEventInterest(current, variables),
      );

      return { upcoming };
    },
  };
}
