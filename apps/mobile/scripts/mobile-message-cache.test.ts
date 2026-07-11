import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import { getMobileBootstrapQueryOptions } from "../src/query/mobile-bootstrap-query";
import {
  applyMobileOptimisticMessageReaction,
  appendOrReplaceMobileMessage,
  flattenMobileInfiniteData,
  insertOptimisticMobileMessage,
  replaceMobileMessageReactions,
  replaceMobileMessage,
  updateMobileMessageContent,
  restoreMobileMessageSnapshot,
  removeMobileMessage,
  softDeleteMobileMessage,
} from "../src/query/mobile-message-cache";
import {
  getMobileChannelMessagesQueryOptions,
  getMobileDMMessagesQueryOptions,
} from "../src/query/mobile-message-queries";
import { getMobileMessageSearchQueryOptions } from "../src/query/mobile-message-search-query";
import { getMobileWorkspaceQueryOptions } from "../src/query/mobile-workspace-query";
import {
  createMobileOptimisticMutationOptions,
  createMobileOptimisticDeleteMutationOptions,
  createMobileOptimisticEditMutationOptions,
  createMobileOptimisticReactionMutationOptions,
} from "../src/query/use-mobile-message-mutations";

type TestMessage = {
  readonly content: string;
  readonly id: string;
};

type TestPage = {
  readonly messages: readonly TestMessage[];
  readonly nextCursor: string | null;
};

function createData(): InfiniteData<TestPage, string | null> {
  return {
    pageParams: [null, "older"],
    pages: [
      {
        messages: [
          { content: "two", id: "2" },
          { content: "three", id: "3" },
        ],
        nextCursor: "older",
      },
      {
        messages: [{ content: "one", id: "1" }],
        nextCursor: null,
      },
    ],
  };
}

test("optimistic messages append to the newest page", () => {
  const optimistic = { content: "sending", id: "client-1" };
  const inserted = insertOptimisticMobileMessage(createData(), optimistic);

  assert.equal(flattenMobileInfiniteData(inserted).at(-1)?.id, optimistic.id);
});

test("server responses replace optimistic ids and realtime echoes deduplicate", () => {
  const optimistic = { content: "sending", id: "client-1" };
  const serverMessage = { content: "sent", id: "server-1" };
  const inserted = insertOptimisticMobileMessage(createData(), optimistic);
  const replaced = replaceMobileMessage(inserted, optimistic.id, serverMessage);
  const echoed = appendOrReplaceMobileMessage(replaced, serverMessage);

  assert.equal(flattenMobileInfiniteData(echoed).at(-1)?.id, serverMessage.id);
  assert.equal(
    flattenMobileInfiniteData(echoed).filter(({ id }) => id === serverMessage.id).length,
    1,
  );
});

test("failed optimistic mutations restore the exact query snapshot", () => {
  const snapshot = createData();
  const inserted = insertOptimisticMobileMessage(snapshot, {
    content: "sending",
    id: "client-1",
  });

  assert.equal(restoreMobileMessageSnapshot(inserted, snapshot), snapshot);
});

test("cache helpers preserve an absent query cache", () => {
  const message = { content: "sending", id: "client-1" };
  assert.equal(insertOptimisticMobileMessage(undefined, message), undefined);
  assert.equal(replaceMobileMessage(undefined, message.id, message), undefined);
  assert.equal(appendOrReplaceMobileMessage(undefined, message), undefined);
  assert.equal(removeMobileMessage(undefined, message.id), undefined);
});

test("message cache removal updates only the requested message", () => {
  const data = createData();
  const next = removeMobileMessage(data, "2");

  assert.deepEqual(
    flattenMobileInfiniteData(next).map((message) => message.id),
    ["1", "3"],
  );
  assert.equal(removeMobileMessage(data, "missing"), data);
});

