import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MutationObserver, QueryClient, type UseMutationOptions } from "@tanstack/react-query";

import { homeQueryKeys } from "@/lib/home/client";
import {
  createAcceptAwaitingMutation,
  createEventInterestMutation,
  createPresenceMutation,
  resolveAwaitingAcceptTarget,
} from "@/lib/home/mutations";
import type {
  AppAwaitingResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  HomeAwaitingItem,
} from "@/lib/home/types";

/**
 * `06-faz5` §8 — "optimistic yollar hata senaryosunda geri alıyor (test: uç 500
 * döndürünce satır geri geliyor)".
 *
 * These run a real `QueryClient` against real mutation options, so the assertion
 * is about what the cache actually holds after a rejected request — not about
 * whether an `onError` handler exists.
 */

const AWAITING_KEY = homeQueryKeys.awaiting(4);
const UPCOMING_KEY = homeQueryKeys.upcoming(3);

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function client() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

async function run<TData, TVariables, TContext>(
  queryClient: QueryClient,
  options: UseMutationOptions<TData, unknown, TVariables, TContext>,
  variables: TVariables,
): Promise<"rejected" | "resolved"> {
  const observer = new MutationObserver(queryClient, options);

  try {
    await observer.mutate(variables);
    return "resolved";
  } catch {
    return "rejected";
  }
}

function awaitingItem(overrides: Partial<HomeAwaitingItem> = {}): HomeAwaitingItem {
  return {
    action: "accept",
    context: "",
    href: "/messages",
    id: "friend_request:req-1",
    occurredAt: "2026-08-19T11:00:00.000Z",
    reason: "",
    source: "friend_request",
    user: { avatarUrl: null, displayName: "Selin", id: "u2", presence: "ONLINE" },
    ...overrides,
  };
}

const AWAITING: AppAwaitingResponse = {
  items: [awaitingItem(), awaitingItem({ id: "reply:m1", source: "reply" })],
  newCount: 2,
  total: 2,
};

const SUMMARY: AppSummaryResponse = {
  dateLabel: "2026-08-19T12:00:00.000Z",
  dmUnread: 0,
  focus: null,
  greetingName: "Alice",
  pendingReplies: 2,
  presence: "ONLINE",
  unreadMentions: 0,
};

describe("resolveAwaitingAcceptTarget", () => {
  it("reads the friend request id out of the row id", () => {
    assert.deepEqual(resolveAwaitingAcceptTarget(awaitingItem()), {
      kind: "friend_request",
      requestId: "req-1",
    });
  });

  it("reads the invite code out of the row's own href", () => {
    assert.deepEqual(
      resolveAwaitingAcceptTarget(
        awaitingItem({ href: "/invite/AbC-1_x", id: "server_invite:n1", source: "server_invite" }),
      ),
      { inviteCode: "AbC-1_x", kind: "server_invite" },
    );
  });

  it("refuses an invite href that is not an invite path or not a legal code", () => {
    for (const href of ["/messages", "/invite/", "/invite/a%2Fb", "/invite/" + "a".repeat(97)]) {
      assert.equal(
        resolveAwaitingAcceptTarget(
          awaitingItem({ href, id: "server_invite:n1", source: "server_invite" }),
        ),
        null,
        href,
      );
    }
  });

  it("has nothing to accept on a mention or a reply", () => {
    assert.equal(
      resolveAwaitingAcceptTarget(
        awaitingItem({ action: "reply", id: "reply:m1", source: "reply" }),
      ),
      null,
    );
  });
});

