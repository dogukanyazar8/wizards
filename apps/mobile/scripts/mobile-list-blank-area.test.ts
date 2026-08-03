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

  it("keeps the DM window at the platform default the measurement licensed", () => {
    const transcript = readFileSync(
      path.join(__dirname, "..", "src/app/components/dm-chat-primitives.tsx"),
      "utf8",
    );

    // 700 buffered 1400px — about two extra screens of rows — before first paint.
    // 250 is FlashList's own Android default, and the blank-area instrument put
    // this list at p95 20-82px, so the headroom was real rather than assumed.
    assert.match(transcript, /const DM_DRAW_DISTANCE = 250;/u);
    assert.match(transcript, /drawDistance=\{DM_DRAW_DISTANCE\}/u);
    assert.match(transcript, /reportMobileListBlankArea\("dm-messages"/u);
  });

  it("leaves the channel window alone, because its blank area has none to give", () => {
    const channel = readFileSync(
      path.join(__dirname, "..", "src/app/screens/channel-screen.tsx"),
      "utf8",
    );

    // Channel blank area measured p95 = max = 504px: the renderer is already
    // behind the thumb there, and narrowing the window would only widen the gap.
    assert.match(channel, /drawDistance=\{performanceConfig\.windowSize \* 100\}/u);
    assert.match(channel, /reportMobileListBlankArea\("channel-messages"/u);
  });
});
