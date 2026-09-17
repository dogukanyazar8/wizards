import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveGoLiveCandidate,
  resolveGoLiveStream,
  shouldStopClosedGameShare,
  sanitizeGoLiveStream,
} from "./go-live";

const input = {
  isDesktop: true,
  gameDetectionEnabled: true,
  detectedGameId: "valorant",
  foregroundExecutable: null,
  isScreenSharing: false,
};
test("stream privacy removes both id and custom label; invalid games never fan out", () => {
  const stream = {
    kind: "game" as const,
    gameId: "custom:abcdef123456",
    label: " Private\n game ",
  };
  assert.deepEqual(sanitizeGoLiveStream(stream, false), {
    kind: "game",
    gameId: null,
    label: null,
  });
  assert.equal(sanitizeGoLiveStream(stream, true)?.label, "Private game");
  assert.equal(sanitizeGoLiveStream({ ...stream, gameId: "unknown" }, true)?.gameId, null);
});
test("Go Live requires desktop opt-in and a recognized game", () => {
  assert.equal(resolveGoLiveCandidate({ ...input, isDesktop: false }), null);
  assert.deepEqual(resolveGoLiveCandidate({ ...input, gameDetectionEnabled: false }), {
    kind: "opt-in-required",
  });
  assert.equal(resolveGoLiveCandidate({ ...input, detectedGameId: "unknown" }), null);
  assert.equal(resolveGoLiveCandidate({ ...input, isScreenSharing: true }), null);
  assert.equal(resolveGoLiveCandidate(input)?.kind, "game");
  assert.equal(
    resolveGoLiveCandidate({ ...input, foregroundExecutable: "cs2.exe" })?.gameId,
    "cs2",
  );
  assert.equal(resolveGoLiveCandidate({ ...input, foregroundExecutable: "browser.exe" }), null);
});
test("only window capture receives game metadata; full screen never auto-stops", () => {
  const candidate = resolveGoLiveCandidate(input);
  assert.deepEqual(resolveGoLiveStream("monitor", candidate), {
    kind: "screen",
    gameId: null,
    label: null,
  });
  const stream = resolveGoLiveStream("window", candidate);
  assert.equal(stream.gameId, "valorant");
  assert.equal(shouldStopClosedGameShare(stream, 1), false);
  assert.equal(shouldStopClosedGameShare(stream, 2), true);
  assert.equal(shouldStopClosedGameShare(resolveGoLiveStream("monitor", candidate), 2), false);
});
