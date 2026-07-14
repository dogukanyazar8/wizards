import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { darkTheme } from "../src/design/themes";
import {
  DARK_SCREEN_SEMANTIC_ROLE_TARGETS,
  assertSemanticStyleTree,
  assertSemanticStyleSource,
} from "./mobile-redesign-semantic-role-gate";

describe("mobile redesign dark semantic role gate", () => {
  it("uses pixel references only where the handoff contains dark frames", () => {
    assert.deepEqual(
      DARK_SCREEN_SEMANTIC_ROLE_TARGETS.map(({ anchor, testId }) => ({ anchor, testId })),
      [
        { anchor: "1c", testId: "mobile-dm-inbox-screen" },
        { anchor: "1d", testId: "mobile-notifications-screen" },
        { anchor: "1f", testId: "mobile-settings-screen" },
        { anchor: "1g", testId: "mobile-server-switcher-sheet-panel" },
      ],
    );
  });

  it("rejects direct raw presentation colors in each owning source tree", () => {
    for (const target of DARK_SCREEN_SEMANTIC_ROLE_TARGETS) {
      assertSemanticStyleSource(target, darkTheme);
    }
  });

  it("rejects an unregistered raw hex and an unregistered concrete measure", () => {
    const dmTarget = DARK_SCREEN_SEMANTIC_ROLE_TARGETS.find(({ anchor }) => anchor === "1c");
    assert.ok(dmTarget);

    assert.throws(
      () =>
        assertSemanticStyleTree(
          dmTarget,
          { invalidColor: { backgroundColor: "#FF00FF" } },
          darkTheme,
        ),
      /#FF00FF/,
    );
    assert.throws(
      () =>
        assertSemanticStyleTree(
          dmTarget,
          { invalidMeasure: { borderRadius: 37 } },
          darkTheme,
        ),
      /37/,
    );
  });
});
