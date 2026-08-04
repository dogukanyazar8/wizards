import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  MOBILE_MESSAGE_STREAM_RETAINED_PAGES,
  trimMobileMessageStreamPages,
} from "../src/query/mobile-message-stream-trim";
import { trimMobileMessageStream } from "../src/query/mobile-message-stream-cache";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

function buildStream(pageCount: number) {
  return {
    pageParams: Array.from({ length: pageCount }, (_unused, index) =>
      index === 0 ? null : `cursor-${index}`,
    ),
    pages: Array.from({ length: pageCount }, (_unused, index) => ({ page: index })),
  };
}

describe("message stream trim", () => {
  it("keeps the newest pages, which is the head", () => {
    const trimmed = trimMobileMessageStreamPages(buildStream(9), 3);

    // `pages[0]` is the newest page — the same one the encrypted store persists.
    assert.deepEqual(trimmed?.pages, [{ page: 0 }, { page: 1 }, { page: 2 }]);
    assert.deepEqual(trimmed?.pageParams, [null, "cursor-1", "cursor-2"]);
  });

  it("hands back the same object when there is nothing to drop", () => {
    const stream = buildStream(2);

    assert.equal(trimMobileMessageStreamPages(stream, 3), stream);
    assert.equal(trimMobileMessageStreamPages(undefined, 3), undefined);
  });

  it("defaults to three pages", () => {
    assert.equal(MOBILE_MESSAGE_STREAM_RETAINED_PAGES, 3);
    assert.equal(trimMobileMessageStreamPages(buildStream(9))?.pages.length, 3);
  });

  it("leaves the stream's own age alone", () => {
    const queryClient = new QueryClient();
    const queryKey = mobileQueryKeys.dmMessages("conversation-1");
    const storedAt = 1_700_000_000_000;
    queryClient.setQueryData(queryKey, buildStream(9), { updatedAt: storedAt });

    assert.equal(
      trimMobileMessageStream({
        maxPages: 3,
        queryClient,
        scope: "dm",
        targetId: "conversation-1",
      }),
      true,
    );

    const state = queryClient.getQueryState(queryKey);
    assert.equal((state?.data as { pages: unknown[] }).pages.length, 3);
    // Re-dating the stream would restart its stale window, and the refetch that
    // reconciles a restored page would be skipped on the next open.
    assert.equal(state?.dataUpdatedAt, storedAt);
    queryClient.clear();
  });

  it("writes nothing when the stream is short, missing or unnamed", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(mobileQueryKeys.dmMessages("conversation-1"), buildStream(2));

    assert.equal(
      trimMobileMessageStream({ queryClient, scope: "dm", targetId: "conversation-1" }),
      false,
    );
    assert.equal(trimMobileMessageStream({ queryClient, scope: "dm", targetId: "absent" }), false);
    assert.equal(trimMobileMessageStream({ queryClient, scope: "dm", targetId: "" }), false);
    queryClient.clear();
  });

  it("does not trim a stream while a route observes it", () => {
    const queryClient = new QueryClient();
    const queryKey = mobileQueryKeys.dmMessages("conversation-1");
    queryClient.setQueryData(queryKey, buildStream(9));
    const observer = new QueryObserver(queryClient, {
      enabled: false,
      queryFn: async () => buildStream(1),
      queryKey,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    assert.equal(
      trimMobileMessageStream({ queryClient, scope: "dm", targetId: "conversation-1" }),
      false,
    );
    assert.equal((queryClient.getQueryData(queryKey) as { pages: unknown[] }).pages.length, 9);
    unsubscribe();
    queryClient.clear();
  });

  it("is what a closed conversation runs", () => {
    const source = readFileSync(
      path.join(__dirname, "..", "src/query/use-mobile-message-stream-persistence.ts"),
      "utf8",
    );

    assert.match(
      source,
      /return \(\) => \{[\s\S]*queueMicrotask\(\(\) => \{\s*trimMobileMessageStream\(\{ queryClient, scope, targetId \}\);/u,
    );
  });
});
