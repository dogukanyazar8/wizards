import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createMobileMessageEntranceTracker } from "../src/app/components/message-entrance";

const MOBILE_ROOT = path.join(__dirname, "..");

function message(id: string, createdAt: string) {
  return { createdAt, id };
}

const transcript = [
  message("m-1", "2026-07-31T09:00:00.000Z"),
  message("m-2", "2026-07-31T09:01:00.000Z"),
  message("m-3", "2026-07-31T09:02:00.000Z"),
];

describe("mobile message entrance tracker", () => {
  it("draws the transcript it opens with, animating nothing", () => {
    const tracker = createMobileMessageEntranceTracker();

    assert.deepEqual([...tracker.select(transcript)], []);
  });

  it("waits for the first non-empty batch before deciding what is new", () => {
    const tracker = createMobileMessageEntranceTracker();

    // The stream is empty for a frame while the query resolves; treating its
    // first messages as arrivals is exactly the defect this replaces.
    tracker.select([]);

    assert.deepEqual([...tracker.select(transcript)], []);
  });

  it("animates a message that lands after the transcript", () => {
    const tracker = createMobileMessageEntranceTracker();
    tracker.select(transcript);

    const arrived = [...transcript, message("m-4", "2026-07-31T09:03:00.000Z")];

    assert.deepEqual([...tracker.select(arrived)], ["m-4"]);
  });

  it("keeps an arrival marked while its animation is still running", () => {
    const tracker = createMobileMessageEntranceTracker();
    tracker.select(transcript);
    const arrived = [...transcript, message("m-4", "2026-07-31T09:03:00.000Z")];
    tracker.select(arrived);

    // A read receipt or a reaction re-renders the list mid-animation; dropping
    // the flag there would snap the row to its final state halfway through.
    assert.deepEqual([...tracker.select(arrived)], ["m-4"]);
  });

  it("leaves an older page quiet when the reader scrolls back", () => {
    const tracker = createMobileMessageEntranceTracker();
    tracker.select(transcript);

    const paged = [
      message("m-0", "2026-07-31T08:59:00.000Z"),
      message("m-00", "2026-07-31T08:58:00.000Z"),
      ...transcript,
    ];

    assert.deepEqual([...tracker.select(paged)], []);
  });

  it("re-seeds when the list is handed a different conversation", () => {
    const tracker = createMobileMessageEntranceTracker();
    tracker.select(transcript);

    const otherConversation = [
      message("o-1", "2026-07-31T10:00:00.000Z"),
      message("o-2", "2026-07-31T10:01:00.000Z"),
    ];

    assert.deepEqual([...tracker.select(otherConversation)], []);
  });

  it("hands back one Set so the list's renderItem keeps its identity", () => {
    const tracker = createMobileMessageEntranceTracker();
    const first = tracker.select(transcript);
    const second = tracker.select([...transcript, message("m-4", "2026-07-31T09:03:00.000Z")]);

    assert.equal(first, second);
  });

  it("forgets a message that is no longer in the batch", () => {
    const tracker = createMobileMessageEntranceTracker();
    tracker.select(transcript);
    const arrived = [...transcript, message("m-4", "2026-07-31T09:03:00.000Z")];
    tracker.select(arrived);

    assert.deepEqual([...tracker.select(transcript)], []);
  });

  it("leaves the row's entrance off unless the list asks for it", () => {
    const source = readFileSync(
      path.join(MOBILE_ROOT, "src/app/components/dm-chat-primitives.tsx"),
      "utf8",
    );

    // The row used to start its 180ms entrance from an empty dependency list,
    // so every message of a reopened conversation replayed as an arrival.
    assert.match(source, /animateEntrance = false/u);
    assert.match(source, /animateEntrance=\{enteringMessageIds\.has\(item\.message\.id\)\}/u);
    assert.equal(
      /useEffect\(\(\) => \{\s*enterProgress\.value = reducedMotion/u.test(source),
      false,
    );
  });
});