test("soft deletion keeps a bounded placeholder and clears sensitive message fields", () => {
  const data: InfiniteData<
    {
      messages: readonly (TestMessage & {
        attachments: string[];
        deletedAt: string | null;
        reactions: never[];
      })[];
      nextCursor: null;
    },
    string | null
  > = {
    pageParams: [null],
    pages: [
      {
        messages: [
          { attachments: ["private"], content: "secret", deletedAt: null, id: "1", reactions: [] },
        ],
        nextCursor: null,
      },
    ],
  };
  const next = softDeleteMobileMessage(data, "1", "2026-07-11T12:00:00.000Z");

  assert.deepEqual(next?.pages[0]?.messages[0], {
    attachments: [],
    content: "",
    deletedAt: "2026-07-11T12:00:00.000Z",
    id: "1",
    reactions: [],
  });
});

test("message cache edits update only the target content and edited timestamp", () => {
  const data = createData();
  const next = updateMobileMessageContent(data, "2", "updated", "2026-07-11T12:00:00.000Z");

  assert.deepEqual(flattenMobileInfiniteData(next), [
    { content: "one", id: "1" },
    { content: "updated", editedAt: "2026-07-11T12:00:00.000Z", id: "2" },
    { content: "three", id: "3" },
  ]);
  assert.equal(updateMobileMessageContent(data, "missing", "updated", "now"), data);
});

test("reaction cache helpers update only the targeted message and preserve server reaction shape", () => {
  type ReactionTestMessage = TestMessage & {
    readonly reactions: readonly { count: number; emoji: string; userIds: string[] }[];
  };
  type ReactionTestPage = {
    readonly messages: readonly ReactionTestMessage[];
    readonly nextCursor: string | null;
  };
  const data: InfiniteData<ReactionTestPage, string | null> = {
    pageParams: [null],
    pages: [
      {
        messages: [
          {
            content: "target",
            id: "message-1",
            reactions: [{ count: 1, emoji: "thumbs-up", userIds: ["user-2"] }],
          },
          { content: "other", id: "message-2", reactions: [] },
        ],
        nextCursor: null,
      },
    ],
  };

  const optimisticallyReacted = applyMobileOptimisticMessageReaction(
    data,
    "message-1",
    "thumbs-up",
    "user-1",
    true,
  );
  const optimisticallyUnreacted = applyMobileOptimisticMessageReaction(
    optimisticallyReacted,
    "message-1",
    "thumbs-up",
    "user-1",
    false,
  );
  const serverConfirmed = replaceMobileMessageReactions(optimisticallyUnreacted, "message-1", [
    { count: 3, emoji: "sparkles", userIds: ["user-1", "user-2", "user-3"] },
  ]);

  assert.deepEqual(optimisticallyReacted?.pages[0]?.messages[0]?.reactions, [
    { count: 2, emoji: "thumbs-up", userIds: ["user-2", "user-1"] },
  ]);
  assert.deepEqual(optimisticallyUnreacted?.pages[0]?.messages[0]?.reactions, [
    { count: 1, emoji: "thumbs-up", userIds: ["user-2"] },
  ]);
  assert.deepEqual(serverConfirmed?.pages[0]?.messages[0]?.reactions, [
    { count: 3, emoji: "sparkles", userIds: ["user-1", "user-2", "user-3"] },
  ]);
  assert.equal(serverConfirmed?.pages[0]?.messages[1], data.pages[0]?.messages[1]);
});

