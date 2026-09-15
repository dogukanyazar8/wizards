import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  desktopControlSectionForSettingsAction,
  launchDesktopControlSection,
} from "./desktop-control-launch";

describe("desktop settings control destinations", () => {
  it("maps settings actions to local tools and rejects unsupported actions", () => {
    for (const [rowKey, actionIndex, expected] of [
      ["w1", 0, "app"],
      ["w2", 0, "app"],
      ["q3", 0, "shortcuts"],
      ["h1", 0, "updates"],
      ["o3", 0, "updates"],
      ["n4", 0, "diagnostics"],
      ["n4", 1, "recovery"],
      ["n4", 2, null],
      ["h1", 1, null],
      ["z8", 0, null],
      ["unknown", 0, null],
    ] as const) {
      assert.equal(desktopControlSectionForSettingsAction(rowKey, actionIndex), expected);
    }
  });
});

describe("desktop control launch state", () => {
  it("reports pending then idle and preserves the bounded section", async () => {
    const states: string[] = [];
    const sections: string[] = [];

    await launchDesktopControlSection(
      "updates",
      async (section) => {
        sections.push(section);
        return true;
      },
      (state) => states.push(state),
    );

    assert.deepEqual(sections, ["updates"]);
    assert.deepEqual(states, ["pending", "idle"]);
  });

  it("reports a visible error for false and rejected opens", async () => {
    for (const openControl of [
      async () => false,
      async () => {
        throw new Error("blocked");
      },
    ]) {
      const states: string[] = [];
      await launchDesktopControlSection("shortcuts", openControl, (state) => states.push(state));
      assert.deepEqual(states, ["pending", "error"]);
    }
  });
});
