import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findMessageVirtualIndex,
  MESSAGE_VIRTUALIZER_SCROLL_OPTIONS,
  getNewMessageAnnouncement,
  getVirtualMessageRows,
  isMessageListNearBottom,
  scheduleMessageListScrollPass,
} from "./message-list";

describe("message list scroll scheduling", () => {
  it("uses one animation frame and one settlement timeout", () => {
    const frames: Array<() => void> = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    let scrollCount = 0;

    const frameId = scheduleMessageListScrollPass({
      onScroll: () => {
        scrollCount += 1;
      },
      onSettled: () => undefined,
      requestFrame: (callback) => {
        frames.push(callback);
        return 11;
      },
      scheduleTimeout: (callback, delay) => {
        timeouts.push({ callback, delay });
        return 22;
      },
      shouldSchedule: true,
    });

    assert.equal(frameId, 11);
    assert.equal(frames.length, 1);
    assert.equal(timeouts.length, 0);

    frames[0]?.();
    assert.equal(scrollCount, 1);
    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0]?.delay, 150);

    timeouts[0]?.callback();
    assert.equal(scrollCount, 2);
  });

  it("schedules nothing when the reader is away from the bottom", () => {
    let scheduledFrames = 0;
    const frameId = scheduleMessageListScrollPass({
      onScroll: () => undefined,
      onSettled: () => undefined,
      requestFrame: () => {
        scheduledFrames += 1;
        return 11;
      },
      scheduleTimeout: () => 22,
      shouldSchedule: false,
    });

    assert.equal(frameId, null);
    assert.equal(scheduledFrames, 0);
    assert.equal(
      isMessageListNearBottom({ clientHeight: 400, scrollHeight: 1_000, scrollTop: 300 }),
      false,
    );
  });
});

describe("message list virtualization", () => {
  it("keeps a 500-message transcript bounded to the virtual window", () => {
    const messages = Array.from({ length: 500 }, (_, index) => ({ id: `message-${index}` }));
    const virtualItems = Array.from({ length: 18 }, (_, offset) => ({
      index: 241 + offset,
      key: `message-${241 + offset}`,
      size: 84,
      start: (241 + offset) * 84,
    }));

    const rows = getVirtualMessageRows(messages, virtualItems);

    assert.equal(rows.length, 18);
    assert.equal(rows[0]?.row.id, "message-241");
    assert.equal(rows.at(-1)?.row.id, "message-258");
  });

  it("anchors prepends and late row growth while following near-bottom appends", () => {
    assert.deepEqual(MESSAGE_VIRTUALIZER_SCROLL_OPTIONS, {
      anchorTo: "end",
      followOnAppend: "auto",
      scrollEndThreshold: 100,
    });
  });

  it("finds an offscreen search target without requiring its DOM node", () => {
    const messages = Array.from({ length: 500 }, (_, index) => ({
      message: { id: `message-${index}` },
    }));

    assert.equal(findMessageVirtualIndex(messages, "message-417"), 417);
    assert.equal(findMessageVirtualIndex(messages, "missing"), -1);
  });

  it("announces remote messages without repeating optimistic own-message echoes", () => {
    assert.equal(
      getNewMessageAnnouncement(
        { authorId: "other-user", authorName: "Ada", content: "Merhaba", id: "message-1" },
        "current-user",
      )?.text,
      "Ada: Merhaba",
    );
    assert.equal(
      getNewMessageAnnouncement(
        { authorId: "current-user", authorName: "Ben", content: "Selam", id: "optimistic-1" },
        "current-user",
      ),
      null,
    );
  });
});
