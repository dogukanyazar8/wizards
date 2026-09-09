import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DM_SHARED_LINKS_PER_MESSAGE, extractSharedLinks } from "./shared-links";

const FENCE = "```";
const TICK = "`";

describe("dm shared link extraction", () => {
  it("returns every https link in written order with its host", () => {
    assert.deepEqual(
      extractSharedLinks("bak https://whispr.app/changelog ve https://figma.com/file/kritik"),
      [
        { host: "whispr.app", title: null, url: "https://whispr.app/changelog" },
        { host: "figma.com", title: null, url: "https://figma.com/file/kritik" },
      ],
    );
  });

  it("takes the title from a markdown label and leaves a bare URL untitled", () => {
    assert.deepEqual(
      extractSharedLinks(
        "[Sürüm 2.4 notları](https://whispr.app/changelog) sonra https://figma.com/file/kritik",
      ),
      [
        { host: "whispr.app", title: "Sürüm 2.4 notları", url: "https://whispr.app/changelog" },
        { host: "figma.com", title: null, url: "https://figma.com/file/kritik" },
      ],
    );
  });

  it("does not swallow the closing paren of a markdown link into the href", () => {
    assert.deepEqual(extractSharedLinks("[pano](https://figma.com/file/kritik)"), [
      { host: "figma.com", title: "pano", url: "https://figma.com/file/kritik" },
    ]);
  });

  // The tab lists destinations, not code samples. A fenced block is rendered as
  // code in the bubble; offering it as a tappable row would contradict that.
  it("skips URLs inside a fenced code block", () => {
    assert.deepEqual(
      extractSharedLinks(
        `önce https://whispr.app/a\n${FENCE}bash\ncurl https://internal.whispr.test/secret\n${FENCE}\nsonra https://whispr.app/b`,
      ).map((link) => link.url),
      ["https://whispr.app/a", "https://whispr.app/b"],
    );
  });

  it("skips URLs inside inline code", () => {
    assert.deepEqual(
      extractSharedLinks(
        `${TICK}https://internal.whispr.test/secret${TICK} ama https://whispr.app/a`,
      ).map((link) => link.url),
      ["https://whispr.app/a"],
    );
  });

  it("drops http, unparseable tokens, and plain text", () => {
    assert.deepEqual(extractSharedLinks("http://whispr.app/a hiç link yok https://"), []);
    assert.deepEqual(extractSharedLinks("whispr.app/a"), []);
  });

  it("deduplicates within the message and caps the per-message count", () => {
    assert.deepEqual(
      extractSharedLinks("https://whispr.app/a https://whispr.app/b https://whispr.app/a").map(
        (link) => link.url,
      ),
      ["https://whispr.app/a", "https://whispr.app/b"],
    );
    assert.equal(
      extractSharedLinks(
        Array.from({ length: 14 }, (_value, index) => `https://whispr.app/${index}`).join(" "),
      ).length,
      DM_SHARED_LINKS_PER_MESSAGE,
    );
    assert.deepEqual(extractSharedLinks("https://whispr.app/a", 0), []);
  });

  // The bubble's own parser keeps trailing punctuation, so both surfaces open
  // the same URL; the host is still derived correctly from it.
  it("keeps trailing punctuation the chat bubble keeps", () => {
    assert.deepEqual(extractSharedLinks("son: https://whispr.app/b,"), [
      { host: "whispr.app", title: null, url: "https://whispr.app/b," },
    ]);
  });

  it("bounds a free-form markdown label", () => {
    const [link] = extractSharedLinks(`[${"a".repeat(400)}](https://whispr.app/a)`);

    assert.equal(link?.title?.length, 200);
  });
});
