import assert from "node:assert/strict";
import { it } from "node:test";
import {
  calculateVoiceGrid,
  normalizeVoiceLayout,
  selectFeaturedVoiceParticipant,
} from "./voice-layout";
import { SERVER_METRICS } from "./metrics";

it("fits equal cards inside wide, tall and narrow rooms for 1–25 participants", () => {
  const gap = SERVER_METRICS.voiceGrid.gap;
  for (const [width, height] of [
    [1400, 760],
    [760, 1200],
    [360, 640],
  ]) {
    for (let count = 1; count <= 25; count++) {
      const grid = calculateVoiceGrid(count, width!, height!);
      assert.ok(grid.columns * grid.tileWidth + (grid.columns - 1) * gap <= width! + 0.001);
      assert.ok(grid.rows * grid.tileHeight + (grid.rows - 1) * gap <= height! + 0.001);
      assert.ok(grid.columns * grid.rows >= count);
      assert.ok(grid.tileWidth > 0 && grid.tileHeight > 0);
    }
  }
});
it("a lone participant occupies a centered single column and compact tiles stay bounded", () => {
  assert.equal(calculateVoiceGrid(1, 1400, 760).columns, 1);
  assert.equal(calculateVoiceGrid(1, 1400, 760, true).tileWidth, 280);
  assert.equal(calculateVoiceGrid(1, 200, 640, true).tileWidth, 200);
});
it("invalid persisted layout falls back to fit and speaker mode uses real speaking state", () => {
  assert.equal(normalizeVoiceLayout("bogus"), "fit");
  assert.equal(normalizeVoiceLayout("compact"), "compact");
  assert.equal(normalizeVoiceLayout("speaker"), "speaker");
  assert.equal(
    selectFeaturedVoiceParticipant([
      { userId: "a", isSpeaking: false },
      { userId: "b", isSpeaking: true },
    ]),
    "b",
  );
  assert.equal(selectFeaturedVoiceParticipant([]), null);
});
