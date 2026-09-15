import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectReportDiagnostics,
  formatReportDeviceLine,
  parseBrowserLabel,
  parseOperatingSystem,
  stripReleaseCodename,
  type ReportDiagnosticsSource,
} from "./report-diagnostics";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";

function source(overrides: Partial<ReportDiagnosticsSource> = {}): ReportDiagnosticsSource {
  return {
    isDesktop: false,
    locale: "tr",
    platformLabel: null,
    userAgent: CHROME_MAC,
    ...overrides,
  };
}

describe("report diagnostics", () => {
  it("names the browser, preferring the most specific match", () => {
    assert.equal(parseBrowserLabel(CHROME_MAC), "Chrome 128");
    // Edge and Opera announce themselves as Chrome too; the specific rule wins.
    assert.equal(parseBrowserLabel(EDGE_WINDOWS), "Edge 128");
    assert.equal(parseBrowserLabel(SAFARI_MAC), "Safari 17");
    assert.equal(parseBrowserLabel(FIREFOX_LINUX), "Firefox 129");
    assert.equal(parseBrowserLabel("curl/8.4.0"), null);
  });

  it("reads the operating system and turns the kernel number into a release", () => {
    assert.deepEqual(parseOperatingSystem(CHROME_MAC), { name: "macOS", version: "10.15.7" });
    assert.deepEqual(parseOperatingSystem(EDGE_WINDOWS), { name: "Windows", version: "10/11" });
    assert.deepEqual(parseOperatingSystem(FIREFOX_LINUX), { name: "Linux", version: null });
    assert.equal(parseOperatingSystem("curl/8.4.0"), null);
  });

  it("drops the release codename from the version", () => {
    assert.equal(stripReleaseCodename('2.4.1 "Echo"'), "2.4.1");
    assert.equal(stripReleaseCodename("2.4.1"), "2.4.1");
  });

  it("carries no user identity, only the allow-listed device fields", () => {
    const diagnostics = collectReportDiagnostics(source());

    assert.deepEqual(Object.keys(diagnostics.deviceInfo).sort(), [
      "deviceModel",
      "locale",
      "osName",
      "osVersion",
    ]);
    assert.equal(diagnostics.platform, "web");
  });

  it("reports the desktop shell and maps its release ring", () => {
    assert.equal(
      collectReportDiagnostics(source({ desktopReleaseRing: "uat", isDesktop: true }))
        .releaseChannel,
      "beta",
    );
    assert.equal(
      collectReportDiagnostics(source({ desktopReleaseRing: "stable", isDesktop: true }))
        .releaseChannel,
      "stable",
    );
    assert.equal(collectReportDiagnostics(source({ isDesktop: true })).platform, "desktop");
  });

  it("falls back to the platform label when the agent string says nothing", () => {
    const diagnostics = collectReportDiagnostics(
      source({ platformLabel: "Windows", userAgent: "curl/8.4.0" }),
    );

    assert.equal(diagnostics.deviceInfo.deviceModel, undefined);
    assert.equal(diagnostics.deviceInfo.osName, "Windows");
    assert.equal(diagnostics.deviceInfo.osVersion, undefined);
  });

  it("keeps the device line readable when a part is missing", () => {
    const known = formatReportDeviceLine(collectReportDiagnostics(source()), "bilinmiyor");
    assert.match(known, /^Chrome 128 · macOS 10\.15\.7 · .+ \(.+\) · (stable|beta|uat)$/);

    const unknown = formatReportDeviceLine(
      collectReportDiagnostics(source({ userAgent: "curl/8.4.0" })),
      "bilinmiyor",
    );
    assert.match(unknown, /^bilinmiyor · bilinmiyor · /);
  });
});
