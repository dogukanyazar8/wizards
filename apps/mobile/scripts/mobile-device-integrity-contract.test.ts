import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessMobileDeviceIntegrity,
  type MobileDeviceIntegrityDetector,
} from "../src/security/mobile-device-integrity";

function createDetector(input: {
  isPhysicalDevice: boolean;
  rootedResult?: boolean;
  rootedError?: Error;
}) {
  let rootCheckCount = 0;

  const detector: MobileDeviceIntegrityDetector = {
    isPhysicalDevice() {
      return input.isPhysicalDevice;
    },
    async isRootedOrJailbroken() {
      rootCheckCount += 1;
      if (input.rootedError) {
        throw input.rootedError;
      }

      return input.rootedResult ?? false;
    },
  };

  return {
    detector,
    getRootCheckCount: () => rootCheckCount,
  };
}

describe("mobile device integrity contract", () => {
  it("skips root and jailbreak detection entirely on emulators and simulators", async () => {
    const fixture = createDetector({
      isPhysicalDevice: false,
      rootedResult: true,
    });

    assert.deepEqual(await assessMobileDeviceIntegrity(fixture.detector), {
      status: "emulator",
    });
    assert.equal(fixture.getRootCheckCount(), 0);
  });

  it("reports advisory compromised and clean results without making an access decision", async () => {
    const compromised = createDetector({
      isPhysicalDevice: true,
      rootedResult: true,
    });
    const clean = createDetector({
      isPhysicalDevice: true,
      rootedResult: false,
    });

    assert.deepEqual(await assessMobileDeviceIntegrity(compromised.detector), {
      status: "compromised",
    });
    assert.deepEqual(await assessMobileDeviceIntegrity(clean.detector), {
      status: "clean",
    });
  });

  it("fails open when the native detector cannot produce a result", async () => {
    const fixture = createDetector({
      isPhysicalDevice: true,
      rootedError: new Error("native detector unavailable"),
    });

    assert.deepEqual(await assessMobileDeviceIntegrity(fixture.detector), {
      status: "unavailable",
    });
  });
});
