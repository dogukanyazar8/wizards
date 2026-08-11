import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..");

function resolveMetroImageSize() {
  let dependencyRequire = createRequire(resolve(root, "apps", "mobile", "package.json"));

  for (const dependency of ["expo", "@expo/cli", "metro"]) {
    dependencyRequire = createRequire(dependencyRequire.resolve(`${dependency}/package.json`));
  }

  return dependencyRequire.resolve("image-size");
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

test("Metro image parsing rejects zero-length boxes without blocking Node", () => {
  const imageSizePath = resolveMetroImageSize();

  for (const [format, buffer] of Object.entries(malformedImageFixtures())) {
    const script = `
      const { imageSize } = require(${JSON.stringify(imageSizePath)});
      try {
        imageSize(Buffer.from(${JSON.stringify(buffer.toString("base64"))}, "base64"));
      } catch {}
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
