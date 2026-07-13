import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  MobileOfflineError,
  isMobileMutationMethod,
  toMobileNetworkStatus,
} from "../src/network/mobile-network-contract";

describe("mobile network contract", () => {
  it("normalizes NetInfo without retaining network details", () => {
    assert.equal(
      toMobileNetworkStatus({ isConnected: false, isInternetReachable: false }),
      "offline",
    );
    assert.equal(toMobileNetworkStatus({ isConnected: true, isInternetReachable: null }), "online");
    assert.equal(
      toMobileNetworkStatus({ isConnected: null, isInternetReachable: null }),
      "unknown",
    );
  });

  it("identifies non-GET requests and exposes a bounded offline error", () => {
    assert.equal(isMobileMutationMethod(undefined), false);
    assert.equal(isMobileMutationMethod("GET"), false);
    assert.equal(isMobileMutationMethod("POST"), true);
    const error = new MobileOfflineError();
    assert.equal(error.code, "mobile_offline");
    assert.doesNotMatch(error.message, /url|ssid|ip|token/i);
  });

  it("refreshes the OS snapshot on foreground without polling or adding a reachability URL", () => {
    const providerSource = readFileSync(
      resolve(__dirname, "../src/app/providers/mobile-network-provider.tsx"),
      "utf8",
    );

    assert.match(providerSource, /NetInfo\.refresh\(\)/);
    assert.match(providerSource, /AppState\.addEventListener\("change"/);
    assert.match(providerSource, /appStateSubscription\.remove\(\)/);
    assert.doesNotMatch(providerSource, /NetInfo\.fetch\(\)/);
    assert.doesNotMatch(providerSource, /setInterval|reachabilityUrl|NetInfo\.configure/);
  });
});
