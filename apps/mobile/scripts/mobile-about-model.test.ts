import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MobileAppUpdateResponse,
  MobileReleaseChange,
  MobileReleaseSummary,
} from "@wizards/types";

import { mobileCopy } from "../src/locale/mobile-copy";
import { formatMobileBytes } from "../src/locale/mobile-number-format";
import {
  buildDiagnosticsText,
  filterReleaseChanges,
  groupReleaseChangesByType,
  groupReleasesByYear,
  inferBugReportCategoryFromHelpQuery,
  isMobileReleaseNewer,
  resolveAboutUpdatePresentation,
} from "../src/about/mobile-about-model";

const copy = mobileCopy.tr;
const formatSize = (bytes: number) => formatMobileBytes(bytes, "tr");

function updateResponse(overrides: Partial<MobileAppUpdateResponse> = {}): MobileAppUpdateResponse {
  return {
    lastCheckedAt: "2026-07-29T09:00:00.000Z",
    otaEnabled: true,
    state: "current",
    updateKind: "none",
    ...overrides,
  };
}

function change(type: MobileReleaseChange["type"], title: string): MobileReleaseChange {
  return { title, type };
}

function release(version: string, releasedAt: string): MobileReleaseSummary {
  return { changeCount: 1, releasedAt, version };
}

describe("about update presentation", () => {
  it("renders the current row with the last check and the check action", () => {
    const presentation = resolveAboutUpdatePresentation(updateResponse(), copy, {
      formatSize,
      lastCheckedLabel: "2 dk",
      online: true,
    });

    assert.equal(presentation.state, "current");
    assert.equal(presentation.tone, "success");
    assert.equal(presentation.title, "Güncel sürümü kullanıyorsun");
    assert.equal(presentation.subtitle, "2 dk önce denetlendi · otomatik");
    assert.equal(presentation.action, "Denetle");
    assert.equal(presentation.actionKind, "check");
  });

  it("renders the available row with the version, codename and size", () => {
    const presentation = resolveAboutUpdatePresentation(
      updateResponse({
        latest: {
          codename: "Halo",
          mandatory: false,
          releasedAt: "2026-07-28T00:00:00.000Z",
          sizeBytes: 50_541_363,
          version: "0.9.0",
        },
        state: "available",
      }),
      copy,
      { formatSize, online: true },
    );

    assert.equal(presentation.state, "available");
    assert.equal(presentation.tone, "accent");
    assert.equal(presentation.title, "0.9.0 “Halo” hazır · 48,2 MB");
    assert.equal(presentation.subtitle, "Wi-Fi bağlıyken indirilecek");
    assert.equal(presentation.action, "Güncelle");
  });

  it("renders the checking row with the stop action", () => {
    const presentation = resolveAboutUpdatePresentation(
      updateResponse({ state: "checking" }),
      copy,
      { formatSize, online: true },
    );

    assert.equal(presentation.state, "checking");
    assert.equal(presentation.tone, "neutral");
    assert.equal(presentation.title, "Güncellemeler denetleniyor…");
    assert.equal(presentation.subtitle, "Sunucuya bağlanıldı");
    assert.equal(presentation.action, "Durdur");
  });

  it("renders §9.5's offline row instead of checking when the network is gone", () => {
    const presentation = resolveAboutUpdatePresentation(
      updateResponse({ state: "checking" }),
      copy,
      { formatSize, lastCheckedLabel: "2 dk", online: false },
    );

    assert.equal(presentation.state, "offline");
    assert.equal(presentation.title, "Bağlantı yok");
    assert.equal(presentation.subtitle, "Denetlenemedi");
    // Offline is not a dead end: the row still offers the retry.
    assert.equal(presentation.actionKind, "check");
  });

  it("says why a build cannot update itself instead of promising an automatic check", () => {
    const presentation = resolveAboutUpdatePresentation(
      updateResponse({ otaEnabled: false }),
      copy,
      { formatSize, lastCheckedLabel: "2 dk", online: true },
    );

    assert.equal(presentation.state, "current");
    assert.equal(presentation.subtitle, "Bu yapıda otomatik güncelleme kapalı");
  });

  it("keeps the download and failure states on the available row", () => {
    const latest = {
      mandatory: false,
      releasedAt: "2026-07-28T00:00:00.000Z",
      version: "0.9.0",
    } as const;

    for (const state of ["downloading", "ready", "failed"] as const) {
      const presentation = resolveAboutUpdatePresentation(updateResponse({ latest, state }), copy, {
        formatSize,
        online: true,
      });

      assert.equal(presentation.state, "available", `state ${state}`);
    }

    // Without a `latest` there is nothing to offer, so it falls back to current.
    assert.equal(
      resolveAboutUpdatePresentation(updateResponse({ state: "available" }), copy, {
        formatSize,
        lastCheckedLabel: "2 dk",
        online: true,
      }).state,
      "current",
    );
  });

  it("drops the trailing separator when the server sent no size", () => {
    const presentation = resolveAboutUpdatePresentation(
      updateResponse({
        latest: {
          codename: "Halo",
          mandatory: false,
          releasedAt: "2026-07-28T00:00:00.000Z",
          version: "0.9.0",
        },
        state: "available",
      }),
      copy,
      { formatSize, online: true },
    );

    assert.equal(presentation.title, "0.9.0 “Halo” hazır");
  });
});