test("optimistic reaction mutations confirm server reactions and restore the exact snapshot on failure", async () => {
  type ReactionTestMessage = TestMessage & {
    readonly reactions: readonly { count: number; emoji: string; userIds: string[] }[];
  };
  type ReactionTestPage = {
    readonly messages: readonly ReactionTestMessage[];
    readonly nextCursor: string | null;
  };
  const queryClient = new QueryClient();
  const queryKey = ["mobile", "dm-messages", "conversation-1"] as const;
  const snapshot: InfiniteData<ReactionTestPage, string | null> = {
    pageParams: [null],
    pages: [
      {
        messages: [
          {
            content: "target",
            id: "message-1",
            reactions: [{ count: 1, emoji: "thumbs-up", userIds: ["user-2"] }],
          },
          { content: "other", id: "message-2", reactions: [] },
        ],
        nextCursor: null,
      },
    ],
  };
  queryClient.setQueryData(queryKey, snapshot);

  const options = createMobileOptimisticReactionMutationOptions({
    getUserId: () => "user-1",
    getResponseReactions: (response: { reactions: ReactionTestMessage["reactions"] }) =>
      response.reactions,
    mutationFn: async () => ({
      reactions: [{ count: 2, emoji: "thumbs-up", userIds: ["user-2", "user-1"] }],
    }),
    queryClient,
    queryKey,
  });
  const variables = { emoji: "thumbs-up", messageId: "message-1", shouldReact: true };
  const successContext = await options.onMutate!(variables, {} as never);

  assert.deepEqual(
    queryClient.getQueryData<InfiniteData<ReactionTestPage, string | null>>(queryKey),
    {
      pageParams: [null],
      pages: [
        {
          messages: [
            {
              content: "target",
              id: "message-1",
              reactions: [{ count: 2, emoji: "thumbs-up", userIds: ["user-2", "user-1"] }],
            },
            { content: "other", id: "message-2", reactions: [] },
          ],
          nextCursor: null,
        },
      ],
    },
  );

  await options.onSuccess!(
    { reactions: [{ count: 1, emoji: "heart", userIds: ["user-1"] }] },
    variables,
    successContext,
    {} as never,
  );
  assert.deepEqual(
    queryClient.getQueryData<InfiniteData<ReactionTestPage, string | null>>(queryKey)?.pages[0]
      ?.messages[0]?.reactions,
    [{ count: 1, emoji: "heart", userIds: ["user-1"] }],
  );

  queryClient.setQueryData(queryKey, snapshot);
  const failureContext = await options.onMutate!(variables, {} as never);
  await options.onError!(new Error("failed"), variables, failureContext, {} as never);
  assert.deepEqual(queryClient.getQueryData(queryKey), snapshot);
});

test("optimistic delete mutations remove the target and restore the snapshot on failure", async () => {
  const queryClient = new QueryClient();
  const queryKey = ["mobile", "dm-messages", "conversation-1"] as const;
  const snapshot = createData();
  queryClient.setQueryData(queryKey, snapshot);
  const options = createMobileOptimisticDeleteMutationOptions({
    mutationFn: async () => ({ status: "removed" as const }),
    queryClient,
    queryKey,
  });
  const variables = { messageId: "2" };
  const context = await options.onMutate!(variables, {} as never);

  assert.deepEqual(
    flattenMobileInfiniteData(queryClient.getQueryData(queryKey)).map((message) => message.id),
    ["1", "3"],
  );
  await options.onError!(new Error("failed"), variables, context, {} as never);
  assert.deepEqual(queryClient.getQueryData(queryKey), snapshot);
});

test("optimistic edit mutations replace server messages and restore the snapshot on failure", async () => {
  const queryClient = new QueryClient();
  const queryKey = ["mobile", "dm-messages", "conversation-1"] as const;
  const snapshot = createData();
  queryClient.setQueryData(queryKey, snapshot);
  const options = createMobileOptimisticEditMutationOptions({
    getResponseMessage: (response: { message: TestMessage }) => response.message,
    mutationFn: async () => ({ message: { content: "server", id: "2" } }),
    queryClient,
    queryKey,
  });
  const variables = { content: "optimistic", messageId: "2" };
  const context = await options.onMutate!(variables, {} as never);

  assert.equal(
    flattenMobileInfiniteData<TestMessage, TestPage, string | null>(
      queryClient.getQueryData<InfiniteData<TestPage, string | null>>(queryKey),
    ).find(({ id }) => id === "2")?.content,
    "optimistic",
  );
  await options.onSuccess!(
    { message: { content: "server", id: "2" } },
    variables,
    context,
    {} as never,
  );
  assert.equal(
    flattenMobileInfiniteData<TestMessage, TestPage, string | null>(
      queryClient.getQueryData<InfiniteData<TestPage, string | null>>(queryKey),
    ).find(({ id }) => id === "2")?.content,
    "server",
  );

  queryClient.setQueryData(queryKey, snapshot);
  const failureContext = await options.onMutate!(variables, {} as never);
  await options.onError!(new Error("failed"), variables, failureContext, {} as never);
  assert.deepEqual(queryClient.getQueryData(queryKey), snapshot);
});

