import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const transformPath = path.join(mobileRoot, "scripts", "mobile-redesign-golden-transform.ts");

test("normalized golden transform audits substitutions and writes versioned canonical frames", async () => {
  assert.equal(existsSync(transformPath), true, "normalized golden transform must exist");

  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["visual:golden:generate"],
    "node --import tsx scripts/mobile-redesign-golden-transform.ts",
  );

  const golden = await import("./mobile-redesign-golden-transform");

  assert.equal(golden.normalizeAccessibleColor({
    color: "#6B7194",
    context: "#FFFFFF",
    kind: "text",
    theme: "light",
  }).color, "#62688B");
  assert.equal(golden.normalizeAccessibleColor({
    color: "#4F46E5",
    context: "#EEF0FE",
    kind: "active-tab-control",
    theme: "light",
  }).color, "#4F46E5");
  assert.throws(
    () => golden.assertExactlyOneAuditedMapping([]),
    /exactly one audited semantic-role mapping/i,
  );
  assert.throws(
    () => golden.assertMinimumContrast({ background: "#FFFFFF", foreground: "#8A90B0", minimumRatio: 4.5 }),
    /contrast/i,
  );
  const selectedFrameHash = golden.getNormalizedGoldenSourceHash({
    bodyAttributes: 'data-handoff="mobile"',
    frames: [
      { anchor: "1b", html: '<div id="1b">channel</div>' },
      { anchor: "1a", html: '<div id="1a">servers</div>' },
      { anchor: "1c", html: '<div id="1c">messages</div>' },
      { anchor: "1d", html: '<div id="1d">notifications</div>' },
      { anchor: "1e", html: '<div id="1e">voice</div>' },
      { anchor: "1f", html: '<div id="1f">settings</div>' },
      { anchor: "1g", html: '<div id="1g">switcher</div>' },
      { anchor: "1h", html: '<div id="1h">profile</div>' },
      { anchor: "1i", html: '<div id="1i">servers dark</div>' },
      { anchor: "1j", html: '<div id="1j">channel dark</div>' },
    ],
    headHtml: "<style>.frame{display:block}</style>",
  });
  assert.equal(
    selectedFrameHash,
    golden.getNormalizedGoldenSourceHash({
      bodyAttributes: 'data-handoff="mobile"',
      frames: [
        { anchor: "1j", html: '<div id="1j">channel dark</div>' },
        { anchor: "1i", html: '<div id="1i">servers dark</div>' },
        { anchor: "1h", html: '<div id="1h">profile</div>' },
        { anchor: "1g", html: '<div id="1g">switcher</div>' },
        { anchor: "1f", html: '<div id="1f">settings</div>' },
        { anchor: "1e", html: '<div id="1e">voice</div>' },
        { anchor: "1d", html: '<div id="1d">notifications</div>' },
        { anchor: "1c", html: '<div id="1c">messages</div>' },
        { anchor: "1b", html: '<div id="1b">channel</div>' },
        { anchor: "1a", html: '<div id="1a">servers</div>' },
      ],
      headHtml: "<style>.frame{display:block}</style>",
    }),
    "the Phase 4 golden identity must include only its named frames in canonical order",
  );

  const outputDirectory = mkdtempSync(path.join(tmpdir(), "whispr-normalized-golden-"));
  const result = await golden.generateNormalizedGoldens({ outputDirectory });
  assert.equal(result.version, 1);
  assert.equal(result.sourceDateEpoch, "0");
  assert.equal(result.anchors.length, 10);
  assert.equal(result.exclusions.statusBar, "hidden");
  assert.equal(result.exclusions.successSpreadRing, "removed");
  assert.equal(result.exclusions.deviceFrame, "removed");
  assert.equal(result.substitutions.length > 0, true);

  for (const anchor of result.anchors) {
    const imagePath = path.join(outputDirectory, `${anchor.anchor}.png`);
    const image = readFileSync(imagePath);
    assert.equal(image.readUInt32BE(16), 1170, `${anchor.anchor} physical width`);
    assert.equal(image.readUInt32BE(20), 2532, `${anchor.anchor} physical height`);
    const metadata = await sharp(imagePath).metadata();
    assert.equal(metadata.channels, 4, `${anchor.anchor} must be opaque RGBA`);
    assert.equal(metadata.space, "srgb", `${anchor.anchor} must remain sRGB`);
  }
  assert.equal(existsSync(path.join(outputDirectory, "normalized-golden-manifest.json")), true);
});
