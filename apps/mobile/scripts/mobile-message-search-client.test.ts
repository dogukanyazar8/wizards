import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  buildMobileMessageSearchPath,
  buildMobileServerMessageSearchPath,
  MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT,
  MOBILE_MESSAGE_SEARCH_MAX_LIMIT,
  searchMobileMessages,
  validateMobileMessageSearchContract,
} from "../src/search/mobile-message-search-client";

const validSearchResponse = {
  nextCursor: null,
  results: [
    {
      author: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Alice",
        id: "user-2",
        status: "ONLINE",
        username: "alice",
      },
      channelId: "channel-1",
      channelName: "general",
      content: "Release notes are ready.",
      createdAt: "2026-06-30T10:00:00.000Z",
      id: "search-result-1",
      messageId: "message-1",
      scope: "channel",
      serverId: "server-1",
    },
  ],
};

describe("mobile message search client", () => {
  it("builds a bounded, encoded channel search path", () => {
    assert.equal(
      buildMobileMessageSearchPath({
        author: " Alice ",
        conversationId: "channel/one",
        limit: 100,
        query: " release   notes ",
        scope: "channel",
      }),
      `/api/v1/mobile/channels/channel%2Fone/messages/search?limit=${MOBILE_MESSAGE_SEARCH_MAX_LIMIT}&q=release+notes&author=Alice`,
    );
  });

  it("builds a DM search path with exact and pagination filters", () => {
    assert.equal(
      buildMobileMessageSearchPath({
        conversationId: "dm 1",
        cursor: "next cursor",
        exact: true,
        from: "2026-06-01T00:00:00.000Z",
        query: "hello",
        scope: "dm",
        to: "2026-06-30T00:00:00.000Z",
      }),
      `/api/v1/mobile/dm/dm%201/messages/search?limit=${MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT}&q=hello&cursor=next+cursor&from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-30T00%3A00%3A00.000Z&exact=true`,
    );
  });

  it("rejects invalid client-side search requests before hitting the API", () => {
    assert.throws(
      () =>
        buildMobileMessageSearchPath({
          conversationId: "conversation-1",
          query: "x",
          scope: "dm",
        }),
      /at least 2 characters/,
    );

    assert.throws(
      () =>
        buildMobileMessageSearchPath({
          conversationId: " ",
          query: "hello",
          scope: "dm",
        }),
      /conversation id/,
    );

    assert.throws(
      () =>
        buildMobileMessageSearchPath({
          conversationId: "conversation-1",
          query: "x".repeat(121),
          scope: "dm",
        }),
      /too long/,
    );
  });

  it("loads and validates mobile search responses", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return validSearchResponse as TResponse;
      },
    };

    const response = await searchMobileMessages(client, {
      conversationId: "channel-1",
      query: "release",
      scope: "channel",
    });

    assert.deepEqual(requests, [
      `/api/v1/mobile/channels/channel-1/messages/search?limit=${MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT}&q=release`,
    ]);
    assert.equal(response.results[0]?.messageId, "message-1");
  });

  it("rejects malformed search responses before the UI trusts them", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          ...validSearchResponse,
          results: [
            {
              ...validSearchResponse.results[0],
              author: {
                ...validSearchResponse.results[0]?.author,
                status: "INVISIBLE",
              },
            },
          ],
        } as TResponse;
      },
    };

    await assert.rejects(
      () =>
        searchMobileMessages(client, {
          conversationId: "channel-1",
          query: "release",
          scope: "channel",
        }),
      /Invalid enum value/,
    );
  });

  it("keeps the mobile search contract self-validating", () => {
    assert.deepEqual(validateMobileMessageSearchContract(), []);
  });
});

// 6b's box says "Kanallarda ve mesajlarda ara", so the message half spans the
// whole server and talks to its own endpoint.
describe("buildMobileServerMessageSearchPath", () => {
  it("targets the server-wide route with a normalized query and a clamped limit", () => {
    const path = buildMobileServerMessageSearchPath({
      limit: 500,
      query: "  sürüm   notları ",
      serverId: "server/one",
    });

    assert.ok(path.startsWith("/api/v1/mobile/servers/server%2Fone/messages/search?"));
    assert.ok(path.includes(`limit=${MOBILE_MESSAGE_SEARCH_MAX_LIMIT}`));
    assert.ok(path.includes("q=s%C3%BCr%C3%BCm+notlar%C4%B1"));
  });

  it("carries a keyset cursor and nothing else the workspace box cannot produce", () => {
    const path = buildMobileServerMessageSearchPath({
      cursor: "cursor-1",
      query: "release",
      serverId: "server-1",
    });

    assert.ok(path.includes("cursor=cursor-1"));
    assert.ok(!path.includes("author="));
    assert.ok(!path.includes("exact="));
  });

  it("refuses a query the endpoint would answer 400 for", () => {
    assert.throws(
      () => buildMobileServerMessageSearchPath({ query: "x", serverId: "server-1" }),
      /at least 2 characters/,
    );
    assert.throws(
      () => buildMobileServerMessageSearchPath({ query: "release", serverId: "  " }),
      /requires a server id/,
    );
  });
});
