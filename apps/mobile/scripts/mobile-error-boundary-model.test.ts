import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileApiError } from "../src/api/mobile-api-client";
import { MobileOfflineError } from "../src/network/mobile-network-contract";
import {
  classifyMobileBoundaryFault,
  createMobileBoundaryFaultReference,
} from "../src/app/mobile-error-boundary-model";

describe("mobile boundary fault classification", () => {
  it("reads a failed API request as a network fault", () => {
    assert.equal(
      classifyMobileBoundaryFault(
        new MobileApiError("Request timed out", { code: "timeout", status: 0 }),
      ),
      "network",
    );
  });

  it("reads the offline guard as a network fault", () => {
    assert.equal(classifyMobileBoundaryFault(new MobileOfflineError()), "network");
  });

  it("reads a React Native fetch failure as a network fault", () => {
    assert.equal(classifyMobileBoundaryFault(new TypeError("Network request failed")), "network");
  });

  it("reads a Metro module failure as a bundle fault", () => {
    assert.equal(
      classifyMobileBoundaryFault(new Error('Requiring unknown module "4821"')),
      "bundle",
    );
  });

  it("reads a secure-storage failure as a storage fault", () => {
    assert.equal(
      classifyMobileBoundaryFault(new Error("SecureStore: could not read value for key")),
      "storage",
    );
  });

  it("falls back to a render fault for an ordinary programming error", () => {
    assert.equal(
      classifyMobileBoundaryFault(new TypeError("Cannot read property 'id' of undefined")),
      "render",
    );
  });

  it("falls back to a render fault for a thrown non-error value", () => {
    assert.equal(classifyMobileBoundaryFault("boom"), "render");
  });
});

describe("mobile boundary fault reference", () => {
  it("is stable for the same fault and clock", () => {
    const error = new TypeError("Cannot read property 'id' of undefined");

    assert.equal(
      createMobileBoundaryFaultReference(error, 1_770_000_000_000),
      createMobileBoundaryFaultReference(error, 1_770_000_000_000),
    );
  });

  it("separates fault kinds so support can route without asking", () => {
    assert.notEqual(
      createMobileBoundaryFaultReference(new MobileOfflineError(), 1_770_000_000_000),
      createMobileBoundaryFaultReference(new TypeError("bad render"), 1_770_000_000_000),
    );
  });

  it("stays a short shoulder-safe code and never quotes the error text", () => {
    const reference = createMobileBoundaryFaultReference(
      new Error("token eyJhbGciOiJIUzI1NiJ9.body.signature leaked into the message"),
      1_770_000_000_000,
    );

    assert.match(reference, /^WB-[A-Z]-[0-9A-Z]{4,10}$/);
    assert.ok(!reference.includes("eyJ"));
    assert.ok(reference.length <= 16);
  });
});