describe("accept mutation", () => {
  function options(
    queryClient: QueryClient,
    overrides: Partial<Parameters<typeof createAcceptAwaitingMutation>[0]> = {},
  ) {
    return createAcceptAwaitingMutation({
      acceptFriendRequest: async () => undefined,
      awaitingKey: AWAITING_KEY,
      joinServerByInvite: async () => ({
        alreadyMember: false,
        href: "/channels/s1/c1",
        serverId: "s1",
      }),
      queryClient,
      ...overrides,
    });
  }

  it("removes the row and drops the counter before the request resolves", async () => {
    const queryClient = client();
    queryClient.setQueryData(AWAITING_KEY, AWAITING);

    // Read from inside the request: that is precisely "the row is already gone
    // while the accept is still in flight".
    let inFlight: AppAwaitingResponse | undefined;
    await run(
      queryClient,
      options(queryClient, {
        acceptFriendRequest: async () => {
          inFlight = queryClient.getQueryData<AppAwaitingResponse>(AWAITING_KEY);
        },
      }),
      awaitingItem(),
    );

    assert.deepEqual(
      inFlight?.items.map((item) => item.id),
      ["reply:m1"],
    );
    assert.equal(inFlight?.newCount, 1);
    assert.equal(inFlight?.total, 1);
  });

  it("puts the row and the counter back when the endpoint answers 500", async () => {
    const queryClient = client();
    queryClient.setQueryData(AWAITING_KEY, AWAITING);

    const outcome = await run(
      queryClient,
      options(queryClient, {
        acceptFriendRequest: async () => {
          throw new HttpError(500);
        },
      }),
      awaitingItem(),
    );

    assert.equal(outcome, "rejected");
    assert.deepEqual(queryClient.getQueryData<AppAwaitingResponse>(AWAITING_KEY), AWAITING);
  });

  it("puts the row back when a server invite is refused", async () => {
    const queryClient = client();
    const invite = awaitingItem({
      href: "/invite/AbC-1",
      id: "server_invite:n1",
      source: "server_invite",
    });
    queryClient.setQueryData(AWAITING_KEY, { items: [invite], newCount: 1, total: 1 });

    const outcome = await run(
      queryClient,
      options(queryClient, {
        joinServerByInvite: async () => {
          throw new HttpError(403);
        },
      }),
      invite,
    );

    assert.equal(outcome, "rejected");
    assert.deepEqual(queryClient.getQueryData<AppAwaitingResponse>(AWAITING_KEY), {
      items: [invite],
      newCount: 1,
      total: 1,
    });
  });

  it("routes a friend request to the friends endpoint and an invite to the join endpoint", async () => {
    const queryClient = client();
    const calls: string[] = [];
    const shared = options(queryClient, {
      acceptFriendRequest: async (requestId: string) => {
        calls.push(`friend:${requestId}`);
      },
      joinServerByInvite: async (inviteCode: string) => {
        calls.push(`invite:${inviteCode}`);
        return { alreadyMember: false, href: "/channels/s1", serverId: "s1" };
      },
    });

    await run(queryClient, shared, awaitingItem());
    await run(
      queryClient,
      shared,
      awaitingItem({ href: "/invite/AbC-1", id: "server_invite:n1", source: "server_invite" }),
    );

    assert.deepEqual(calls, ["friend:req-1", "invite:AbC-1"]);
  });

  it("refuses to fire at all for a row it cannot resolve, leaving the cache alone", async () => {
    const queryClient = client();
    queryClient.setQueryData(AWAITING_KEY, AWAITING);
    let called = false;

    const outcome = await run(
      queryClient,
      options(queryClient, {
        acceptFriendRequest: async () => {
          called = true;
        },
      }),
      awaitingItem({ id: "friend_request:", source: "friend_request" }),
    );

    assert.equal(outcome, "rejected");
    assert.equal(called, false);
    assert.deepEqual(queryClient.getQueryData<AppAwaitingResponse>(AWAITING_KEY), AWAITING);
  });

  it("invalidates awaiting and summary once the accept lands", async () => {
    const queryClient = client();
    queryClient.setQueryData(AWAITING_KEY, AWAITING);
    queryClient.setQueryData(homeQueryKeys.summary, SUMMARY);
    const invalidated: string[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (filters?: { queryKey?: readonly unknown[] }) => {
      invalidated.push(JSON.stringify(filters?.queryKey));
      return original(filters);
    };

    await run(queryClient, options(queryClient), awaitingItem());

    assert.deepEqual(invalidated, [
      JSON.stringify(AWAITING_KEY),
      JSON.stringify(homeQueryKeys.summary),
    ]);
  });
});

describe("presence mutation", () => {
  it("writes the projection immediately and the server's answer afterwards", async () => {
    const queryClient = client();
    queryClient.setQueryData(homeQueryKeys.summary, SUMMARY);

    await run(
      queryClient,
      createPresenceMutation({
        queryClient,
        updatePresence: async () => ({
          focus: {
            active: true,
            expiresAt: "2026-08-19T12:25:00.000Z",
            minutesLeft: 25,
            totalMinutes: 25,
          },
          presence: "DND",
        }),
      }),
      {
        body: { focus: { enabled: true, minutes: 25 } },
        optimistic: {
          focus: {
            active: true,
            expiresAt: "2026-08-19T12:25:00.000Z",
            minutesLeft: 25,
            totalMinutes: 25,
          },
          presence: "DND" as const,
        },
      },
    );

    const summary = queryClient.getQueryData<AppSummaryResponse>(homeQueryKeys.summary);
    assert.equal(summary?.presence, "DND");
    assert.equal(summary?.focus?.minutesLeft, 25);
  });

  it("returns the chip to its previous value when the write fails", async () => {
    const queryClient = client();
    queryClient.setQueryData(homeQueryKeys.summary, SUMMARY);

    const outcome = await run(
      queryClient,
      createPresenceMutation({
        queryClient,
        updatePresence: async () => {
          throw new HttpError(500);
        },
      }),
      {
        body: { presence: "DND" as const },
        optimistic: { focus: null, presence: "DND" as const },
      },
    );

    assert.equal(outcome, "rejected");
    assert.deepEqual(queryClient.getQueryData<AppSummaryResponse>(homeQueryKeys.summary), SUMMARY);
  });
});

describe("event interest mutation", () => {
  const upcoming: EventsUpcomingResponse = {
    next: {
      attendeeCount: 4,
      attendees: [],
      context: "Tasarım",
      href: "/servers/s1/about?event=e1",
      id: "e1",
      interested: false,
      serverId: "s1",
      startAt: "2026-08-19T13:00:00.000Z",
      title: "Sprint",
    },
    totalCount: 1,
    upcoming: [],
  };

  it("marks the button as reminded and keeps it that way", async () => {
    const queryClient = client();
    queryClient.setQueryData(UPCOMING_KEY, upcoming);

    await run(
      queryClient,
      createEventInterestMutation({
        queryClient,
        setInterest: async () => undefined,
        upcomingKey: UPCOMING_KEY,
      }),
      { eventId: "e1", interested: true, serverId: "s1" },
    );

    const next = queryClient.getQueryData<EventsUpcomingResponse>(UPCOMING_KEY);
    assert.equal(next?.next?.interested, true);
    assert.equal(next?.next?.attendeeCount, 5);
  });

  it("un-marks it when the second tap removes the interest", async () => {
    const queryClient = client();
    queryClient.setQueryData(UPCOMING_KEY, {
      ...upcoming,
      next: { ...upcoming.next!, attendeeCount: 5, interested: true },
    });

    await run(
      queryClient,
      createEventInterestMutation({
        queryClient,
        setInterest: async () => undefined,
        upcomingKey: UPCOMING_KEY,
      }),
      { eventId: "e1", interested: false, serverId: "s1" },
    );

    assert.equal(
      queryClient.getQueryData<EventsUpcomingResponse>(UPCOMING_KEY)?.next?.interested,
      false,
    );
  });

  it("rolls the button back when the interest write fails", async () => {
    const queryClient = client();
    queryClient.setQueryData(UPCOMING_KEY, upcoming);

    const outcome = await run(
      queryClient,
      createEventInterestMutation({
        queryClient,
        setInterest: async () => {
          throw new HttpError(500);
        },
        upcomingKey: UPCOMING_KEY,
      }),
      { eventId: "e1", interested: true, serverId: "s1" },
    );

    assert.equal(outcome, "rejected");
    assert.deepEqual(queryClient.getQueryData<EventsUpcomingResponse>(UPCOMING_KEY), upcoming);
  });

  /*
   * Ş10 — Faz 6'nın sayfalı Etkinlikler listesi silindi; `Hatırlat` tek önbellek yamalıyor,
   * o yüzden "iki önbellek birden" süiti de kalktı.
   */
});
