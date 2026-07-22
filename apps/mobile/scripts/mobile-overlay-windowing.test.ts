import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const sourceRoot = join(process.cwd(), "src");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }
    return entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ? [path]
      : [];
  });
}

function read(...segments: string[]): string {
  return readFileSync(join(sourceRoot, ...segments), "utf8");
}

describe("mobile overlay windowing", () => {
  it("renders every user-facing overlay in the app window instead of an RN Modal", () => {
    const offenders = listSourceFiles(sourceRoot)
      .filter((path) => {
        // Comments are allowed to explain what Modal used to do here.
        const code = readFileSync(path, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "");
        return /\bModal\b/.test(code);
      })
      .map((path) => path.slice(sourceRoot.length + 1));

    assert.deepEqual(
      offenders,
      [],
      "Sheets, menus and viewers share MobileOverlayHost; only native Alert may open its own window",
    );
  });

  it("keeps the overlay surface free of its own window and keyboard provider", () => {
    const surface = read("app", "components", "kit", "overlay-surface.tsx");

    assert.doesNotMatch(surface, /from "react-native-keyboard-controller"/);
    assert.doesNotMatch(surface, /tracksKeyboard/);
    assert.match(surface, /mobileOverlayRegistry\.set\(/);
    assert.match(surface, /mobileOverlayRegistry\.remove\(/);
  });

  it("mounts the host as the last sibling of the app content", () => {
    const productApp = read("app", "mobile-product-app.tsx");

    assert.match(productApp, /<MobileOverlayContentScope/);
    assert.match(productApp, /<\/MobileAppShell>\s*\n\s*<MobileOverlayHost \/>/);
  });

  it("bridges exactly the contexts provided below the host", () => {
    const bridge = read("app", "components", "kit", "overlay-context-bridge.tsx");

    assert.match(bridge, /name: "Navigation"/);
    assert.match(bridge, /name: "MobileChatKeyboardScope"/);
    // The guard is what turns a forgotten provider into an error instead of a
    // silent default value inside a sheet.
    assert.match(bridge, /Overlay context bridge is missing/);
  });
});
