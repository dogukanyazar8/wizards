import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_VOICE_AUDIENCE_GRID_GAP,
  MOBILE_VOICE_AUDIENCE_MAX_COLUMNS,
  MOBILE_VOICE_AUDIENCE_MIN_TILE_HEIGHT,
  MOBILE_VOICE_AUDIENCE_MIN_TILE_WIDTH,
  getMobileVoiceAudienceGridLayout,
  sliceMobileVoiceAudienceRows,
} from "../src/voice/mobile-voice-audience-grid";

const PHONE = { gap: MOBILE_VOICE_AUDIENCE_GRID_GAP, height: 520, width: 343 };

function layoutFor(count: number, overrides: Partial<typeof PHONE> = {}) {
  return getMobileVoiceAudienceGridLayout({ count, ...PHONE, ...overrides });
}

function contentHeight(rowCount: number, tileHeight: number): number {
  return rowCount * tileHeight + Math.max(0, rowCount - 1) * MOBILE_VOICE_AUDIENCE_GRID_GAP;
}

describe("mobile voice audience grid", () => {
  it("gives a lone participant a single centred tile", () => {
    const layout = layoutFor(1);

    assert.deepEqual(layout.rowCounts, [1]);
    assert.equal(layout.columns, 1);
    assert.ok(layout.measured);
    assert.ok(!layout.scrollable);
  });

  it("balances rows instead of leaving a stranded last tile", () => {
    assert.deepEqual(layoutFor(2).rowCounts, [2]);
    assert.deepEqual(layoutFor(4).rowCounts, [2, 2]);
    assert.deepEqual(layoutFor(5).rowCounts, [3, 2]);
    assert.deepEqual(layoutFor(7).rowCounts, [3, 2, 2]);
    assert.deepEqual(layoutFor(9).rowCounts, [3, 3, 3]);
  });

  it("widens the column count as the room grows and caps it", () => {
    assert.equal(layoutFor(2).columns, 2);
    assert.equal(layoutFor(6).columns, 3);
    assert.equal(layoutFor(12).columns, MOBILE_VOICE_AUDIENCE_MAX_COLUMNS);
    assert.equal(layoutFor(40).columns, MOBILE_VOICE_AUDIENCE_MAX_COLUMNS);
  });

  it("keeps every tile inside the measured box while the room stays small", () => {
    for (const count of [1, 2, 3, 4, 5, 6, 8, 9]) {
      const layout = layoutFor(count);

      assert.ok(
        contentHeight(layout.rowCounts.length, layout.tileHeight) <= PHONE.height + 0.5,
        `count ${count} overflows: ${contentHeight(layout.rowCounts.length, layout.tileHeight)}`,
      );
      assert.ok(!layout.scrollable, `count ${count} should not scroll`);
    }
  });

  it("stops shrinking at the minimum tile height and scrolls instead", () => {
    const layout = layoutFor(24);

    assert.equal(layout.tileHeight, MOBILE_VOICE_AUDIENCE_MIN_TILE_HEIGHT);
    assert.ok(layout.scrollable);
    assert.ok(contentHeight(layout.rowCounts.length, layout.tileHeight) > PHONE.height);
  });

  it("drops a column rather than rendering tiles narrower than the minimum", () => {
    const layout = layoutFor(12, { width: 240 });

    assert.ok(layout.tileWidth >= MOBILE_VOICE_AUDIENCE_MIN_TILE_WIDTH);
    assert.ok(layout.columns < MOBILE_VOICE_AUDIENCE_MAX_COLUMNS);
  });

  it("scales avatar, badge and type with the tile and hides status on small tiles", () => {
    const roomy = layoutFor(2);
    const dense = layoutFor(16);

    assert.ok(roomy.avatarSize > dense.avatarSize);
    assert.ok(roomy.badgeSize >= dense.badgeSize);
    assert.ok(roomy.nameFontSize > dense.nameFontSize);
    assert.ok(roomy.showStatus);
    assert.ok(!dense.showStatus);
    assert.ok(dense.avatarSize >= 32, "avatars never collapse to nothing");
  });

  it("caps the tile height so a two-person room does not stretch into slabs", () => {
    const layout = layoutFor(2, { height: 900 });

    assert.ok(layout.tileHeight <= 240);
    assert.ok(!layout.scrollable);
  });

  it("falls back to unmeasured defaults before the first layout pass", () => {
    const layout = layoutFor(3, { height: 0, width: 0 });

    assert.equal(layout.measured, false);
    assert.equal(layout.tileHeight, 0);
    assert.equal(layout.tileWidth, 0);
    assert.deepEqual(layout.rowCounts, [2, 1]);
    assert.ok(layout.avatarSize > 0);
    assert.ok(layout.showStatus);
    assert.ok(!layout.scrollable);
  });

  it("returns an empty plan for an empty room", () => {
    const layout = layoutFor(0);

    assert.deepEqual(layout.rowCounts, []);
    assert.equal(layout.columns, 0);
    assert.ok(!layout.scrollable);
  });

  it("slices participants into the planned rows without dropping anyone", () => {
    const people = ["a", "b", "c", "d", "e"];

    assert.deepEqual(sliceMobileVoiceAudienceRows(people, [3, 2]), [
      ["a", "b", "c"],
      ["d", "e"],
    ]);
    assert.deepEqual(sliceMobileVoiceAudienceRows(people, []), []);
    assert.deepEqual(sliceMobileVoiceAudienceRows([], [3, 2]), []);
  });
});
