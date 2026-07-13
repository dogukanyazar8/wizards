import assert from "node:assert/strict";
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
});