test("query option factories use opaque domain keys and cursor pagination", () => {
  const client: MobileApiClient = {
    requestJson: async () => {
      throw new Error("query function should not run while inspecting options");
    },
  };
  const bootstrap = getMobileBootstrapQueryOptions(client);
  const workspace = getMobileWorkspaceQueryOptions(client, "server-1");
  const channel = getMobileChannelMessagesQueryOptions(client, "channel-1");
  const dm = getMobileDMMessagesQueryOptions(client, "conversation-1");
  const search = getMobileMessageSearchQueryOptions(client, {
    conversationId: "conversation-1",
    query: "private words",
    scope: "dm",
  });

  assert.deepEqual(bootstrap.queryKey, ["mobile", "bootstrap"]);
  assert.deepEqual(workspace.queryKey, ["mobile", "workspace", "server-1"]);
  assert.deepEqual(channel.queryKey, ["mobile", "channel-messages", "channel-1"]);
  assert.deepEqual(dm.queryKey, ["mobile", "dm-messages", "conversation-1"]);
  assert.doesNotMatch(JSON.stringify(search.queryKey), /private words/);
  assert.equal(channel.initialPageParam, null);
  assert.equal(dm.initialPageParam, null);
  assert.equal(search.initialPageParam, null);
  assert.equal(getMobileWorkspaceQueryOptions(client, "").enabled, false);
  assert.equal(
    getMobileMessageSearchQueryOptions(client, {
      conversationId: "conversation-1",
      query: "x",
      scope: "dm",
    }).enabled,
    false,
  );
});

test("optimistic mutation options insert, replace, and roll back exact snapshots", async () => {
  const queryClient = new QueryClient();
  const queryKey = ["mobile", "dm-messages", "conversation-1"] as const;
  const snapshot = createData();
  queryClient.setQueryData(queryKey, snapshot);

  const successOptions = createMobileOptimisticMutationOptions({
    createOptimisticMessage: (input: { content: string }, clientId: string) => ({
      content: input.content,
      id: clientId,
    }),
    getResponseMessage: (response: { message: TestMessage }) => response.message,
    invalidateKeys: [["mobile", "bootstrap"]],
    mutationFn: async () => ({ message: { content: "sent", id: "server-1" } }),
    queryClient,
    queryKey,
  });
  const successContext = await successOptions.onMutate!({ content: "sending" }, {} as never);
  assert.match(
    flattenMobileInfiniteData(queryClient.getQueryData(queryKey)).at(-1)!.id,
    /^client-/,
  );
  await successOptions.onSuccess!(
    { message: { content: "sent", id: "server-1" } },
    { content: "sending" },
    successContext,
    {} as never,
  );
  assert.equal(
    flattenMobileInfiniteData(queryClient.getQueryData(queryKey)).at(-1)!.id,
    "server-1",
  );

  queryClient.setQueryData(queryKey, snapshot);
  const cachedSnapshot = queryClient.getQueryData(queryKey);
  const failureContext = await successOptions.onMutate!({ content: "failing" }, {} as never);
  await successOptions.onError!(
    new Error("failed"),
    { content: "failing" },
    failureContext,
    {} as never,
  );
  assert.deepEqual(queryClient.getQueryData(queryKey), cachedSnapshot);
});