describe("release grouping", () => {
  it("compares release versions numerically for the new badge", () => {
    assert.equal(isMobileReleaseNewer("0.8.15", null), true);
    assert.equal(isMobileReleaseNewer("0.8.15", "0.8.15"), false);
    assert.equal(isMobileReleaseNewer("0.10.0", "0.9.9"), true);
    assert.equal(isMobileReleaseNewer("0.8.9", "0.8.15"), false);
  });

  it("orders the three type groups and never emits an empty one", () => {
    const groups = groupReleaseChangesByType([
      change("fixed", "Thread bildirimleri"),
      change("new", "Mesaj yazı boyutu"),
      change("new", "Canlı dalga formu"),
    ]);

    assert.deepEqual(
      groups.map((group) => [group.type, group.changes.length]),
      [
        ["new", 2],
        ["fixed", 1],
      ],
    );
    assert.deepEqual(groupReleaseChangesByType([]), []);
  });

  it("groups releases by year, newest year and newest release first", () => {
    const groups = groupReleasesByYear([
      release("0.7.9", "2025-12-18T00:00:00.000Z"),
      release("0.8.12", "2026-06-12T00:00:00.000Z"),
      release("0.8.15", "2026-07-24T00:00:00.000Z"),
    ]);

    assert.deepEqual(
      groups.map((group) => [group.year, group.releases.map((entry) => entry.version)]),
      [
        ["2026", ["0.8.15", "0.8.12"]],
        ["2025", ["0.7.9"]],
      ],
    );
  });

  it("keeps a release whose date cannot be parsed rather than dropping it", () => {
    const groups = groupReleasesByYear([
      release("0.8.15", "2026-07-24T00:00:00.000Z"),
      release("0.0.1", "not-a-date"),
    ]);

    assert.equal(
      groups.flatMap((group) => group.releases).length,
      2,
      "a version missing from history reads as data loss",
    );
  });

  it("flags an empty filter result instead of hiding the chip", () => {
    const changes = [change("new", "Mesaj yazı boyutu"), change("improved", "Kanal listesi")];

    assert.deepEqual(filterReleaseChanges(changes, "all"), { changes, isEmpty: false });
    assert.deepEqual(filterReleaseChanges(changes, "fixed"), { changes: [], isEmpty: true });
    assert.equal(filterReleaseChanges(changes, "new").changes.length, 1);
  });
});

describe("diagnostics clipboard text", () => {
  const diagnostics = buildDiagnosticsText({
    appVersion: "0.8.15",
    buildNumber: 8150,
    channel: "uat",
    deviceModel: "iPhone 15",
    locale: "tr",
    osName: "iOS",
    osVersion: "18.2",
    userId: "usr_0123456789abcdef",
  });

  it("carries §4.1's fields and shortens the account id", () => {
    assert.equal(
      diagnostics,
      [
        "Whispr: 0.8.15",
        "Build: 8150",
        "Channel: uat",
        "Device: iPhone 15",
        "OS: iOS 18.2",
        "Locale: tr",
        "User: usr_0123",
      ].join("\n"),
    );
    assert.equal(diagnostics.includes("usr_0123456789abcdef"), false);
  });

  it("never lets a token or an e-mail address reach the clipboard", () => {
    const leaked = buildDiagnosticsText({
      appVersion: "0.8.15",
      channel: "uat",
      deviceModel: "dogukanyazar@gmail.com",
      locale: "tr",
      osName: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      userId: null,
    });

    assert.equal(leaked.includes("@"), false);
    assert.equal(leaked.includes("eyJhbGciOi"), false);
    assert.equal(leaked.includes("User:"), false);
    assert.match(leaked, /Whispr: 0\.8\.15/);
  });

  it("omits fields the device could not report rather than printing blanks", () => {
    const partial = buildDiagnosticsText({
      appVersion: "0.8.15",
      buildNumber: null,
      channel: "production",
      deviceModel: null,
      locale: "en",
      osName: null,
      osVersion: null,
    });

    assert.equal(partial, ["Whispr: 0.8.15", "Channel: production", "Locale: en"].join("\n"));
  });
});

describe("help search bug-report category", () => {
  it("maps the documented Turkish help keywords and defaults unknown queries to other", () => {
    const cases = [
      ["mikrofon çalışmıyor", "voice"],
      ["ses kesiliyor", "voice"],
      ["arama bağlanmıyor", "voice"],
      ["bildirim gelmiyor", "notification"],
      ["uygulama çok yavaş", "performance"],
      ["ekran donma yapıyor", "performance"],
      ["mesaj gönderemiyorum", "chat"],
      ["sohbet açılmıyor", "chat"],
      ["kanal kayboldu", "chat"],
      ["hesabımı değiştirmek istiyorum", "other"],
    ] as const;

    for (const [query, expected] of cases) {
      assert.equal(inferBugReportCategoryFromHelpQuery(query), expected, query);
    }
  });

  it("matches keywords case-insensitively and ignores surrounding whitespace", () => {
    assert.equal(inferBugReportCategoryFromHelpQuery("  MİKROFON  "), "voice");
    assert.equal(inferBugReportCategoryFromHelpQuery("BİLDİRİM"), "notification");
  });
});
