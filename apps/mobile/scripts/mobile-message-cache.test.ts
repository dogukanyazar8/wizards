import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import { getMobileBootstrapQueryOptions } from "../src/query/mobile-bootstrap-query";
import {
  appendOrReplaceMobileMessage,
  flattenMobileInfiniteData,
  insertOptimisticMobileMessage,
  replaceMobileMessage,
  restoreMobileMessageSnapshot,
} from "../src/query/mobile-message-cache";
import {
  getMobileChannelMessagesQueryOptions,
  getMobileDMMessagesQueryOptions,
} from "../src/query/mobile-message-queries";
import { getMobileMessageSearchQueryOptions } from "../src/query/mobile-message-search-query";
import { getMobileWorkspaceQueryOptions } from "../src/query/mobile-workspace-query";
import { createMobileOptimisticMutationOptions } from "../src/query/use-mobile-message-mutations";

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
