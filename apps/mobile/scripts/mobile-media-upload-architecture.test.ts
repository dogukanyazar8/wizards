import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const mediaRoot = join(process.cwd(), "src", "media");

function readSource(name: string) {
  const path = join(mediaRoot, name);
  assert.equal(existsSync(path), true, `Expected ${name} to exist`);
  return readFileSync(path, "utf8");
}

describe("mobile media upload architecture", () => {
  it("uses the custom Expo picker with the official UploadThing transport", () => {
    const pickerSource = readSource("mobile-image-picker.ts");
    const transportSource = readSource("mobile-uploadthing-client.ts");
    const contractSource = readSource("mobile-image-upload-contract.ts");
    const productAppSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-product-app.tsx"),
      "utf8",
    );

    assert.match(pickerSource, /from "expo-image-picker"/);
    assert.match(transportSource, /generateReactNativeHelpers/);
    assert.match(transportSource, /\.uploadFiles/);
    assert.doesNotMatch(transportSource, /useImageUploader/);
    assert.doesNotMatch(contractSource, /MobileMediaRuntimeState/);
    assert.doesNotMatch(productAppSource, /useMobileServerManagementFeature/);
  });
});
