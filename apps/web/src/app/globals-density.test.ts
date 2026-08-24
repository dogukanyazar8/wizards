import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(join(appDirectory, "globals.css"), "utf8");
const shellSource = readFileSync(
  join(appDirectory, "..", "components", "shell", "wizards-shell.tsx"),
  "utf8",
);

const DENSITY_VARIABLES = [
  "--density-control-min-height",
  "--density-row-gap",
  "--density-section-gap",
  "--density-vertical-padding",
] as const;

describe("interface density scales with the root font size", () => {
  it("declares every density variable in rem", () => {
    for (const variable of DENSITY_VARIABLES) {
      const declarations = [
        ...globalsSource.matchAll(new RegExp(`${variable}:\\s*([^;]+);`, "gu")),
      ];

      assert.ok(declarations.length >= 2, `${variable} must keep both density presets`);

      for (const [, value] of declarations) {
        assert.ok(value, `${variable} must declare a value`);
        assert.match(value, /rem\b/u, `${variable} must be rem, got "${value}"`);
        assert.doesNotMatch(value, /\dpx\b/u, `${variable} must not carry px, got "${value}"`);
      }
    }
  });

  it("converts the comfortable and compact presets at 16px per rem", () => {
    for (const [variable, comfortable, compact] of [
      ["--density-control-min-height", "3rem", "2.75rem"],
      ["--density-row-gap", "0.75rem", "0.5rem"],
      ["--density-section-gap", "1rem", "0.75rem"],
      ["--density-vertical-padding", "0.75rem", "0.5rem"],
    ] as const) {
      const values = [...globalsSource.matchAll(new RegExp(`${variable}:\\s*([^;]+);`, "gu"))].map(
        ([, value]) => value,
      );

      assert.deepEqual(values, [comfortable, compact]);
    }
  });

  it("keeps the 44px accessibility floor next to the rem floor", () => {
    assert.match(
      globalsSource,
      /\[data-density-control\]\s*\{\s*min-height:\s*max\(2\.75rem,\s*44px,\s*var\(--density-control-min-height\)\);/u,
    );
  });

  it("emits rem from the shell so the inline override does not pin px back", () => {
    for (const variable of DENSITY_VARIABLES) {
      const declaration = shellSource.match(new RegExp(`"${variable}":\\s*(.+),`, "u"));

      assert.ok(declaration?.[1], `${variable} must be written by the shell`);
      assert.match(declaration[1], /pxToRem\(/u, `${variable} must be converted with pxToRem`);
      assert.doesNotMatch(declaration[1], /px`/u, `${variable} must not be emitted as px`);
    }
  });
});
