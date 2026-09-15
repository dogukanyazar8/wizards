import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDesktopDownloadManifestUrl,
  getSafeDesktopDownloadUrl,
  resolveDesktopDownloadUrlFromManifest,
} from "./desktop-download";

const stableManifestUrl = new URL("https://updates.whispr.team/desktop/stable/latest.json");

describe("desktop download routing", () => {
  it("defaults the public web download CTA to the safe app redirect endpoint", () => {
    assert.equal(getSafeDesktopDownloadUrl(undefined), "/api/v1/desktop/download");
    assert.equal(getSafeDesktopDownloadUrl(""), "/api/v1/desktop/download");
    assert.equal(
      getSafeDesktopDownloadUrl(
        "https://updates.whispr.team/desktop/stable/releases/v0.8.15/Whispr_0.8.15_x64-setup.exe",
      ),
      "https://updates.whispr.team/desktop/stable/releases/v0.8.15/Whispr_0.8.15_x64-setup.exe",
    );
    assert.equal(
      getSafeDesktopDownloadUrl("http://localhost:3000/download.exe"),
      "/api/v1/desktop/download",
    );
  });

  it("uses the stable updater manifest as the default desktop download source", () => {
    assert.equal(
      getDesktopDownloadManifestUrl(undefined).href,
      "https://updates.whispr.team/desktop/stable/latest.json",
    );
  });

  it("resolves the Windows installer from a signed stable manifest", () => {
    const downloadUrl = resolveDesktopDownloadUrlFromManifest(
      {
        version: "0.8.15",
        platforms: {
          "windows-x86_64": {
            signature: "trusted-updater-signature",
            url: "https://updates.whispr.team/desktop/stable/releases/v0.8.15/Whispr_0.8.15_x64-setup.exe",
          },
        },
      },
      stableManifestUrl,
    );

    assert.equal(
      downloadUrl.href,
      "https://updates.whispr.team/desktop/stable/releases/v0.8.15/Whispr_0.8.15_x64-setup.exe",
    );
  });

  it("rejects mutable ring-root installer URLs", () => {
    assert.throws(
      () =>
        resolveDesktopDownloadUrlFromManifest(
          {
            version: "0.8.15",
            platforms: {
              "windows-x86_64": {
                signature: "trusted-updater-signature",
                url: "https://updates.whispr.team/desktop/stable/Whispr_0.8.15_x64-setup.exe",
              },
            },
          },
          stableManifestUrl,
        ),
      /artifact URL does not match/,
    );
  });

  it("rejects unsafe manifest and artifact origins", () => {
    assert.throws(
      () => getDesktopDownloadManifestUrl("https://example.com/desktop/stable/latest.json"),
      /Whispr HTTPS latest\.json/,
    );

    assert.throws(
      () =>
        resolveDesktopDownloadUrlFromManifest(
          {
            version: "0.8.15",
            platforms: {
              "windows-x86_64": {
                signature: "trusted-updater-signature",
                url: "https://example.com/desktop/stable/releases/v0.8.15/Whispr_0.8.15_x64-setup.exe",
              },
            },
          },
          stableManifestUrl,
        ),
      /artifact URL must be a Whispr HTTPS URL/,
    );
  });
});
