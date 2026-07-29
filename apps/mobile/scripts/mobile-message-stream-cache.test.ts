import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  hydrateMobileMessageStream,
  persistMobileMessageStream,
} from "../src/query/mobile-message-stream-cache";
import type { MobileMessageStore } from "../src/storage/mobile-message-store";

const page = { channel: { id: "channel-1" }, hasMore: false, messages: [{ id: "m-1" }] };

function createRecordingStore(stored: Record<string, unknown> = {}): MobileMessageStore & {
  readonly writes: { payload: unknown; scope: string; targetId: string; userId: string }[];
} {
  const writes: { payload: unknown; scope: string; targetId: string; userId: string }[] = [];
  return {
    writes,
    appendPerformanceSamples: async () => undefined,
    close: async () => undefined,
    describe: async () => ({ cipherVersion: "4.5.5 test", rowCount: 0, status: "open" as const }),
    purgeAll: async () => undefined,
    purgePerformanceSamples: async () => undefined,
    purgeUser: async () => undefined,
    resume: () => undefined,
    readPage: async ({ scope, targetId, userId }) =>
      stored[`${userId}:${scope}:${targetId}`] ?? null,
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

    assert.equal(hydrated, true);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.channelMessages("channel-1")), {
      pageParams: [null],
      pages: [page],
    });
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

    assert.equal(hydrated, false);
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
      false,
    );
    assert.equal(
      await hydrateMobileMessageStream({
        queryClient,
        scope: "dm",
        store,
        targetId: "conversation-9",
        userId: "user-1",
      }),
      false,
    );
    queryClient.clear();
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
