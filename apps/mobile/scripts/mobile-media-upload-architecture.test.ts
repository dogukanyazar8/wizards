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
  it("uses the custom Expo picker with the React Native-safe UploadThing transport", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const pickerSource = readSource("mobile-image-picker.ts");
    const runtimeSource = readSource("mobile-media-runtime.ts");
    const moduleSource = readSource("expo-mobile-media-modules.ts");
    const transportSource = readSource("mobile-uploadthing-client.ts");
    const contractSource = readSource("mobile-image-upload-contract.ts");
    const productAppSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-product-app.tsx"),
      "utf8",
    );

    assert.match(pickerSource, /getExpoImagePickerModule\(\)/);
    assert.doesNotMatch(pickerSource, /from "expo-image-picker"/);
    assert.doesNotMatch(pickerSource, /await import\("expo-image-picker"\)/);
    assert.doesNotMatch(runtimeSource, /await import\("expo-(?:document|image)-picker"\)/);
    assert.match(moduleSource, /require\("expo-image-picker"\)/);
    assert.match(moduleSource, /require\("expo-document-picker"\)/);
    assert.doesNotMatch(pickerSource, /fetch\(asset\.uri\)/);
    assert.match(pickerSource, /uri:\s*asset\.uri/);
    assert.match(pickerSource, /size:\s*asset\.fileSize\s*\?\?\s*0/);
    assert.match(transportSource, /generateReactHelpers.*from "@uploadthing\/react\/native"/s);
    assert.doesNotMatch(transportSource, /generateReactNativeHelpers/);
    assert.equal(packageJson.dependencies?.["@uploadthing/react"], "7.3.3");
    assert.equal(packageJson.dependencies?.["@uploadthing/expo"], undefined);
    assert.match(transportSource, /function createUploadThingHelpers/);
    assert.match(
      transportSource,
      /uploadMobileImageToUploadThing[\s\S]*createUploadThingHelpers\(\)/,
    );
    assert.doesNotMatch(transportSource, /const helpers = generateReactHelpers/);
    assert.match(transportSource, /\.uploadFiles/);
    assert.doesNotMatch(transportSource, /useImageUploader/);
    assert.doesNotMatch(contractSource, /MobileMediaRuntimeState/);
    assert.doesNotMatch(productAppSource, /useMobileServerManagementFeature/);
  });
});
