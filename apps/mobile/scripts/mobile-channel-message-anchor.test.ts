import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { getMobileChannelMessagesQueryOptions } from "../src/query/mobile-message-queries";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

function recordingClient(paths: string[]): MobileApiClient {
  return {
    async requestJson<TResponse>(path: string) {
      paths.push(path);
      return {
        channel: {
          categoryId: null,
          categoryName: null,
          id: "channel-1",
          lastMessage: null,
          locked: false,
          mentionCount: 0,
          name: "genel",
          position: 0,
          readOnly: false,
          topic: null,
          type: "TEXT",
          unreadCount: 0,
        },
        hasMore: false,
        hasNewer: true,
        messages: [],
        nextCursor: null,
      } as TResponse;
    },
  };
}

/**
 * 2b: a search hit opens the transcript in the middle of a channel's history.
 * The anchored read is a *sibling* cache entry — the realtime bridge patches
 * the live key, and the persisted offline stream holds the channel's tail — so
 * the two must never share a key.
 */
describe("anchored channel transcript", () => {
  it("keys an anchored window apart from the live stream", () => {
    const client = recordingClient([]);

    assert.deepEqual(
      getMobileChannelMessagesQueryOptions(client, "channel-1").queryKey,
      mobileQueryKeys.channelMessages("channel-1"),
    );
    assert.deepEqual(
      getMobileChannelMessagesQueryOptions(client, "channel-1", true, "message-9").queryKey,
      mobileQueryKeys.channelMessagesAround("channel-1", "message-9"),
    );
  });

  it("anchors only the first request and pages backwards from there", async () => {
    const paths: string[] = [];
    const options = getMobileChannelMessagesQueryOptions(
      recordingClient(paths),
      "channel-1",
      true,
      "message-9",
    );

    await options.queryFn?.({ pageParam: null } as never);
    await options.queryFn?.({ pageParam: "cursor-1" } as never);

    assert.ok(paths[0]?.includes("around=message-9"));
    assert.ok(!paths[1]?.includes("around="));
    assert.ok(paths[1]?.includes("cursor=cursor-1"));
  });

  it("stays disabled until it has both a channel and an anchor to read", () => {
    const client = recordingClient([]);

    assert.equal(
      getMobileChannelMessagesQueryOptions(client, "", true, "message-9").enabled,
      false,
    );
    assert.equal(getMobileChannelMessagesQueryOptions(client, "channel-1", false).enabled, false);
    assert.equal(getMobileChannelMessagesQueryOptions(client, "channel-1", true).enabled, true);
  });

  it("pages further back with the plain cursor semantics", () => {
    const options = getMobileChannelMessagesQueryOptions(
      recordingClient([]),
      "channel-1",
      true,
      "message-9",
    );

    assert.equal(
      options.getNextPageParam(
        { nextCursor: "cursor-2" } as never,
        [] as never,
        null as never,
        [null] as never,
      ),
      "cursor-2",
    );
    assert.equal(
      options.getNextPageParam(
        { nextCursor: null } as never,
        [] as never,
        null as never,
        [null] as never,
      ),
      undefined,
    );
  });
});

describe("anchored transcript wiring", () => {
  const read = (...segments: string[]) =>
    readFileSync(join(process.cwd(), "src", ...segments), "utf8");

  it("opens a search hit at its message and keeps the channel selection handler", () => {
    const browser = read("app", "screens", "workspace-browser.tsx");

    assert.match(
      browser,
      /onOpenChannel\(channel\);[\s\S]{0,200}?navigate\("ChannelChat", \{[\s\S]{0,120}?messageId: result\.messageId/,
    );
  });

  it("places the reader on the anchor once and never re-scrolls on later updates", () => {
    const screen = read("app", "screens", "channel-screen.tsx");

    assert.match(screen, /anchoredMessageIdRef\.current === anchorMessageId/);
    assert.match(screen, /scrollToIndex\(\{ animated: false, index, viewPosition: 0\.5 \}\)/);
    assert.match(screen, /highlightMessage\(anchorMessageId\)/);
  });

  it("turns the scroll-to-bottom control into a way out of history", () => {
    const screen = read("app", "screens", "channel-screen.tsx");

    assert.match(
      screen,
      /isViewingHistory \? onExitHistory\?\.\(\) : scrollToLatestMessage\(true\)/,
    );
  });

  it("keeps the anchored window out of the offline stream and its hydration", () => {
    const routeState = read("app", "features", "use-mobile-channel-route-state.ts");

    assert.equal(routeState.match(/enabled: input\.isSignedIn && !isAnchored/g)?.length, 2);
    assert.match(
      routeState,
      /isViewingHistory: isAnchored && query\.data\?\.pages\[0\]\?\.hasNewer === true/,
    );
  });
});
