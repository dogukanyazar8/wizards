import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const definitionPath = join(process.cwd(), "src", "design", "mobile-line-icon-definitions.ts");

const expectedDefinitions = {
  "back-arrow": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M15 6l-6 6 6 6" }],
  },
  bell: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M6 16v-5a6 6 0 0 1 12 0v5l2 3H4zM10 21.5h4" }],
  },
  "chat-bubble": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 5.5h16v11H10l-6 4z" }],
  },
  check: {
    mode: "stroke",
    defaultStrokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M5 12.5l4.5 4.5L19 7.5" }],
  },
  "chevron-down": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M6 9l6 6 6-6" }],
  },
  "chevron-right": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M9 6l6 6-6 6" }],
  },
  edit: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M16 4l4 4L8 20H4v-4z" }],
  },
  emoji: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      {
        type: "path",
        d: "M8.5 14c1 1.6 6 1.6 7 0M9.5 9.8h.01M14.5 9.8h.01",
        strokeWidth: 2.2,
      },
    ],
  },
  headphones: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M4 13a8 8 0 0 1 16 0" },
      { type: "rect", x: 3, y: 13, width: 4.5, height: 7, rx: 2 },
      { type: "rect", x: 16.5, y: 13, width: 4.5, height: 7, rx: 2 },
    ],
  },
  "invite-user": {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 7, r: 3.4 },
      { type: "path", d: "M5 20c1.2-3.6 12.8-3.6 14 0" },
      { type: "path", d: "M18 4v4M16 6h4", strokeWidth: 1.6 },
    ],
  },
  leave: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 14c5-4 11-4 16 0M4 14l2 3 3-2M20 14l-2 3-3-2" }],
  },
  mic: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "rect", x: 9, y: 3.5, width: 6, height: 11, rx: 3 },
      { type: "path", d: "M6 12a6 6 0 0 0 12 0M12 18v3" },
    ],
  },
  "mic-off": {
    mode: "stroke",
    defaultStrokeWidth: 2.2,
    strokeLinecap: "round",
    children: [
      { type: "rect", x: 9, y: 3.5, width: 6, height: 11, rx: 3 },
      { type: "path", d: "M4 4l16 16" },
    ],
  },
  plus: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M12 5v14M5 12h14" }],
  },
  profile: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 8, r: 3.6 },
      { type: "path", d: "M5 20.5c1.3-4 12.7-4 14 0" },
    ],
  },
  search: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 11, cy: 11, r: 6 },
      { type: "path", d: "M15.8 15.8L20 20" },
    ],
  },
  send: {
    mode: "fill",
    children: [{ type: "path", d: "M3.5 11.5L21 4l-5.5 17-3.5-7z" }],
  },
  servers: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 11l8-7 8 7v9H4z" }],
  },
  speaker: {
    mode: "fill",
    children: [{ type: "path", d: "M4 10v4h4l5 4V6L8 10z" }],
  },
} as const;

const expectedNames = Object.keys(expectedDefinitions);

async function loadDefinitions() {
  assert.ok(existsSync(definitionPath), "mobile line icon definitions must exist");
  return import(pathToFileURL(definitionPath).href) as Promise<{
    MOBILE_LINE_ICON_DEFINITIONS: unknown;
    MOBILE_LINE_ICON_NAMES: readonly string[];
  }>;
}

describe("mobile redesign icon contract", () => {
  it("declares the exact Expo-compatible react-native-svg runtime dependency", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    assert.equal(packageJson.dependencies?.["react-native-svg"], "15.15.4");
    assert.equal(packageJson.devDependencies?.["react-native-svg"], undefined);
  });

  it("locks every supported name to its exact HTML geometry and rendering mode", async () => {
    const definitions = await loadDefinitions();

    assert.deepEqual(definitions.MOBILE_LINE_ICON_NAMES, expectedNames);
    assert.deepEqual(definitions.MOBILE_LINE_ICON_DEFINITIONS, expectedDefinitions);
  });

  it("does not invent vectors for pseudo-icons absent from the HTML", async () => {
    const { MOBILE_LINE_ICON_NAMES } = await loadDefinitions();

    for (const unsupportedName of ["at-badge", "close", "crown", "hash"]) {
      assert.equal(MOBILE_LINE_ICON_NAMES.includes(unsupportedName), false, unsupportedName);
    }
  });

  it("keeps the definition table exhaustive at compile time", () => {
    assert.ok(existsSync(definitionPath), "mobile line icon definitions must exist");
    const source = readFileSync(definitionPath, "utf8");

    assert.match(source, /satisfies\s+Record<MobileLineIconName,\s*MobileLineIconDefinition>/);
  });
});
