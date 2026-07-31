import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  computeMobileListBlankArea,
  getMobileListBlankAreaSnapshot,
  recordMobileListBlankArea,
  resetMobileListBlankAreaForTests,
} from "../src/performance/mobile-list-blank-area";

afterEach(() => {
  resetMobileListBlankAreaForTests();
});

const viewport = { scrollOffset: 1_000, viewportHeight: 800, contentHeight: 5_000 };

describe("list blank area", () => {
  it("reads zero while the rendered rows cover the viewport", () => {
    assert.equal(
      computeMobileListBlankArea({
        ...viewport,
        firstVisible: { height: 100, y: 950 },
        lastVisible: { height: 100, y: 1_780 },
      }),
      0,
    );
  });

  it("measures the gap the renderer left below the last row", () => {
    assert.equal(
      computeMobileListBlankArea({
        ...viewport,
        firstVisible: { height: 100, y: 950 },
        lastVisible: { height: 100, y: 1_500 },
      }),
      // 1_000 + 800 viewport bottom against a last row ending at 1_600.
      200,
    );
  });

  it("takes the worse of the two edges", () => {
    assert.equal(
      computeMobileListBlankArea({
        ...viewport,
        firstVisible: { height: 100, y: 1_120 },
        lastVisible: { height: 100, y: 1_650 },
      }),
      120,
    );
  });

  it("declines to measure emptiness the reader is entitled to", () => {
    // A conversation shorter than the screen is supposed to leave space.
    assert.equal(
      computeMobileListBlankArea({
        contentHeight: 400,
        firstVisible: { height: 100, y: 0 },
        lastVisible: { height: 100, y: 300 },
        scrollOffset: 0,
        viewportHeight: 800,
      }),
      null,
    );
    // Rubber-banding past the end is not a renderer that fell behind.
    assert.equal(
      computeMobileListBlankArea({
        ...viewport,
        firstVisible: { height: 100, y: 4_300 },
        lastVisible: { height: 100, y: 4_900 },
        scrollOffset: 4_600,
      }),
      null,
    );
    assert.equal(
      computeMobileListBlankArea({ ...viewport, firstVisible: null, lastVisible: null }),
      null,
    );
  });

  it("keeps the two transcripts apart and ignores what it could not measure", () => {
    recordMobileListBlankArea("dm-messages", 0);
    recordMobileListBlankArea("dm-messages", 120);
    recordMobileListBlankArea("dm-messages", null);
    recordMobileListBlankArea("channel-messages", 40);

    assert.deepEqual(
      getMobileListBlankAreaSnapshot().map((stats) => [stats.surface, stats.count, stats.maxPx]),
      [
        ["dm-messages", 2, 120],
        ["channel-messages", 1, 40],
      ],
    );
  });

  it("leaves drawDistance alone until the number exists", () => {
    const transcript = readFileSync(
      path.join(__dirname, "..", "src/app/components/dm-chat-primitives.tsx"),
      "utf8",
    );

    // W1 measures first. Lowering the window blindly buys render time by showing
    // the reader empty space instead, which is not a win.
    assert.match(transcript, /drawDistance=\{700\}/u);
    assert.match(transcript, /reportMobileListBlankArea\("dm-messages"/u);
  });
});
