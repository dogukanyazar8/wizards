import assert from "node:assert/strict";
import { describe, it } from "node:test";

import packageJson from "../package.json";
import {
  getMobileAppCodename,
  MOBILE_RELEASE_CODENAME,
  normalizeMobileAppVersion,
  resolveMobileAppReleaseChannel,
} from "../src/about/mobile-app-identity";

describe("mobile app release channel", () => {
  it("maps every build environment onto the two user-facing channels", () => {
    // The three names in MOBILE_ENVIRONMENTS, plus the wire values themselves so
    // a stored preference round-trips through the same resolver.
    assert.equal(resolveMobileAppReleaseChannel("production"), "stable");
    assert.equal(resolveMobileAppReleaseChannel("stable"), "stable");
    assert.equal(resolveMobileAppReleaseChannel("beta"), "beta");
    assert.equal(resolveMobileAppReleaseChannel("development"), "beta");
    assert.equal(resolveMobileAppReleaseChannel("uat"), "beta");
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
  it("labels the current release without relabeling older installed binaries", () => {
    // The shipped version is read, not restated: a release bump must not turn
    // this test red, while a codename leaking onto other binaries still must.
    const current = packageJson.version;
    const nextMajor = `${Number(current.split(".")[0]) + 1}.0.0`;

    assert.equal(getMobileAppCodename(current), MOBILE_RELEASE_CODENAME);
    assert.equal(getMobileAppCodename(`v${current}+9001`), MOBILE_RELEASE_CODENAME);
    assert.equal(getMobileAppCodename("0.8.15"), undefined);
    assert.equal(getMobileAppCodename(nextMajor), undefined);
  });

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
