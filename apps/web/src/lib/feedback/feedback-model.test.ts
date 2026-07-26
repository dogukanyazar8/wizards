import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileRoadmapItem } from "@wizards/types";

import {
  buildFeedbackPreview,
  compareRoadmapItems,
  resolveMobileRoadmapPreview,
  shouldNotifyFeedbackStatusChange,
} from "./feedback-model";

function item(overrides: Partial<MobileRoadmapItem> & { id: string }): MobileRoadmapItem {
  return {
    description: null,
    isOwnSuggestion: false,
    status: "REVIEWING",
    title: overrides.id,
    voteCount: 0,
    votedByViewer: false,
    ...overrides,
  };
}

describe("roadmap ordering", () => {
  it("puts featured rows first, then the most-wanted, then the curated position", () => {
    const rows = [
      { createdAt: "2026-07-01T00:00:00.000Z", featured: false, position: 1, voteCount: 10 },
      { createdAt: "2026-07-02T00:00:00.000Z", featured: true, position: 9, voteCount: 1 },
      { createdAt: "2026-07-03T00:00:00.000Z", featured: false, position: 0, voteCount: 10 },
    ];

    const sorted = rows.slice().sort(compareRoadmapItems);

    assert.equal(sorted[0]?.featured, true);
    assert.equal(sorted[1]?.position, 0);
    assert.equal(sorted[2]?.position, 1);
  });

  it("breaks a full tie with the newest row", () => {
    const older = {
      createdAt: "2026-07-01T00:00:00.000Z",
      featured: false,
      position: 0,
      voteCount: 4,
    };
    const newer = {
      createdAt: "2026-07-09T00:00:00.000Z",
      featured: false,
      position: 0,
      voteCount: 4,
    };

    assert.ok(compareRoadmapItems(newer, older) < 0);
  });
});

describe("4b roadmap preview", () => {
  it("keeps the top three when the viewer already appears in them", () => {
    const preview = resolveMobileRoadmapPreview(
      [
        item({ id: "a" }),
        item({ id: "b", isOwnSuggestion: true }),
        item({ id: "c" }),
        item({ id: "d" }),
      ],
      3,
    );

    assert.deepEqual(
      preview.map((entry) => entry.id),
      ["a", "b", "c"],
    );
  });

  // "senin önerin 👋" is the reason the card is worth looking at; ranking alone
  // would bury the row the user just created.
  it("gives the viewer's own suggestion the last slot when ranking missed it", () => {
    const preview = resolveMobileRoadmapPreview(
      [
        item({ id: "a" }),
        item({ id: "b" }),
        item({ id: "c" }),
        item({ id: "mine", isOwnSuggestion: true }),
      ],
      3,
    );

    assert.deepEqual(
      preview.map((entry) => entry.id),
      ["a", "b", "mine"],
    );
  });

  it("appends rather than replaces when there is room", () => {
    const preview = resolveMobileRoadmapPreview(
      [item({ id: "a" }), item({ id: "mine", isOwnSuggestion: true })],
      3,
    );

    assert.deepEqual(
      preview.map((entry) => entry.id),
      ["a", "mine"],
    );
  });

  it("returns nothing for an empty roadmap or a zero limit", () => {
    assert.deepEqual(resolveMobileRoadmapPreview([], 3), []);
    assert.deepEqual(resolveMobileRoadmapPreview([item({ id: "a" })], 0), []);
  });
});

describe("console row preview", () => {
  it("collapses whitespace and keeps the row to one line", () => {
    assert.equal(buildFeedbackPreview("  bir   iki\nüç  "), "bir iki üç");
  });

  it("truncates with an ellipsis instead of a dangling word", () => {
    const preview = buildFeedbackPreview("a".repeat(300));

    assert.equal(preview.length, 200);
    assert.ok(preview.endsWith("…"));
  });
});

describe("status change notification", () => {
  it("stays quiet when the console re-saves the same status", () => {
    assert.equal(shouldNotifyFeedbackStatusChange("PLANNED", "PLANNED"), false);
    assert.equal(shouldNotifyFeedbackStatusChange("PLANNED", undefined), false);
  });

  it("fires when the status actually moves", () => {
    assert.equal(shouldNotifyFeedbackStatusChange("REVIEWING", "SHIPPED"), true);
  });
});
