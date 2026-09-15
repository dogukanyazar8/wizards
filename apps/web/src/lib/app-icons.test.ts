import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { getAppFaviconById, getAppIconById } from "./app-icons";

it("uses the opaque tab mark without changing PNG touch icons or other icon choices", () => {
  assert.deepEqual(getAppFaviconById("whispr"), { src: "/favicon.svg", type: "image/svg+xml" });
  assert.equal(getAppIconById("whispr").src, "/app-icons/whispr.png");
  assert.deepEqual(getAppFaviconById("wave-5"), {
    src: "/app-icons/wave-5.png",
    type: "image/png",
  });
});

it("renders white opaque logo bars and transparent outer corners", async () => {
  const { data, info } = await sharp(
    fileURLToPath(new URL("../../public/favicon.svg", import.meta.url)),
  )
    .resize(64, 64)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
  assert.deepEqual(pixel(32, 32), [255, 255, 255, 255]);
  assert.deepEqual(pixel(19, 32), [255, 255, 255, 255]);
  assert.equal(pixel(0, 0)[3], 0);
});
