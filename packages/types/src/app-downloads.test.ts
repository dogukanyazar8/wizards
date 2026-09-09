import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as appDownloads from "./app-downloads";
import {
  AppDownloadsResponseSchema,
  DOWNLOAD_ENVIRONMENT_CHANNEL,
  DOWNLOAD_PLATFORM_ORDER,
  DOWNLOAD_SECTION_MAX_ARTIFACTS,
  DownloadArtifactSchema,
  DownloadCatalogSchema,
  DownloadDeliverySchema,
  DownloadEnvironmentSchema,
  DownloadLocalizedLabelSchema,
  DownloadPlatformSchema,
  DownloadSectionSchema,
  isDesktopDownloadPlatform,
} from "./app-downloads";
import { AppDownloadsResponseSchema as IndexedResponseSchema } from "./index";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const label = {
  en: "Windows 10/11 · x64 and ARM64 · 96 MB",
  tr: "Windows 10/11 · x64 ve ARM64 · 96 MB",
};

const windowsArtifact = {
  buildLabel: "1187",
  delivery: "direct",
  extensionLabel: { en: ".exe", tr: ".exe" },
  metaLabel: label,
  platform: "windows",
  sha256: "a".repeat(64),
  sizeBytes: 96_000_000,
  url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
  versionLabel: "2.4.1",
};

const storeArtifact = {
  ...windowsArtifact,
  delivery: "store",
  extensionLabel: { en: "Play Store", tr: "Play Store" },
  platform: "android",
  sha256: null,
  sizeBytes: 62_000_000,
  url: "https://play.google.com/store/apps/details?id=app.whispr",
};

const desktopSection = {
  artifacts: [windowsArtifact],
  buildLabel: "1187",
  releasedAt: "2026-08-26T09:00:00.000Z",
  versionLabel: "2.4.1",
};

const mobileSection = {
  artifacts: [storeArtifact],
  buildLabel: "940",
  releasedAt: "2026-08-26T09:00:00.000Z",
  versionLabel: "2.4.1",
};

const prodCatalog = { desktop: desktopSection, environment: "prod", mobile: mobileSection };
const uatCatalog = { ...prodCatalog, environment: "uat" };
const response = {
  catalogs: { prod: prodCatalog, uat: uatCatalog },
  defaultEnvironment: "prod",
};

describe("app download catalog contract", () => {
  it("covers every exported schema with a valid and an invalid fixture", () => {
    assertSchemaBehaviorCoverage(appDownloads, {
      AppDownloadsResponseSchema: {
        schema: AppDownloadsResponseSchema,
        valid: response,
        invalid: { ...response, defaultEnvironment: "beta" },
      },
      DownloadArtifactSchema: {
        schema: DownloadArtifactSchema,
        valid: windowsArtifact,
        invalid: { ...windowsArtifact, url: "http://updates.whispr.team/Whispr.exe" },
      },
      DownloadCatalogSchema: {
        schema: DownloadCatalogSchema,
        valid: prodCatalog,
        invalid: { ...prodCatalog, extra: true },
      },
      DownloadDeliverySchema: {
        schema: DownloadDeliverySchema,
        valid: "testflight",
        invalid: "sideload",
      },
      DownloadEnvironmentSchema: {
        schema: DownloadEnvironmentSchema,
        valid: "uat",
        invalid: "canary",
      },
      DownloadLocalizedLabelSchema: {
        schema: DownloadLocalizedLabelSchema,
        valid: label,
        invalid: { tr: ".exe" },
      },
      DownloadPlatformSchema: {
        schema: DownloadPlatformSchema,
        valid: "macos",
        invalid: "web",
      },
      DownloadSectionSchema: {
        schema: DownloadSectionSchema,
        valid: desktopSection,
        invalid: { ...desktopSection, artifacts: {} },
      },
    });
  });

  it("re-exports the response schema from the package index", () => {
    assert.equal(IndexedResponseSchema, AppDownloadsResponseSchema);
  });

  it("rejects a link that is not HTTPS and one that is too long", () => {
    assertRejects(DownloadArtifactSchema, { ...windowsArtifact, url: "ftp://whispr.app/a.exe" }, [
      "url",
    ]);
    assertRejects(
      DownloadArtifactSchema,
      { ...windowsArtifact, url: `https://whispr.app/${"a".repeat(2_048)}` },
      ["url"],
    );
  });

  it("keeps nullable release fields nullable and forbids unknown keys", () => {
    const emptySection = assertAccepts(DownloadSectionSchema, {
      artifacts: [],
      buildLabel: null,
      releasedAt: null,
      versionLabel: null,
    });

    assert.deepEqual(emptySection.artifacts, []);
    assertRejects(DownloadArtifactSchema, { ...windowsArtifact, channel: "STABLE" });
  });

  it("caps a section at the number of desktop cards the design draws", () => {
    assert.equal(DOWNLOAD_SECTION_MAX_ARTIFACTS, 3);
    assertRejects(DownloadSectionSchema, {
      ...desktopSection,
      artifacts: [windowsArtifact, windowsArtifact, windowsArtifact, windowsArtifact],
    });
  });

  it("orders platforms the way the window stacks its cards", () => {
    assert.deepEqual([...DOWNLOAD_PLATFORM_ORDER], ["windows", "macos", "linux", "android", "ios"]);
    assert.equal(isDesktopDownloadPlatform("linux"), true);
    assert.equal(isDesktopDownloadPlatform("ios"), false);
  });

  it("maps each environment onto the release channel that feeds it", () => {
    assert.deepEqual(DOWNLOAD_ENVIRONMENT_CHANNEL, { prod: "STABLE", uat: "UAT" });
  });
});
