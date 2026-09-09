import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { mobileSplashTypography, mobileTypography } from "../src/design/tokens";

type FontManifestEntry = {
  readonly family: string;
  readonly weight: number;
  readonly sha256: string;
  readonly source: string;
};

type FontManifestSource = {
  readonly package: string;
  readonly version: string;
  readonly license: string;
  readonly licenseFile: string;
};

type FontManifest = {
  readonly sources: Record<string, FontManifestSource>;
  readonly files: Record<string, FontManifestEntry>;
};

/**
 * Vendored yüzler.
 *
 * Jakarta ürünün geneli. Outfit ve Figtree yalnız açılış ekranı içindir
 * (SPEC-SPLASH §1) ve Google'dan çekilmez: ikili dosyalar depodaki
 * `apps/web/src/app/fonts/*.woff2` değişken yüzlerinden sabit ağırlığa indirgendi,
 * yani web ile mobil aynı çizimi paylaşıyor ve çalışma anında ağ isteği yok.
 */
const EXPECTED_FONTS = {
  "Figtree-Bold.ttf": {
    family: "WhisprFigtree_700Bold",
    source: "figtree",
    weight: 700,
  },
  "Figtree-Medium.ttf": {
    family: "WhisprFigtree_500Medium",
    source: "figtree",
    weight: 500,
  },
  "Figtree-Regular.ttf": {
    family: "WhisprFigtree_400Regular",
    source: "figtree",
    weight: 400,
  },
  "Figtree-SemiBold.ttf": {
    family: "WhisprFigtree_600SemiBold",
    source: "figtree",
    weight: 600,
  },
  "Outfit-Bold.ttf": {
    family: "WhisprOutfit_700Bold",
    source: "outfit",
    weight: 700,
  },
  "Outfit-SemiBold.ttf": {
    family: "WhisprOutfit_600SemiBold",
    source: "outfit",
    weight: 600,
  },
  "PlusJakartaSans-Bold.ttf": {
    family: "WhisprJakarta_700Bold",
    source: "plus-jakarta-sans",
    weight: 700,
  },
  "PlusJakartaSans-ExtraBold.ttf": {
    family: "WhisprJakarta_800ExtraBold",
    source: "plus-jakarta-sans",
    weight: 800,
  },
  "PlusJakartaSans-Medium.ttf": {
    family: "WhisprJakarta_500Medium",
    source: "plus-jakarta-sans",
    weight: 500,
  },
  "PlusJakartaSans-Regular.ttf": {
    family: "WhisprJakarta_400Regular",
    source: "plus-jakarta-sans",
    weight: 400,
  },
  "PlusJakartaSans-SemiBold.ttf": {
    family: "WhisprJakarta_600SemiBold",
    source: "plus-jakarta-sans",
    weight: 600,
  },
} as const;

const EXPECTED_FONT_COUNT = Object.keys(EXPECTED_FONTS).length;

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
  it("vendors every licensed binary behind a stable Whispr family", () => {
    const mobileRoot = process.cwd();
    const fontsRoot = join(mobileRoot, "assets", "fonts");
    const manifestPath = join(fontsRoot, "manifest.json");

    assert.equal(existsSync(manifestPath), true, "assets/fonts/manifest.json must exist");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FontManifest;

    assert.deepEqual(Object.keys(manifest.files).sort(), Object.keys(EXPECTED_FONTS).sort());
    assert.deepEqual(Object.keys(manifest.sources).sort(), [
      "figtree",
      "outfit",
      "plus-jakarta-sans",
    ]);

    for (const [name, source] of Object.entries(manifest.sources)) {
      assert.equal(source.license, "OFL-1.1", `${name} must stay OFL-1.1`);

      const licensePath = join(fontsRoot, source.licenseFile);
      assert.equal(existsSync(licensePath), true, `${name} must vendor its license`);

      const license = readFileSync(licensePath, "utf8");
      assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    }

    // Her ailenin telif satırı lisans dosyasında adıyla geçmeli; yeni bir yüzü
    // lisansı güncellemeden eklemek böyle yakalanır.
    const license = readFileSync(join(fontsRoot, "OFL.txt"), "utf8");
    for (const project of ["Plus Jakarta Sans", "Outfit", "Figtree"]) {
      assert.match(license, new RegExp(`${project} Project Authors`));
    }

    const manifestFamilies = new Set<string>();
    const manifestHashes = new Set<string>();

    for (const [filename, expected] of Object.entries(EXPECTED_FONTS)) {
      const fontPath = join(fontsRoot, filename);
      const entry = manifest.files[filename];

      assert.equal(existsSync(fontPath), true, `${filename} must exist`);
      assert.ok(entry, `${filename} must have a manifest entry`);
      assert.equal(entry.family, expected.family);
      assert.equal(entry.weight, expected.weight);
      assert.equal(entry.source, expected.source);
      assert.ok(manifest.sources[entry.source], `${filename} names an unknown source`);
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      assert.equal(
        entry.sha256,
        createHash("sha256").update(readFileSync(fontPath)).digest("hex"),
        `${filename} SHA-256 must match its vendored binary`,
      );

      manifestFamilies.add(entry.family);
      manifestHashes.add(entry.sha256);
    }

    assert.equal(
      manifestFamilies.size,
      EXPECTED_FONT_COUNT,
      "each font weight must use a distinct runtime family",
    );
    assert.equal(
      manifestHashes.size,
      EXPECTED_FONT_COUNT,
      "each font weight must use a distinct binary",
    );
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
    // Splash kendi ailelerini kullanır; ürünün varsayılan yüzü ona karışmaz.
    assert.deepEqual(
      {
        body: mobileSplashTypography.fontFamilyBody,
        bodyBold: mobileSplashTypography.fontFamilyBodyBold,
        bodyMedium: mobileSplashTypography.fontFamilyBodyMedium,
        bodySemiBold: mobileSplashTypography.fontFamilyBodySemiBold,
        display: mobileSplashTypography.fontFamilyDisplay,
        displaySemiBold: mobileSplashTypography.fontFamilyDisplaySemiBold,
      },
      {
        body: "WhisprFigtree_400Regular",
        bodyBold: "WhisprFigtree_700Bold",
        bodyMedium: "WhisprFigtree_500Medium",
        bodySemiBold: "WhisprFigtree_600SemiBold",
        display: "WhisprOutfit_700Bold",
        displaySemiBold: "WhisprOutfit_600SemiBold",
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

    // Yüzler yereldir: ne çalışma anında Google'dan indirilir ne de bir runtime
    // font paketi kurulur. Outfit/Figtree adları artık kodda geçebilir, ama
    // yalnız vendored aile adı ve yerel `require` yolu olarak.
    assert.equal(runtimeSource.includes("@expo-google-fonts"), false);
    assert.equal(runtimeSource.includes("https://fonts.googleapis.com"), false);
    assert.equal(runtimeSource.includes("https://fonts.gstatic.com"), false);
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
