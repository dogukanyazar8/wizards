import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeMobileAppVersion,
  resolveMobileAppReleaseChannel,
} from "../src/about/mobile-app-identity";

describe("mobile app release channel", () => {
  it("maps every build environment onto the three user-facing channels", () => {
    // The four names in MOBILE_ENVIRONMENTS, plus the wire values themselves so
    // a stored preference round-trips through the same resolver.
    assert.equal(resolveMobileAppReleaseChannel("production"), "stable");
    assert.equal(resolveMobileAppReleaseChannel("stable"), "stable");
    assert.equal(resolveMobileAppReleaseChannel("canary"), "beta");
    assert.equal(resolveMobileAppReleaseChannel("beta"), "beta");
    assert.equal(resolveMobileAppReleaseChannel("development"), "uat");
    assert.equal(resolveMobileAppReleaseChannel("uat"), "uat");
  });

  it("falls back to stable rather than inventing a channel", () => {
    // An unknown value must not read as a pre-release channel: over-reporting
    // beta would offer UAT builds to users who never opted in.
    assert.equal(resolveMobileAppReleaseChannel(""), "stable");
    assert.equal(resolveMobileAppReleaseChannel("Beta"), "stable");
    assert.equal(resolveMobileAppReleaseChannel("nightly"), "stable");
  });
});

describe("mobile app version", () => {
  it("prints one version string regardless of the tag or build suffix it arrives as", () => {
    assert.equal(normalizeMobileAppVersion("v0.8.15"), "0.8.15");
    assert.equal(normalizeMobileAppVersion(" 0.8.15 "), "0.8.15");
    assert.equal(normalizeMobileAppVersion("0.8.15-uat.3"), "0.8.15-uat.3");
    assert.equal(normalizeMobileAppVersion("0.8.15+8203"), "0.8.15");
  });

  it("returns an unparseable value untouched rather than blanking the badge", () => {
    assert.equal(normalizeMobileAppVersion("dev"), "dev");
  });
});
