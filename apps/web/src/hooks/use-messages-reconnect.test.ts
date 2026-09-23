import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { QueryClient, InfiniteQueryObserver, replaceEqualDeep } from "@tanstack/react-query";
import type { ChatMessage } from "@wizards/types";
import type { MessagePages } from "./use-messages";

type Mode = "channel" | "dm";

const message = (id: string): ChatMessage => ({
  id,
  channelId: "channel-1",
  content: id,
  author: { id: "other", username: "ada", displayName: "Ada", avatarUrl: null },
  attachments: [],
  reactions: [],
  type: "DEFAULT",
  createdAt: "2026-09-21T00:00:00.000Z",
  deletedAt: null,
  editedAt: null,
});

const dmMessage = (value: ChatMessage) => ({
  ...value,
  conversationId: value.channelId,
  replyTo: null,
});

function createHarness(mode: Mode, options: { cached?: ChatMessage[]; connected?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const effects: Array<() => (() => void) | void> = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const key = ["messages", mode, "channel-1"];
  const held = new Map<number, Promise<void>>();
  const signals = new Map<number, AbortSignal | undefined>();
  let remote = [message("first")];
  let reads = 0;
  let gate: Promise<void> | undefined;
  let unsubscribe: () => void = () => {};
  const read = async (signal?: AbortSignal) => {
    const attempt = ++reads;
    signals.set(attempt, signal);
    const snapshot = [...remote];
    await held.get(attempt);
    await gate;
    return { messages: mode === "dm" ? snapshot.map(dmMessage) : snapshot, nextCursor: null };
  };
  const connected = options.connected ?? true;
  const socket = {
    connected,
    id: connected ? ("connection-1" as string | undefined) : undefined,
    on: (event: string, handler: (...args: unknown[]) => void) => listeners.set(event, handler),
    off: (event: string) => listeners.delete(event),
    timeout() {
      return this;
    },
    emit(event: string, _id: string, ack?: (error: null, result: { ok: boolean }) => void) {
      if (event === `${mode}:join`) queueMicrotask(() => ack?.(null, { ok: true }));
    },
  };
  const file = resolve("src/hooks/use-messages.ts");
  const code = transformSync(readFileSync(file, "utf8"), { format: "cjs", loader: "ts" }).code;
  const testModule = { exports: {} as { useMessages(mode: string, id: string): unknown } };
  runInNewContext(code, {
    module: testModule,
    exports: testModule.exports,
    URL,
    window: { location: { origin: "http://localhost" } },
    fetch: async (_url: URL, init?: { signal?: AbortSignal }) => {
      const snapshot = await read(init?.signal);
      return { ok: true, json: async () => snapshot };
    },
    require(id: string) {
      if (id === "react")
        return {
          useEffect: (fn: (typeof effects)[number]) => effects.push(fn),
          useMemo: (fn: () => unknown) => fn(),
          useRef: (value: unknown) => ({ current: value }),
        };
      if (id === "@tanstack/react-query")
        return {
          replaceEqualDeep,
          useQueryClient: () => client,
          useInfiniteQuery: (
            queryOptions: ConstructorParameters<typeof InfiniteQueryObserver>[1],
          ) => {
            const observer = new InfiniteQueryObserver(client, queryOptions);
            unsubscribe = observer.subscribe(() => {});
            return observer.getCurrentResult();
          },
        };
      if (id === "./use-socket") return { useSocket: () => socket };
      if (id === "@/lib/dm/client")
        return {
          fetchDMMessages: (_id: string, _cursor?: string, request?: { signal?: AbortSignal }) =>
            read(request?.signal),
        };
      throw new Error(`Unexpected import ${id}`);
    },
  });

  if (options.cached) {
    client.setQueryData<MessagePages>(key, {
      pages: [{ messages: options.cached, nextCursor: null }],
      pageParams: [undefined],
    });
  }

  return {
    client,
    key,
    listeners,
    socket,
    get reads() {
      return reads;
    },
    signal(attempt: number) {
      return signals.get(attempt);
    },
    set remote(next: ChatMessage[]) {
      remote = next;
    },
    get remote() {
      return remote;
    },
    set gate(next: Promise<void> | undefined) {
      gate = next;
    },
    /** Keeps the given read (1-based) in flight until the returned release runs. */
    hold(attempt: number) {
      let release!: () => void;
      held.set(
        attempt,
        new Promise<void>((done) => {
          release = done;
        }),
      );
      return release;
    },
    ids() {
      return (
        client
          .getQueryData<MessagePages>(key)
          ?.pages.flatMap((page) => page.messages.map((m) => m.id)) ?? []
      );
    },
    async settle() {
      for (let i = 0; i < 10; i++) await new Promise<void>((done) => setImmediate(done));
    },
    mount() {
      testModule.exports.useMessages(mode, "channel-1");
      const cleanups = effects.map((fn) => fn());
      return () => {
        cleanups.forEach((fn) => fn?.());
        unsubscribe();
        client.clear();
      };
    },
  };
}

for (const mode of ["channel", "dm"] as const) {
  it(`${mode} rejoins then refreshes history, preserves pending sends and events arriving during HTTP`, async () => {
    const harness = createHarness(mode);
    const { client, key, listeners } = harness;
    const cleanup = harness.mount();
    try {
      await harness.settle();
      client.setQueryData<MessagePages>(key, (data) => ({
        ...data!,
        pages: [
          {
            ...data!.pages[0]!,
            messages: [
              ...data!.pages[0]!.messages,
              { ...message("optimistic-pending"), deliveryStatus: "sending" },
              { ...message("optimistic-confirmed"), deliveryStatus: "failed" },
            ],
          },
        ],
      }));
      harness.remote = [
        ...harness.remote,
        message("missed"),
        { ...message("canonical"), clientNonce: "optimistic-confirmed" },
      ];
      const beforeReconnect = harness.reads;
      listeners.get("connect")!();
      await harness.settle();
      assert(harness.reads > beforeReconnect, "a socket reconnect must fetch missed events");
      assert(harness.ids().includes("missed"));
      assert(harness.ids().includes("optimistic-pending"));
      assert(!harness.ids().includes("optimistic-confirmed"));
      let release!: () => void;
      harness.gate = new Promise<void>((done) => {
        release = done;
      });
      const fetching = client.invalidateQueries({ queryKey: key });
      await harness.settle();
      listeners.get(mode === "channel" ? "message:new" : "dm:message:new")!(
        mode === "channel" ? message("during-http") : dmMessage(message("during-http")),
      );
      release();
      await fetching;
      assert(
        harness.ids().includes("during-http"),
        "an old HTTP snapshot cannot overwrite a new socket event",
      );
    } finally {
      cleanup();
    }
  });

  it(`${mode} opening on a connected socket reads history once and keeps the in-flight snapshot`, async () => {
    const harness = createHarness(mode);
    const releaseFirstRead = harness.hold(1);
    const cleanup = harness.mount();
    try {
      // The join acknowledgement lands while the first HTTP read is still in flight.
      await harness.settle();
      releaseFirstRead();
      await harness.settle();
      assert.equal(harness.reads, 1, "the join must not restart a snapshot this view requested");
      assert.deepEqual(harness.ids(), ["first"]);
    } finally {
      cleanup();
    }
  });

  it(`${mode} keeps a snapshot requested before the socket connected, then refreshes it`, async () => {
    const harness = createHarness(mode, { connected: false });
    const releaseFirstRead = harness.hold(1);
    const releaseSecondRead = harness.hold(2);
    const cleanup = harness.mount();
    try {
      await harness.settle();
      harness.remote = [...harness.remote, message("sent-before-join")];
      harness.socket.connected = true;
      harness.socket.id = "connection-1";
      harness.listeners.get("connect")!();
      await harness.settle();
      releaseFirstRead();
      await harness.settle();
      assert.deepEqual(harness.ids(), ["first"], "the first snapshot is shown, not discarded");
      assert.equal(harness.reads, 2, "a snapshot older than the connection is refreshed");
      releaseSecondRead();
      await harness.settle();
      assert(harness.ids().includes("sent-before-join"));
    } finally {
      cleanup();
    }
  });

  it(`${mode} reconnect aborts the history request started on the dropped connection`, async () => {
    const harness = createHarness(mode);
    const cleanup = harness.mount();
    try {
      await harness.settle();
      harness.hold(2);
      void harness.client.invalidateQueries({ queryKey: harness.key });
      await harness.settle();
      assert.equal(harness.reads, 2);
      harness.socket.id = "connection-2";
      harness.listeners.get("connect")!();
      await harness.settle();
      assert.equal(
        harness.signal(2)?.aborted,
        true,
        "the stale request is aborted, not left running",
      );
      assert.equal(harness.reads, 3);
    } finally {
      cleanup();
    }
  });

  it(`${mode} reopening a cached conversation refreshes it once after joining`, async () => {
    const harness = createHarness(mode, { cached: [message("first")] });
    harness.remote = [message("first"), message("while-away")];
    const cleanup = harness.mount();
    try {
      await harness.settle();
      assert.equal(harness.reads, 1);
      assert(harness.ids().includes("while-away"));
    } finally {
      cleanup();
    }
  });
}
