import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { selectUiScale, UI_SCALE_STEPS } from "@/lib/home/scale";
import {
  applyUiScale,
  UI_SCALE_ATTRIBUTE,
  UI_SCALE_LOCK_ATTRIBUTE,
  type UiScaleRoot,
} from "./use-ui-scale";

function createRoot(attributes: Record<string, string> = {}) {
  const writes: string[] = [];
  const store = new Map(Object.entries(attributes));
  const style = { fontSize: "" };
  const root: UiScaleRoot = {
    getAttribute(name) {
      return store.get(name) ?? null;
    },
    setAttribute(name, value) {
      writes.push(`${name}=${value}`);
      store.set(name, value);
    },
    style: {
      get fontSize() {
        return style.fontSize;
      },
      set fontSize(value: string) {
        writes.push(`fontSize=${value}`);
        style.fontSize = value;
      },
    },
  };
  return { root, store, writes };
}

const stepX1 = UI_SCALE_STEPS[0]!;
const stepX115 = UI_SCALE_STEPS[1]!;

describe("applyUiScale", () => {
  it("writes the root font size and the data attribute on first application", () => {
    const { root, store, writes } = createRoot();

    assert.equal(applyUiScale(root, stepX115), true);
    assert.equal(store.get(UI_SCALE_ATTRIBUTE), "1.15");
    assert.equal(root.style.fontSize, "18px");
    assert.deepEqual(writes, ["fontSize=18px", `${UI_SCALE_ATTRIBUTE}=1.15`]);
  });

  it("does not touch the DOM when the step has not changed", () => {
    const { root, writes } = createRoot();

    applyUiScale(root, stepX115);
    writes.length = 0;

    assert.equal(applyUiScale(root, stepX115), false);
    assert.deepEqual(writes, [], "unchanged step must not trigger a style recalculation");
  });

  it("writes again once the step actually changes", () => {
    const { root, writes } = createRoot();

    applyUiScale(root, stepX115);
    writes.length = 0;

    assert.equal(applyUiScale(root, stepX1), true);
    assert.deepEqual(writes, ["fontSize=16px", `${UI_SCALE_ATTRIBUTE}=1`]);
  });

  it("repairs a data attribute that drifted away from the inline font size", () => {
    const { root } = createRoot({ [UI_SCALE_ATTRIBUTE]: "1.15" });

    assert.equal(applyUiScale(root, stepX115), true);
    assert.equal(root.style.fontSize, "18px");
  });

  it("stays silent while the kill-switch is off", () => {
    const { root, store, writes } = createRoot({ [UI_SCALE_LOCK_ATTRIBUTE]: "off" });

    assert.equal(applyUiScale(root, stepX115), false);
    assert.deepEqual(writes, []);
    assert.equal(store.has(UI_SCALE_ATTRIBUTE), false);
    assert.equal(root.style.fontSize, "");
  });

  it("ignores a lock attribute set to anything other than off", () => {
    const { root } = createRoot({ [UI_SCALE_LOCK_ATTRIBUTE]: "on" });

    assert.equal(applyUiScale(root, stepX115), true);
  });

  it("applies every step returned by the selector", () => {
    for (const viewport of [
      { height: 920, width: 1360 },
      { height: 1080, width: 1920 },
      { height: 1440, width: 2560 },
      { height: 2160, width: 3840 },
    ]) {
      const { root, store } = createRoot();
      const step = selectUiScale(viewport);

      applyUiScale(root, step);

      assert.equal(root.style.fontSize, `${step.rootFontSizePx}px`);
      assert.equal(store.get(UI_SCALE_ATTRIBUTE), step.attribute);
    }
  });
});

const hooksDirectory = dirname(fileURLToPath(import.meta.url));
const srcRoot = dirname(hooksDirectory);

/** `src` altındaki üretim kaynaklarında deseni taşıyan dosyalar, `src`'e göreli ve sıralı. */
function findSources(pattern: RegExp): string[] {
  const matches: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(path);
        continue;
      }

      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
      if (path === join(hooksDirectory, "use-ui-scale.ts")) continue;

      if (pattern.test(readFileSync(path, "utf8"))) {
        matches.push(path.slice(srcRoot.length + 1).replaceAll("\\", "/"));
      }
    }
  };

  walk(srcRoot);
  return matches.sort();
}

describe("useUiScale contract", () => {
  const source = readFileSync(join(hooksDirectory, "use-ui-scale.ts"), "utf8");

  it("holds no React state, so a resize inside the same step cannot re-render", () => {
    for (const stateHook of ["useState", "useReducer", "useSyncExternalStore"]) {
      assert.doesNotMatch(source, new RegExp(`\\b${stateHook}\\b`, "u"));
    }
  });

  it("throttles resize through requestAnimationFrame instead of measuring every pixel", () => {
    assert.match(source, /requestAnimationFrame/u);
    assert.match(source, /cancelAnimationFrame/u);
  });

  it("removes its listener on unmount", () => {
    assert.match(source, /removeEventListener\("resize"/u);
  });

  it("is a client module", () => {
    assert.match(source, /^"use client";/u);
  });

  it("has exactly one call site — two writers fight each other on resize", () => {
    assert.deepEqual(findSources(/\buseUiScale\(\)/u), ["components/app/ui-scale-boundary.tsx"]);
  });

  it("is mounted in the app shell and nowhere else", () => {
    // `/admin` bilerek dışarıda: konsolun genişlikleri ve tip ölçeği hâlâ arbitrary px, kök font
    // boyutunu büyütmek yalnız rem tarafını (padding) büyütür ve sabit genişlikli kolonu daraltır.
    // Ölçüldü: x2'de aside 250px sabit kalırken padding 16 -> 32 px'e çıkıyor, nav satırı
    // 225 -> 201'e düşüyor. Ölçek admin'e px göçüyle birlikte açılır (Faz 1 raporu §6.2).
    assert.deepEqual(findSources(/<UiScaleBoundary\s*\/>/u), [
      "components/providers/authenticated-app-providers.tsx",
    ]);
  });
});
