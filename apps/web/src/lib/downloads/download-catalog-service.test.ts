import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAppDownloadCatalog,
  resolveDefaultDownloadEnvironment,
  type DownloadArtifactRow,
} from "./download-catalog-service";

function row(overrides: Partial<DownloadArtifactRow> = {}): DownloadArtifactRow {
  return {
    buildLabel: "1187",
    channel: "STABLE",
    delivery: "DIRECT",
    extensionLabelEn: ".exe",
    extensionLabelTr: ".exe",
    metaLabelEn: "Windows 10/11 · x64 and ARM64 · 96 MB",
    metaLabelTr: "Windows 10/11 · x64 ve ARM64 · 96 MB",
    platform: "WINDOWS",
    releasedAt: new Date("2026-08-26T09:00:00.000Z"),
    sha256: null,
    sizeBytes: BigInt(96_000_000),
    url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
    versionLabel: "2.4.1",
    ...overrides,
  };
}

function read(rows: DownloadArtifactRow[], channel = "production") {
  return getAppDownloadCatalog({
    findArtifacts: async () => rows,
    readReleaseChannel: () => channel,
  });
}

describe("app download catalog", () => {
  it("splits desktop and mobile cards and keeps the design's card order", async () => {
    const payload = await read([
      row({ platform: "IOS", delivery: "STORE", url: "https://apps.apple.com/app/whispr" }),
      row({ platform: "LINUX" }),
      row({ platform: "ANDROID", delivery: "STORE", url: "https://play.google.com/store/apps" }),
      row({ platform: "MACOS" }),
      row({ platform: "WINDOWS" }),
    ]);

    assert.deepEqual(
      payload.catalogs.prod.desktop.artifacts.map((artifact) => artifact.platform),
      ["windows", "macos", "linux"],
    );
    assert.deepEqual(
      payload.catalogs.prod.mobile.artifacts.map((artifact) => artifact.platform),
      ["android", "ios"],
    );
  });

  it("answers with both environments in one read", async () => {
    const payload = await read([
      row({ platform: "WINDOWS" }),
      row({ channel: "UAT", platform: "WINDOWS", versionLabel: "2.5.0-rc3", buildLabel: "1204" }),
    ]);

    assert.equal(payload.catalogs.prod.desktop.versionLabel, "2.4.1");
    assert.equal(payload.catalogs.uat.desktop.versionLabel, "2.5.0-rc3");
    assert.equal(payload.catalogs.uat.desktop.buildLabel, "1204");
    assert.equal(payload.catalogs.prod.environment, "prod");
    assert.equal(payload.catalogs.uat.environment, "uat");
  });

  it("takes the section heading from the newest published card", async () => {
    const payload = await read([
      row({ platform: "WINDOWS", releasedAt: new Date("2026-08-20T09:00:00.000Z") }),
      row({
        platform: "MACOS",
        buildLabel: "1190",
        releasedAt: new Date("2026-08-26T09:00:00.000Z"),
        versionLabel: "2.4.2",
      }),
    ]);

    assert.equal(payload.catalogs.prod.desktop.versionLabel, "2.4.2");
    assert.equal(payload.catalogs.prod.desktop.buildLabel, "1190");
    assert.equal(payload.catalogs.prod.desktop.releasedAt, "2026-08-26T09:00:00.000Z");
  });

  it("turns the BigInt column into a plain number and keeps a missing size null", async () => {
    const payload = await read([
      row({ platform: "WINDOWS" }),
      row({ platform: "MACOS", sizeBytes: null }),
    ]);

    const [windows, macos] = payload.catalogs.prod.desktop.artifacts;
    assert.equal(windows?.sizeBytes, 96_000_000);
    assert.equal(macos?.sizeBytes, null);
  });

  it("carries both label languages so an English viewer reads English meta", async () => {
    const payload = await read([row({ platform: "WINDOWS" })]);
    const [windows] = payload.catalogs.prod.desktop.artifacts;

    assert.equal(windows?.metaLabel.tr, "Windows 10/11 · x64 ve ARM64 · 96 MB");
    assert.equal(windows?.metaLabel.en, "Windows 10/11 · x64 and ARM64 · 96 MB");
    assert.deepEqual(windows?.extensionLabel, { en: ".exe", tr: ".exe" });
  });

  it("returns an empty environment rather than inventing cards", async () => {
    const payload = await read([row({ channel: "UAT", platform: "WINDOWS" })]);

    assert.deepEqual(payload.catalogs.prod.desktop.artifacts, []);
    assert.equal(payload.catalogs.prod.desktop.versionLabel, null);
    assert.equal(payload.catalogs.prod.desktop.releasedAt, null);
    assert.equal(payload.catalogs.uat.desktop.artifacts.length, 1);
  });

  it("opens on the environment the app itself runs in", async () => {
    assert.equal(resolveDefaultDownloadEnvironment("uat"), "uat");
    assert.equal(resolveDefaultDownloadEnvironment("UAT"), "uat");
    assert.equal(resolveDefaultDownloadEnvironment("production"), "prod");
    assert.equal(resolveDefaultDownloadEnvironment(undefined), "prod");

    const payload = await read([row({ platform: "WINDOWS" })], "uat");
    assert.equal(payload.defaultEnvironment, "uat");
  });

  it("refuses to serve a link that is not HTTPS", async () => {
    await assert.rejects(() =>
      read([row({ platform: "WINDOWS", url: "http://whispr.app/a.exe" })]),
    );
  });
});
