import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  dropMobileMessageStream,
  hydrateMobileMessageStream,
  isMobileMessageStreamRevoked,
  persistMobileMessageStream,
} from "../src/query/mobile-message-stream-cache";
import type { MobileMessageStore } from "../src/storage/mobile-message-store";

const page = { channel: { id: "channel-1" }, hasMore: false, messages: [{ id: "m-1" }] };

const STORED_AT_MS = 1_700_000_000_000;

function createRecordingStore(stored: Record<string, unknown> = {}): MobileMessageStore & {
  readonly deletes: { scope: string; targetId: string; userId: string }[];
  readonly writes: { payload: unknown; scope: string; targetId: string; userId: string }[];
} {
  const deletes: { scope: string; targetId: string; userId: string }[] = [];
  const writes: { payload: unknown; scope: string; targetId: string; userId: string }[] = [];
  return {
    deletes,
    writes,
    appendPerformanceSamples: async () => undefined,
    close: async () => undefined,
    deletePage: async ({ scope, targetId, userId }) => {
      deletes.push({ scope, targetId, userId });
    },
    describe: async () => ({ cipherVersion: "4.5.5 test", rowCount: 0, status: "open" as const }),
    purgeAll: async () => undefined,
    purgePerformanceSamples: async () => undefined,
    purgeUser: async () => undefined,
    resume: () => undefined,
    readPage: async ({ scope, targetId, userId }) =>
      stored[`${userId}:${scope}:${targetId}`] ?? null,
    readPageEntry: async ({ scope, targetId, userId }) => {
      const payload = stored[`${userId}:${scope}:${targetId}`];
      return payload === undefined ? null : { payload, updatedAt: STORED_AT_MS };
    },
    readPerformanceSamples: async () => [],
    writePage: async ({ payload, scope, targetId, userId }) => {
      writes.push({ payload, scope, targetId, userId });
    },
  };
}

describe("hydrateMobileMessageStream", () => {
  it("seeds an empty stream from the encrypted cache", async () => {
    const queryClient = new QueryClient();
    const store = createRecordingStore({ "user-1:channel:channel-1": page });

    const hydrated = await hydrateMobileMessageStream({
      queryClient,
      scope: "channel",
      store,
      targetId: "channel-1",
      userId: "user-1",
    });

    assert.equal(hydrated, STORED_AT_MS);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.channelMessages("channel-1")), {
      pageParams: [null],
      pages: [page],
    });
    // Dated to the write. Seeded as fresh, the stream would hold for its whole
    // stale window and the network would never reconcile a day-old page.
    assert.equal(
      queryClient.getQueryState(mobileQueryKeys.channelMessages("channel-1"))?.dataUpdatedAt,
      STORED_AT_MS,
    );
    queryClient.clear();
  });

  it("never overwrites a stream the session already holds", async () => {
    const queryClient = new QueryClient();
    const live = { pageParams: [null], pages: [{ ...page, messages: [{ id: "live" }] }] };
    queryClient.setQueryData(mobileQueryKeys.dmMessages("conversation-1"), live);

    const hydrated = await hydrateMobileMessageStream({
      queryClient,
      scope: "dm",
      store: createRecordingStore({ "user-1:dm:conversation-1": page }),
      targetId: "conversation-1",
      userId: "user-1",
    });

    assert.equal(hydrated, null);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.dmMessages("conversation-1")), live);
    queryClient.clear();
  });

  it("does nothing without a target or a stored page", async () => {
    const queryClient = new QueryClient();
    const store = createRecordingStore();

    assert.equal(
      await hydrateMobileMessageStream({
        queryClient,
        scope: "dm",
        store,
        targetId: "",
        userId: "user-1",
      }),
      null,
    );
    assert.equal(
      await hydrateMobileMessageStream({
        queryClient,
        scope: "dm",
        store,
        targetId: "conversation-9",
        userId: "user-1",
      }),
      null,
    );
    queryClient.clear();
  });
});

describe("dropMobileMessageStream", () => {
  it("takes a revoked conversation out of memory and off disk", async () => {
    const queryClient = new QueryClient();
    const store = createRecordingStore({ "user-1:dm:conversation-1": page });
    queryClient.setQueryData(mobileQueryKeys.dmMessages("conversation-1"), {
      pageParams: [null],
      pages: [page],
    });

    await dropMobileMessageStream({
      queryClient,
      scope: "dm",
      store,
      targetId: "conversation-1",
      userId: "user-1",
    });

    assert.equal(queryClient.getQueryData(mobileQueryKeys.dmMessages("conversation-1")), undefined);
    assert.deepEqual(store.deletes, [
      { scope: "dm", targetId: "conversation-1", userId: "user-1" },
    ]);
    queryClient.clear();
  });

  it("names the statuses that mean the reader lost access", () => {
    assert.equal(isMobileMessageStreamRevoked({ status: 403 }), true);
    assert.equal(isMobileMessageStreamRevoked({ status: 404 }), true);
    // A session problem, handled by the session layer's own wipe.
    assert.equal(isMobileMessageStreamRevoked({ status: 401 }), false);
    assert.equal(isMobileMessageStreamRevoked({ status: 500 }), false);
    assert.equal(isMobileMessageStreamRevoked(new Error("offline")), false);
    assert.equal(isMobileMessageStreamRevoked(null), false);
  });
});

describe("persistMobileMessageStream", () => {
  it("stores only the newest page of the stream", async () => {
    const store = createRecordingStore();
    const older = { ...page, messages: [{ id: "m-0" }] };

    await persistMobileMessageStream({
      data: { pageParams: [null, "cursor-1"], pages: [page, older] },
      scope: "channel",
      store,
      targetId: "channel-1",
      userId: "user-1",
    });

    assert.deepEqual(store.writes, [
      { payload: page, scope: "channel", targetId: "channel-1", userId: "user-1" },
    ]);
  });

  it("writes nothing for an empty stream or a missing target", async () => {
    const store = createRecordingStore();

    await persistMobileMessageStream({
      data: undefined,
      scope: "dm",
      store,
      targetId: "conversation-1",
      userId: "user-1",
    });
    await persistMobileMessageStream({
      data: { pageParams: [], pages: [] },
      scope: "dm",
      store,
      targetId: "conversation-1",
      userId: "user-1",
    });
    await persistMobileMessageStream({
      data: { pageParams: [null], pages: [page] },
      scope: "dm",
      store,
      targetId: "",
      userId: "user-1",
    });

    assert.deepEqual(store.writes, []);
  });
});
