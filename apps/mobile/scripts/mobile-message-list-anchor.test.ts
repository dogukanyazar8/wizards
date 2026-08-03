import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  configureMobileMessageListAnchor,
  getMobileMessageListAnchorConfig,
  getMobileMessageListAnchorVariant,
  resetMobileMessageListAnchorForTests,
} from "../src/app/components/message-list-anchor";

afterEach(() => {
  resetMobileMessageListAnchorForTests();
});

describe("message list anchor", () => {
  it("renders from the bottom by default, which is the product behaviour", () => {
    assert.equal(getMobileMessageListAnchorVariant(), "bottom");
    assert.equal(getMobileMessageListAnchorConfig().startRenderingFromBottom, true);
  });

  it("refuses to leave the product behaviour without the experiment", () => {
    configureMobileMessageListAnchor({ allowExperiment: false, variant: "top" });

    // A reader must not get a transcript that renders from the top because an
    // instrument said so.
    assert.equal(getMobileMessageListAnchorVariant(), "bottom");
    assert.equal(getMobileMessageListAnchorConfig().startRenderingFromBottom, true);
  });

  it("lets a diagnostics build price the layout pass", () => {
    configureMobileMessageListAnchor({ allowExperiment: true, variant: "top" });

    assert.equal(getMobileMessageListAnchorVariant(), "top");
    assert.equal(getMobileMessageListAnchorConfig().startRenderingFromBottom, false);
    // The follow-new-message behaviour is not part of the question.
    assert.equal(getMobileMessageListAnchorConfig().autoscrollToBottomThreshold, 0.2);
  });

  it("hands both lists one frozen object rather than a fresh literal", () => {
    assert.equal(getMobileMessageListAnchorConfig(), getMobileMessageListAnchorConfig());
    assert.equal(Object.isFrozen(getMobileMessageListAnchorConfig()), true);
  });

  it("is the only place either transcript states its anchor", () => {
    const dm = readFileSync(
      path.join(__dirname, "..", "src/app/components/dm-chat-primitives.tsx"),
      "utf8",
    );
    const channel = readFileSync(
      path.join(__dirname, "..", "src/app/screens/channel-screen.tsx"),
      "utf8",
    );

    for (const source of [dm, channel]) {
      assert.match(source, /maintainVisibleContentPosition=\{listAnchor\}/u);
      assert.doesNotMatch(source, /startRenderingFromBottom: true/u);
    }
  });

  it("rides the open so a run can bucket by it", () => {
    const navigator = readFileSync(
      path.join(__dirname, "..", "src/navigation/mobile-navigator.tsx"),
      "utf8",
    );

    assert.match(navigator, /listAnchor: getMobileMessageListAnchorVariant\(\)/u);
  });
});
