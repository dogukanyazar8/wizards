import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { darkTheme } from "../src/design/themes";
import {
  DARK_SCREEN_SEMANTIC_ROLE_TARGETS,
  assertSemanticStyleTree,
  assertSemanticStyleSource,
} from "./mobile-redesign-semantic-role-gate";

describe("mobile redesign dark semantic role gate", () => {
  it("covers the complete dark semantic-role target set", () => {
    assert.deepEqual(
      DARK_SCREEN_SEMANTIC_ROLE_TARGETS.map(({ anchor, testId }) => ({ anchor, testId })),
      [
        { anchor: "1c", testId: "mobile-dm-inbox-screen" },
        { anchor: "1d", testId: "mobile-notifications-screen" },
        { anchor: "1f", testId: "mobile-settings-screen" },
        { anchor: "1g", testId: "mobile-server-switcher-sheet-panel" },
        { anchor: "2b", testId: "mobile-auth-login-screen" },
        { anchor: "2c", testId: "mobile-auth-register-screen" },
        { anchor: "2d", testId: "mobile-auth-forgot-password-screen" },
        { anchor: "2e", testId: "mobile-auth-two-factor-screen" },
        { anchor: "2f", testId: "mobile-auth-backup-code-screen" },
      ],
    );
    assert.ok(Object.isFrozen(DARK_SCREEN_SEMANTIC_ROLE_TARGETS));
    for (const target of DARK_SCREEN_SEMANTIC_ROLE_TARGETS) {
      assert.ok(Object.isFrozen(target));
      assert.ok(Object.isFrozen(target.sourcePaths));
      assert.equal(new Set(target.sourcePaths).size, target.sourcePaths.length);
    }
  });

  it("rejects direct raw presentation colors in each owning source tree", () => {
    for (const target of DARK_SCREEN_SEMANTIC_ROLE_TARGETS) {
      assertSemanticStyleSource(target, darkTheme);
    }
  });

  it("limits structural geometry to the canonical brand waveform", () => {
    const brandMarkTarget = DARK_SCREEN_SEMANTIC_ROLE_TARGETS.find(({ anchor }) => anchor === "2e");
    assert.ok(brandMarkTarget);
    assert.deepEqual(brandMarkTarget.structuralGeometrySourcePaths, [
      "src/app/screens/auth/auth-welcome-brand-mark.tsx",
    ]);
    assert.ok(Object.isFrozen(brandMarkTarget.structuralGeometrySourcePaths));
    assert.deepEqual(
      brandMarkTarget.structuralGeometrySourcePaths?.every((sourcePath) =>
        brandMarkTarget.sourcePaths.includes(sourcePath),
      ),
      true,
    );
    // Yapisal geometri istisnasi tek hedefte kalmali.
    assert.deepEqual(
      DARK_SCREEN_SEMANTIC_ROLE_TARGETS.filter(
        ({ structuralGeometrySourcePaths }) => structuralGeometrySourcePaths !== undefined,
      ).map(({ anchor }) => anchor),
      ["2e"],
    );
  });

  it("rejects an auth target with an unregistered raw hex and concrete measure", () => {
    const authTarget = DARK_SCREEN_SEMANTIC_ROLE_TARGETS.find(({ anchor }) => anchor === "2b");
    assert.ok(authTarget);

    assert.throws(
      () =>
        assertSemanticStyleTree(
          authTarget,
          { invalidColor: { backgroundColor: "#FF00FF" } },
          darkTheme,
        ),
      /#FF00FF/,
    );
    assert.throws(
      () =>
        assertSemanticStyleTree(authTarget, { invalidMeasure: { borderRadius: 37 } }, darkTheme),
      /37/,
    );
  });

  it("keeps raw concrete style measures rejected in normal auth sources", () => {
    const authTarget = DARK_SCREEN_SEMANTIC_ROLE_TARGETS.find(({ anchor }) => anchor === "2b");
    assert.ok(authTarget);
    const fixturePath = "scripts/.mobile-redesign-semantic-role-gate-measure-fixture.ts";

    writeFileSync(
      join(process.cwd(), fixturePath),
      "const styles = { field: { borderRadius: 37 } };\n",
    );
    try {
      assert.throws(
        () =>
          assertSemanticStyleSource(
            {
              ...authTarget,
              sourcePaths: [fixturePath],
              structuralGeometrySourcePaths: [],
            },
            darkTheme,
          ),
        /37/,
      );
    } finally {
      rmSync(join(process.cwd(), fixturePath), { force: true });
    }
  });
});
