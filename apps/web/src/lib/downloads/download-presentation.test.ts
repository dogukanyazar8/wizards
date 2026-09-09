import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DownloadArtifact, DownloadSection } from "@wizards/types";

import {
  catalogVersionPill,
  downloadActionIcon,
  downloadActionLabelKey,
  downloadEnvironmentTone,
  downloadExtensionTone,
  downloadPlatformTone,
  formatReleaseDate,
  formatVersionPill,
  opensInNewTab,
  safeDownloadUrl,
  visibleDownloadArtifacts,
} from "./download-presentation";

function artifact(overrides: Partial<DownloadArtifact> = {}): DownloadArtifact {
  return {
    buildLabel: "1187",
    delivery: "direct",
    extensionLabel: { en: ".exe", tr: ".exe" },
    metaLabel: { en: "Windows 10/11", tr: "Windows 10/11" },
    platform: "windows",
    sha256: null,
    sizeBytes: 96_000_000,
    url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
    versionLabel: "2.4.1",
    ...overrides,
  };
}

function section(overrides: Partial<DownloadSection> = {}): DownloadSection {
  return {
    artifacts: [artifact()],
    buildLabel: "1187",
    releasedAt: "2026-08-26T09:00:00.000Z",
    versionLabel: "2.4.1",
    ...overrides,
  };
}

describe("download presentation", () => {
  it("gives every platform the tile tone the design draws", () => {
    assert.equal(downloadPlatformTone("windows"), "primary");
    assert.equal(downloadPlatformTone("macos"), "info");
    assert.equal(downloadPlatformTone("linux"), "warning");
    assert.equal(downloadPlatformTone("android"), "success");
    assert.equal(downloadPlatformTone("ios"), "info");
  });

  it("takes the button tone from the environment, not the platform", () => {
    assert.equal(downloadEnvironmentTone("prod"), "success");
    assert.equal(downloadEnvironmentTone("uat"), "warning");
  });

  it("names each button from its delivery and platform", () => {
    assert.equal(downloadActionLabelKey(artifact()), "download.action.download");
    assert.equal(
      downloadActionLabelKey(artifact({ delivery: "store", platform: "android" })),
      "download.action.store.android",
    );
    assert.equal(
      downloadActionLabelKey(artifact({ delivery: "store", platform: "ios" })),
      "download.action.store.ios",
    );
    assert.equal(
      downloadActionLabelKey(artifact({ delivery: "testflight", platform: "ios" })),
      "download.action.testflight",
    );
    assert.equal(
      downloadActionLabelKey(artifact({ delivery: "direct", platform: "android" })),
      "download.action.apk",
    );
  });

  it("uses the external-link arrow only for store links", () => {
    assert.equal(
      downloadActionIcon(artifact({ delivery: "store", platform: "android" })),
      "external",
    );
    assert.equal(downloadActionIcon(artifact()), "download");
    assert.equal(
      downloadActionIcon(artifact({ delivery: "testflight", platform: "ios" })),
      "download",
    );

    assert.equal(opensInNewTab(artifact({ delivery: "store", platform: "ios" })), true);
    assert.equal(opensInNewTab(artifact()), false);
  });

  it("marks a UAT mobile package but leaves store and desktop pills neutral", () => {
    assert.equal(downloadExtensionTone(artifact({ platform: "android" }), "uat"), "warning");
    assert.equal(downloadExtensionTone(artifact({ platform: "ios" }), "uat"), "warning");
    assert.equal(downloadExtensionTone(artifact({ platform: "android" }), "prod"), null);
    assert.equal(downloadExtensionTone(artifact(), "uat"), null);
  });

  it("builds the version pill and falls back when a section is empty", () => {
    assert.equal(formatVersionPill(section()), "2.4.1 (1187)");
    assert.equal(formatVersionPill(section({ buildLabel: null })), "2.4.1");
    assert.equal(
      formatVersionPill(section({ artifacts: [], buildLabel: null, versionLabel: null })),
      null,
    );

    const emptyDesktop = section({ artifacts: [], buildLabel: null, versionLabel: null });
    assert.equal(
      catalogVersionPill({ desktop: emptyDesktop, environment: "prod", mobile: section() }),
      "2.4.1 (1187)",
    );
    assert.equal(
      catalogVersionPill({ desktop: emptyDesktop, environment: "prod", mobile: emptyDesktop }),
      null,
    );
  });

  it("formats the release date per locale and survives a bad value", () => {
    assert.equal(formatReleaseDate("2026-08-26T09:00:00.000Z", "tr"), "26 Ağustos 2026");
    assert.equal(formatReleaseDate("2026-08-26T09:00:00.000Z", "en"), "26 August 2026");
    assert.equal(formatReleaseDate(null, "tr"), null);
    assert.equal(formatReleaseDate("not-a-date", "tr"), null);
  });

  it("refuses to render a link that is not HTTPS", () => {
    assert.equal(safeDownloadUrl("https://whispr.app/a.exe"), "https://whispr.app/a.exe");
    assert.equal(safeDownloadUrl("http://whispr.app/a.exe"), null);
    assert.equal(safeDownloadUrl("javascript:alert(1)"), null);
    assert.equal(safeDownloadUrl("not a url"), null);

    const mixed = section({
      artifacts: [artifact(), artifact({ platform: "macos", url: "http://whispr.app/a.dmg" })],
    });
    const visible = visibleDownloadArtifacts(mixed);

    assert.equal(visible.length, 1);
    assert.equal(visible[0]?.platform, "windows");
  });
});
