import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DMClientError } from "./client";
import {
  dmSharedMediaQueryKeys,
  fetchDmSharedItems,
  formatSharedFileSize,
  getSharedMediaOverlayCount,
} from "./shared-media-client";

const originalFetch = globalThis.fetch;

function stubFetch(response: { body: unknown; ok?: boolean; status?: number }) {
  const urls: string[] = [];

  globalThis.fetch = (async (url: string) => {
    urls.push(url);

    return {
      json: async () => response.body,
      ok: response.ok ?? true,
      status: response.status ?? 200,
    } as Response;
  }) as typeof globalThis.fetch;

  return urls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("dm shared media client", () => {
  it("keys each kind separately under one conversation subtree", () => {
    assert.deepEqual(dmSharedMediaQueryKeys.page("dm-1", "file"), [
      "dm",
      "shared-media",
      "dm-1",
      "file",
    ]);
    assert.deepEqual(dmSharedMediaQueryKeys.conversation("dm-1"), ["dm", "shared-media", "dm-1"]);
  });

  it("asks for the requested kind and carries the cursor", async () => {
    const page = { items: [], kind: "media" as const, nextCursor: null, total: 0 };
    const urls = stubFetch({ body: page });

    assert.deepEqual(await fetchDmSharedItems("dm-1", "media", "message-4"), page);
    assert.deepEqual(urls, ["/api/v1/dm/dm-1/attachments?kind=media&cursor=message-4"]);
  });

  it("raises the endpoint's status rather than a parse failure", async () => {
    stubFetch({
      body: { error: "You are not a participant in this conversation" },
      ok: false,
      status: 403,
    });

    await assert.rejects(
      () => fetchDmSharedItems("dm-1", "link"),
      (error: unknown) => error instanceof DMClientError && error.status === 403,
    );
  });

  // §15.5's sixth tile. The overlay is `total - 6`, never `page.length - 6`.
  it("derives the overlay from the real total", () => {
    assert.equal(getSharedMediaOverlayCount(18), 12);
    assert.equal(getSharedMediaOverlayCount(6), 0);
    assert.equal(getSharedMediaOverlayCount(4), 0);
  });

  it("formats file sizes with the reader's decimal separator", () => {
    assert.equal(formatSharedFileSize(1_258_291, "tr"), "1,2 MB");
    assert.equal(formatSharedFileSize(5_033_165, "tr"), "4,8 MB");
    assert.equal(formatSharedFileSize(1_258_291, "en"), "1.2 MB");
    assert.equal(formatSharedFileSize(2048, "tr"), "2 KB");
    assert.equal(formatSharedFileSize(512, "tr"), "512 B");
    assert.equal(formatSharedFileSize(0, "tr"), "");
  });
});
