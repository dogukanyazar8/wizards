import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { ensureMainApplicationPackage } = require("../plugins/withWhisprApkIntegrity");

const mainApplication = `package team.whispr.mobile

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactPackage

class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }
}`;

describe("Whispr APK integrity config plugin", () => {
  it("registers the native hash package once in Expo's generated application", () => {
    const registered = ensureMainApplicationPackage(mainApplication, "team.whispr.mobile");

    assert.match(registered, /import team\.whispr\.mobile\.integrity\.WhisprApkIntegrityPackage/);
    assert.match(registered, /add\(WhisprApkIntegrityPackage\(\)\)/);
    assert.equal(ensureMainApplicationPackage(registered, "team.whispr.mobile"), registered);
  });
});
