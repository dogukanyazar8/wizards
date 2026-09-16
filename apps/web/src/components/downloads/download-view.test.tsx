import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DownloadArtifact, DownloadEnvironment, DownloadSection } from "@wizards/types";

import { DownloadSectionCard } from "./download-section-card";
import {
  AdminDownloads,
  getDownloadPublishLabel,
} from "@/components/admin/sections/admin-downloads";
import type { AdminDownloadArtifact } from "@/lib/downloads/admin-download-service";

/** Sözlük yerine anahtarı döndürür: hangi anahtarın çizildiğini görmek istiyoruz. */
const translate = (key: string) => key;

function artifact(overrides: Partial<DownloadArtifact> = {}): DownloadArtifact {
  return {
    buildLabel: "1187",
    delivery: "direct",
    extensionLabel: { en: ".exe", tr: ".exe" },
    metaLabel: { en: "Windows 10/11 · x64 and ARM64", tr: "Windows 10/11 · x64 ve ARM64" },
    platform: "windows",
    sha256: null,
    sizeBytes: 96_000_000,
    url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
    versionLabel: "2.4.1",
    ...overrides,
  };
}

function renderSection(section: DownloadSection, environment: DownloadEnvironment = "prod") {
  return renderToStaticMarkup(
    <DownloadSectionCard
      emptyLabel="download.empty"
      environment={environment}
      label="MASAÜSTÜ"
      locale="tr"
      marginTop={19}
      note="26 Ağustos 2026"
      section={section}
      testId="download-desktop"
      translate={translate}
      versionPill="2.4.1"
    />,
  );
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

describe("download section card", () => {
  it("draws the tile, the extension pill, the meta line and the action", () => {
    const markup = renderSection(section());

    assert.match(markup, /download-row-windows/);
    assert.match(markup, /download\.platform\.windows/);
    assert.match(markup, /Windows 10\/11 · x64 ve ARM64/);
    assert.match(markup, /download\.action\.download/);
    assert.match(markup, /26 Ağustos 2026/);
  });

  it("opens a store link in a new tab and keeps a direct download in place", () => {
    const store = renderSection(
      section({
        artifacts: [
          artifact({
            delivery: "store",
            extensionLabel: { en: "Play Store", tr: "Play Store" },
            platform: "android",
            url: "https://play.google.com/store/apps/details?id=app.whispr",
          }),
        ],
      }),
    );

    assert.match(store, /target="_blank"/);
    assert.match(store, /rel="noopener noreferrer"/);
    assert.match(store, /download\.action\.store\.android/);
    assert.equal(renderSection(section()).includes('target="_blank"'), false);
  });

  it("never renders a link that is not HTTPS", () => {
    const markup = renderSection(
      section({ artifacts: [artifact({ url: "http://whispr.app/a.exe" })] }),
    );

    assert.equal(markup.includes("http://whispr.app/a.exe"), false);
    assert.match(markup, /download\.empty/);
  });

  it("marks a UAT mobile package pill in the warning tone", () => {
    const markup = renderSection(
      section({
        artifacts: [
          artifact({
            extensionLabel: { en: "APK · internal", tr: "APK · dahili test" },
            platform: "android",
          }),
        ],
      }),
      "uat",
    );

    assert.match(markup, /APK · dahili test/);
    assert.match(markup, /hsl\(var\(--warning\) \/ 0\.14\)/);
  });

  it("says the environment is empty rather than drawing a fake card", () => {
    const markup = renderSection(section({ artifacts: [], buildLabel: null, versionLabel: null }));

    assert.match(markup, /download\.empty/);
    assert.equal(markup.includes("download-row-"), false);
  });
});

describe("admin download console", () => {
  const adminArtifact: AdminDownloadArtifact = {
    buildLabel: "1187",
    channel: "STABLE",
    createdAt: "2026-08-26T09:00:00.000Z",
    delivery: "DIRECT",
    extensionLabelEn: ".exe",
    extensionLabelTr: ".exe",
    id: "artifact-1",
    metaLabelEn: "Windows 10/11",
    metaLabelTr: "Windows 10/11",
    platform: "WINDOWS",
    publishedAt: null,
    releasedAt: "2026-08-26T09:00:00.000Z",
    sha256: null,
    sizeBytes: 96_000_000,
    updatedAt: "2026-08-26T09:00:00.000Z",
    url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
    versionLabel: "2.4.1",
  };

  it("shows a draft row as a draft and offers to publish it", () => {
    const markup = renderToStaticMarkup(<AdminDownloads artifacts={[adminArtifact]} canWrite />);

    assert.match(markup, /Taslak/);
    assert.match(markup, /Yayınla/);
    assert.match(markup, /2\.4\.1 \(1187\)/);
    assert.match(markup, /Paket Ekle/);
    assert.match(markup, /Düzenle/);
    assert.equal(getDownloadPublishLabel(adminArtifact), "Yayınla");
    assert.equal(
      getDownloadPublishLabel({ ...adminArtifact, publishedAt: "2026-08-26T09:00:00.000Z" }),
      "Yayından kaldır",
    );
  });

  it("explains an empty catalog instead of leaving a blank table", () => {
    const markup = renderToStaticMarkup(<AdminDownloads artifacts={[]} canWrite />);

    assert.match(markup, /Henüz paket eklenmedi/);
  });

  it("hides all mutation controls from read-only admins", () => {
    const markup = renderToStaticMarkup(
      <AdminDownloads artifacts={[adminArtifact]} canWrite={false} />,
    );
    assert.match(markup, /2\.4\.1/);
    for (const action of ["Paket Ekle", "Düzenle", "Yayınla", "Yayından kaldır"]) {
      assert.equal(markup.includes(action), false, action);
    }
  });
});
