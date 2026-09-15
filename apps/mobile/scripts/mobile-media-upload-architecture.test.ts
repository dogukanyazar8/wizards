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
    // Every native media module is required lazily through the same accessor,
    // so a screen that never uploads never loads them.
    assert.match(moduleSource, /require\("expo-image-manipulator"\)/);
    assert.doesNotMatch(pickerSource, /from "expo-image-manipulator"/);
    assert.equal(packageJson.dependencies?.["expo-image-manipulator"], "~57.0.17");
    // Images are shrunk before they are uploaded, in the format the plan chose,
    // and an image that is already small is left byte-for-byte alone.
    assert.match(pickerSource, /optimizeMobileImageForUpload\(/);
    assert.match(pickerSource, /format:\s*SaveFormat\[ENCODE_FORMAT_KEYS\[input\.format\]\]/);
    // Chat photos take the same trip rather than sending camera originals.
    assert.match(readSource("mobile-message-attachment-picker.ts"), /prepareMobileImageAsset\(/);
    assert.doesNotMatch(pickerSource, /fetch\(asset\.uri\)/);
    assert.doesNotMatch(contractSource, /fetch\(asset\.uri\)/);
    assert.match(contractSource, /uri:\s*asset\.uri/);
    // The declared size is what UploadThing presigns against, so `?? 0` produced
    // an upload the service never completed and a request that never answered.
    // A real byte count is resolved instead, and what cannot be measured is refused.
    assert.doesNotMatch(contractSource, /size:\s*asset\.fileSize\s*\?\?\s*0/);
    assert.match(contractSource, /resolveMobilePickedImageSize\(\s*asset\.fileSize/);
    assert.match(contractSource, /size:\s*sizeBytes/);
    assert.match(pickerSource, /require\("expo-file-system"\)|getExpoFileSystemModule\(\)/);
    // One gallery visit can fill every free slot; the limit is enforced by the
    // picker itself rather than by discarding images the user already chose.
    assert.match(pickerSource, /allowsMultipleSelection:\s*limit\s*>\s*1/);
    assert.match(pickerSource, /selectionLimit:\s*limit/);
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
