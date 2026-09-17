import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..");

function resolveMetro(dependencies) {
  let dependencyRequire = createRequire(resolve(root, "apps", "mobile", "package.json"));

  for (const dependency of dependencies) {
    dependencyRequire = createRequire(dependencyRequire.resolve(`${dependency}/package.json`));
  }

  return dependencyRequire;
}

function isoBox(size, type, payload = Buffer.alloc(Math.max(0, size - 8))) {
  const box = Buffer.alloc(Math.max(8, size));
  box.writeUInt32BE(size, 0);
  box.write(type, 4, 4, "ascii");
  payload.copy(box, 8, 0, box.length - 8);
  return box;
}

function malformedImageFixtures() {
  const icns = Buffer.alloc(16);
  icns.write("icns", 0, "ascii");
  icns.writeUInt32BE(16, 4);
  icns.write("ic07", 8, "ascii");
  icns.writeUInt32BE(0, 12);

  const heif = Buffer.concat([
    isoBox(16, "ftyp", Buffer.from("heic\0\0\0\0", "binary")),
    isoBox(0, "junk"),
  ]);

  const jxl = Buffer.concat([
    isoBox(12, "JXL ", Buffer.from([0x0d, 0x0a, 0x87, 0x0a])),
    isoBox(16, "ftyp", Buffer.from("jxl \0\0\0\0", "binary")),
    isoBox(0, "junk"),
  ]);

  return { heif, icns, jxl };
}

test("the locked dependency graph contains no vulnerable image-size parser or audit exception", () => {
  const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");
  const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");
  assert.equal(
    /image-size(?:@|:)/.test(lock),
    false,
    "image-size must remain absent from the lockfile",
  );
  assert.doesNotMatch(workspace, /GHSA-(?:5p2g-fcmc-qvqq|w3rx-r6r6-pgpr)/);
});

for (const [label, dependencies] of [
  ["Expo Metro", ["expo", "@expo/cli", "metro"]],
  ["React Native Metro", ["react-native", "@react-native/community-cli-plugin", "metro"]],
]) {
  const metroRequire = resolveMetro(dependencies);
  test(`${label}: rejects malformed image contents behind a supported extension`, () => {
    const assetsPath = metroRequire.resolve("./src/Assets.js");

    for (const [format, buffer] of Object.entries(malformedImageFixtures())) {
      const script = `
      const assert = require('node:assert/strict');
      const { getAssetSize } = require(${JSON.stringify(assetsPath)});
      const input = Buffer.from(${JSON.stringify(buffer.toString("base64"))}, "base64");
      for (const extension of ['png', 'jpg', 'webp', 'svg']) {
        assert.throws(() => getAssetSize(extension, input, 'malformed.' + extension));
      }
    `;
      const result = spawnSync(process.execPath, ["-e", script], {
        encoding: "utf8",
        timeout: 1_000,
      });

      assert.notEqual(
        result.error?.code,
        "ETIMEDOUT",
        `${format} parser blocked the Node.js event loop on a zero-length box`,
      );
      assert.equal(result.status, 0, result.stderr);
    }
  });

  test(`${label}: preserves dimensions for legitimate raster and vector assets`, () => {
    const { getAssetSize } = metroRequire("./src/Assets.js");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9AAAAABJRU5ErkJggg==",
      "base64",
    );
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
    for (const [type, contents, width, height] of [
      ["png", png, 1, 1],
      ["gif", gif, 1, 1],
      [
        "svg",
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"/>'),
        32,
        24,
      ],
      ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 36"/>'), 48, 36],
    ]) {
      const dimensions = getAssetSize(type, contents, `valid.${type}`);
      assert.equal(dimensions.width, width);
      assert.equal(dimensions.height, height);
    }
    assert.equal(getAssetSize("txt", Buffer.from("ordinary asset"), "file.txt"), null);
    assert.throws(() => getAssetSize("png", Buffer.alloc(0), "empty.png"), /empty/);
  });
}
