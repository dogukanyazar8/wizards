import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { launchDesktopControlSection } from "./desktop-control-launch";

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
