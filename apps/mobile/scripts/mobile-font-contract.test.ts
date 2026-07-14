import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { mobileTypography } from "../src/design/tokens";

type FontManifestEntry = {
  readonly family: string;
  readonly weight: number;
  readonly sha256: string;
};

type FontManifest = {
  readonly source: {
    readonly package: string;
    readonly version: string;
    readonly license: string;
    readonly licenseFile: string;
  };
  readonly files: Record<string, FontManifestEntry>;
};

const EXPECTED_FONTS = {
  "PlusJakartaSans-Bold.ttf": {
    family: "WhisprJakarta_700Bold",
    weight: 700,
  },
  "PlusJakartaSans-ExtraBold.ttf": {
    family: "WhisprJakarta_800ExtraBold",
    weight: 800,
  },
  "PlusJakartaSans-Medium.ttf": {
    family: "WhisprJakarta_500Medium",
    weight: 500,
  },
  "PlusJakartaSans-Regular.ttf": {
    family: "WhisprJakarta_400Regular",
    weight: 400,
  },
  "PlusJakartaSans-SemiBold.ttf": {
    family: "WhisprJakarta_600SemiBold",
    weight: 600,
  },
} as const;

function collectRuntimeSources(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry: Dirent) => {
      const path = join(root, entry.name);

      if (entry.isDirectory()) {
        return collectRuntimeSources(path);
      }

      return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? readFileSync(path, "utf8") : [];
    })
    .join("\n");
}

describe("mobile font contract", () => {
  it("vendors licensed Plus Jakarta Sans binaries behind stable Whispr families", () => {
    const mobileRoot = process.cwd();
    const fontsRoot = join(mobileRoot, "assets", "fonts");
    const manifestPath = join(fontsRoot, "manifest.json");

    assert.equal(existsSync(manifestPath), true, "assets/fonts/manifest.json must exist");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FontManifest;

    assert.deepEqual(Object.keys(manifest.files).sort(), [
      "PlusJakartaSans-Bold.ttf",
      "PlusJakartaSans-ExtraBold.ttf",
      "PlusJakartaSans-Medium.ttf",
      "PlusJakartaSans-Regular.ttf",
      "PlusJakartaSans-SemiBold.ttf",
    ]);
    assert.deepEqual(manifest.source, {
      package: "@expo-google-fonts/plus-jakarta-sans",
      version: "0.4.2",
      license: "OFL-1.1",
      licenseFile: "OFL.txt",
    });

    const licensePath = join(fontsRoot, manifest.source.licenseFile);
    assert.equal(existsSync(licensePath), true, "the OFL license must be vendored with the fonts");
    assert.match(readFileSync(licensePath, "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);

    const manifestFamilies = new Set<string>();
    const manifestHashes = new Set<string>();

    for (const [filename, expected] of Object.entries(EXPECTED_FONTS)) {
      const fontPath = join(fontsRoot, filename);
      const entry = manifest.files[filename];

      assert.equal(existsSync(fontPath), true, `${filename} must exist`);
      assert.ok(entry, `${filename} must have a manifest entry`);
      assert.equal(entry.family, expected.family);
      assert.equal(entry.weight, expected.weight);
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      assert.equal(
        entry.sha256,
        createHash("sha256").update(readFileSync(fontPath)).digest("hex"),
        `${filename} SHA-256 must match its vendored binary`,
      );

      manifestFamilies.add(entry.family);
      manifestHashes.add(entry.sha256);
    }

    assert.equal(manifestFamilies.size, 5, "each font weight must use a distinct runtime family");
    assert.equal(manifestHashes.size, 5, "each font weight must use a distinct binary");
    assert.deepEqual(
      {
        regular: mobileTypography.fontFamily,
        medium: mobileTypography.fontFamilyMedium,
        semiBold: mobileTypography.fontFamilySemiBold,
        bold: mobileTypography.fontFamilyBold,
        extraBold: mobileTypography.fontFamilyExtraBold,
      },
      {
        regular: "WhisprJakarta_400Regular",
        medium: "WhisprJakarta_500Medium",
        semiBold: "WhisprJakarta_600SemiBold",
        bold: "WhisprJakarta_700Bold",
        extraBold: "WhisprJakarta_800ExtraBold",
      },
    );

    const fontSource = readFileSync(join(mobileRoot, "src", "design", "mobile-fonts.ts"), "utf8");
    const fontGateSource = readFileSync(
      join(mobileRoot, "src", "design", "mobile-font-gate.tsx"),
      "utf8",
    );
    const productAppSource = readFileSync(
      join(mobileRoot, "src", "app", "mobile-product-app.tsx"),
      "utf8",
    );
    const rootSource = readFileSync(
      join(mobileRoot, "src", "app", "whispr-mobile-root.tsx"),
      "utf8",
    );
    const runtimeSource = collectRuntimeSources(join(mobileRoot, "src"));
    const packageJson = JSON.parse(readFileSync(join(mobileRoot, "package.json"), "utf8")) as {
      readonly dependencies?: Record<string, string>;
    };

    assert.equal(runtimeSource.includes("Outfit"), false);
    assert.equal(runtimeSource.includes("@expo-google-fonts"), false);
    assert.equal(runtimeSource.includes("https://fonts.googleapis.com"), false);
    assert.equal(
      Object.keys(packageJson.dependencies ?? {}).some((name) =>
        name.startsWith("@expo-google-fonts/"),
      ),
      false,
      "runtime font packages must not remain installed",
    );

    for (const [filename, expected] of Object.entries(EXPECTED_FONTS)) {
      assert.ok(
        fontSource.includes(`${expected.family}: require("../../assets/fonts/${filename}")`),
        `${expected.family} must load ${filename}`,
      );
    }

    assert.match(fontGateSource, /useMobileFonts\(\)/);
    assert.match(fontGateSource, /installMobileFontDefaults\(\)/);
    assert.match(rootSource, /<MobileFontGate>[\s\S]*<MobileAppProviders>/);
    assert.doesNotMatch(productAppSource, /useMobileFonts|installMobileFontDefaults/);
  });
});
