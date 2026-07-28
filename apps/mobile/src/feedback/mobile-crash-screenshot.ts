import { getExpoFileSystemModule } from "../media/expo-mobile-media-modules";
import { prepareMobileImageAsset } from "../media/mobile-image-picker";
import {
  toMobilePickedImageBatch,
  type MobilePickedImage,
} from "../media/mobile-image-upload-contract";

interface ViewShotModule {
  captureScreen(options: {
    format: "jpg" | "png";
    quality: number;
    result: "tmpfile";
  }): Promise<string>;
}

/**
 * `react-native-view-shot` is a native module, so a JS bundle can outlive a
 * binary that does not carry it — a debug client from before the dependency
 * landed, for example. A missing screenshot is a degraded report, not a second
 * crash on the crash screen, so the require is allowed to fail.
 */
function getViewShotModule(): ViewShotModule | null {
  try {
    return require("react-native-view-shot") as ViewShotModule;
  } catch {
    return null;
  }
}

function measureLocalFileSize(uri: string): number | null {
  try {
    const { File } = getExpoFileSystemModule();
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/**
 * Captures what the user is looking at, ready to upload.
 *
 * Taken when the report is *asked for* rather than when the error was caught:
 * by the time a boundary's `componentDidCatch` runs, React has already committed
 * the fallback, so a capture there races the mount and returns whichever tree
 * won. Capturing on the tap is the one moment whose contents are known.
 *
 * Every failure path answers `null`. This runs on a screen that exists because
 * something already threw.
 */
export async function captureMobileCrashScreenshot(): Promise<MobilePickedImage | null> {
  const viewShot = getViewShotModule();

  if (!viewShot) {
    return null;
  }

  try {
    const uri = await viewShot.captureScreen({ format: "jpg", quality: 0.7, result: "tmpfile" });
    // The same optimisation pass the picker runs, so an oversized capture on a
    // tall device is shrunk under the upload limit instead of being refused.
    const asset = await prepareMobileImageAsset({ mimeType: "image/jpeg", uri });
    const batch = toMobilePickedImageBatch([asset], measureLocalFileSize);

    return batch.picked[0] ?? null;
  } catch {
    return null;
  }
}
