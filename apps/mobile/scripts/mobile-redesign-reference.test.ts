import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const referenceScriptPath = path.join(
  mobileRoot,
  "scripts",
  "mobile-redesign-reference.ts",
);

test("reference capture is locked to the vendored font binaries", async () => {
  assert.equal(
    existsSync(referenceScriptPath),
    true,
    "reference capture verifier must exist",
  );

  const packageJson = JSON.parse(
    readFileSync(path.join(mobileRoot, "package.json"), "utf8"),
  ) as { devDependencies?: Record<string, string> };
  assert.equal(packageJson.devDependencies?.["@playwright/test"], "1.59.1");

  const reference = await import("./mobile-redesign-reference");
  assert.equal(reference.REFERENCE_SOURCE_DATE_EPOCH, "0");
  assert.deepEqual(
    reference.REFERENCE_FONT_SPECS.map(({ family, filename, weight }) => ({
      family,
      filename,
      weight,
    })),
    [
      {
        family: "WhisprJakarta-400",
        filename: "PlusJakartaSans-Regular.ttf",
        weight: 400,
      },
      {
        family: "WhisprJakarta-500",
        filename: "PlusJakartaSans-Medium.ttf",
        weight: 500,
      },
      {
        family: "WhisprJakarta-600",
        filename: "PlusJakartaSans-SemiBold.ttf",
        weight: 600,
      },
      {
        family: "WhisprJakarta-700",
        filename: "PlusJakartaSans-Bold.ttf",
        weight: 700,
      },
      {
        family: "WhisprJakarta-800",
        filename: "PlusJakartaSans-ExtraBold.ttf",
        weight: 800,
      },
    ],
  );

  const fontAssets = reference.validateVendoredFontManifest();
  assert.equal(fontAssets.length, 5);
  assert.throws(
    () =>
      reference.assertVendoredFontHash(
        "PlusJakartaSans-Regular.ttf",
        "expected-hash",
        "actual-hash",
      ),
    /SHA-256 mismatch/i,
  );
  assert.match(
    reference.buildVendoredFontFaceCss(fontAssets),
    /font-family: "WhisprJakarta-400"/,
  );
  assert.equal(
    reference.isRemoteFontResource(
      {
        initiatorType: "font",
        name: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans",
      },
      "http://127.0.0.1:3000",
    ),
    true,
  );
  assert.equal(
    reference.isRemoteFontResource(
      {
        initiatorType: "font",
        name: "http://127.0.0.1:3000/fonts/PlusJakartaSans-Regular.ttf",
      },
      "http://127.0.0.1:3000",
    ),
    false,
  );
  assert.throws(
    () =>
      reference.assertAllVendoredFontsLoaded([
        { family: "WhisprJakarta-400", loaded: false },
      ]),
    /document\.fonts\.check/i,
  );
  assert.throws(
    () =>
      reference.assertNoRemoteFontResources(
        [
          {
            initiatorType: "font",
            name: "https://fonts.gstatic.com/s/plusjakartasans.ttf",
          },
        ],
        "http://127.0.0.1:3000",
      ),
    /Resource Timing reported remote fonts/i,
  );
  assert.throws(
    () => reference.assertVendoredTextFamilies(["Arial"]),
    /vendored font family/i,
  );
});
