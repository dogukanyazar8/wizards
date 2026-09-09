import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WorkspaceServerDetail } from "@wizards/types";

import {
  DEFAULT_SERVER_SETTINGS_SECTION,
  SERVER_SETTINGS_SECTIONS,
  applyServerVisibilityPatch,
  canListInDiscovery,
  diffServerSettings,
  resolveServerSettingsCounts,
  resolveServerVisibilityBadge,
  resolveVisibleSection,
  selectDeletedNoticeOptions,
  selectMessageLimitOptions,
  selectServerSettingsSections,
  stripAdminOwnedFields,
} from "./server-settings-model";

function detailFixture(): WorkspaceServerDetail {
  return {
    categories: [
      { channels: [channel("a"), channel("b")], id: "cat-1", name: "GENEL", position: 0 },
      { channels: [channel("c")], id: "cat-2", name: "GELİŞTİRME", position: 1 },
    ],
    invites: [{ id: "inv-1" }, { id: "inv-2" }],
    memberPage: { cursor: null, hasMore: false },
    members: [{ id: "m-1" }],
    roles: [{ id: "r-1" }, { id: "r-2" }, { id: "r-3" }],
    server: { memberCount: 5 },
    ungroupedChannels: [channel("d")],
  } as unknown as WorkspaceServerDetail;
}

function channel(id: string) {
  return { id, name: id, position: 0, type: "TEXT" };
}

describe("sunucu ayarları — bölüm listesi", () => {
  it("dokuz bölümü SPEC sırasında tutar", () => {
    assert.deepEqual(
      SERVER_SETTINGS_SECTIONS.map((section) => section.id),
      [
        "general",
        "visibility",
        "content",
        "channels",
        "roles",
        "members",
        "invites",
        "events",
        "danger",
      ],
    );
  });

  it("Tehlike bölgesini yalnız sahibe çizer (00 §5 — pasifleştirme değil)", () => {
    const owner = selectServerSettingsSections(true).map((section) => section.id);
    const admin = selectServerSettingsSections(false).map((section) => section.id);

    assert.ok(owner.includes("danger"));
    assert.equal(admin.includes("danger"), false);
    assert.equal(admin.length, owner.length - 1);
  });

  it("yalnız Tehlike bölgesi danger renginde", () => {
    assert.deepEqual(
      SERVER_SETTINGS_SECTIONS.filter((section) => section.danger).map((section) => section.id),
      ["danger"],
    );
  });

  it("sahip olmayan biri danger bölümünde kalamaz", () => {
    assert.equal(resolveVisibleSection("danger", false), DEFAULT_SERVER_SETTINGS_SECTION);
    assert.equal(resolveVisibleSection("danger", true), "danger");
    assert.equal(resolveVisibleSection("roles", false), "roles");
  });
});

describe("sunucu ayarları — menü sayaçları (K12)", () => {
  it("kanal sayısını kategoriler ve gruplanmamışlar üzerinden toplar", () => {
    const counts = resolveServerSettingsCounts(detailFixture(), 2);

    assert.equal(counts.channels, 4);
    assert.equal(counts.roles, 3);
    assert.equal(counts.invites, 2);
    assert.equal(counts.events, 2);
    assert.equal(counts.none, null);
  });

  it("üye sayısını sayfalı listeden değil `memberCount`'tan okur", () => {
    const detail = detailFixture();
    const counts = resolveServerSettingsCounts(detail, null);

    assert.equal(detail.members.length, 1);
    assert.equal(counts.members, 5);
  });

  it("etkinlik sayısı yüklenmediyse `0` uydurmaz", () => {
    assert.equal(resolveServerSettingsCounts(detailFixture(), null).events, null);
  });
});

describe("sunucu ayarları — görünürlük kapısı (00 §6)", () => {
  it("rozet üç durumu ayırır", () => {
    assert.equal(resolveServerVisibilityBadge({ discoverable: false, isPublic: false }), "private");
    assert.equal(resolveServerVisibilityBadge({ discoverable: false, isPublic: true }), "public");
    assert.equal(
      resolveServerVisibilityBadge({ discoverable: true, isPublic: true }),
      "discoverable",
    );
  });

  it("herkese açık kapanınca Keşfet listelemesi de kapanır", () => {
    const next = applyServerVisibilityPatch(
      { discoverable: true, isPublic: true },
      { isPublic: false },
    );

    assert.deepEqual(next, { discoverable: false, isPublic: false });
  });

  it("herkese açık değilken listeleme açılamaz", () => {
    const next = applyServerVisibilityPatch(
      { discoverable: false, isPublic: false },
      { discoverable: true },
    );

    assert.deepEqual(next, { discoverable: false, isPublic: false });
    assert.equal(canListInDiscovery({ isPublic: false }), false);
    assert.equal(canListInDiscovery({ isPublic: true }), true);
  });

  it("herkese açıkken listeleme serbestçe açılıp kapanır", () => {
    assert.deepEqual(
      applyServerVisibilityPatch({ discoverable: false, isPublic: true }, { discoverable: true }),
      { discoverable: true, isPublic: true },
    );
    assert.deepEqual(
      applyServerVisibilityPatch({ discoverable: true, isPublic: true }, { discoverable: false }),
      { discoverable: false, isPublic: true },
    );
  });

  it("aynı yamada ikisi birlikte açılabilir", () => {
    assert.deepEqual(
      applyServerVisibilityPatch(
        { discoverable: false, isPublic: false },
        { discoverable: true, isPublic: true },
      ),
      { discoverable: true, isPublic: true },
    );
  });
});

describe("sunucu ayarları — kaydetme gövdesi", () => {
  it("yalnız değişen alanları taşır", () => {
    const patch = diffServerSettings(
      { description: "eski", name: "Mobile Test", tags: ["oyun"] },
      { description: "eski", name: "Mobil Test", tags: ["oyun"] },
    );

    assert.deepEqual(patch, { name: "Mobil Test" });
  });

  it("dizileri eleman eleman karşılaştırır, referansla değil", () => {
    assert.deepEqual(diffServerSettings({ tags: ["a", "b"] }, { tags: ["a", "b"] }), {});
    assert.deepEqual(diffServerSettings({ tags: ["a"] }, { tags: ["a", "b"] }), {
      tags: ["a", "b"],
    });
  });

  it("`null` ile boş dizgeyi ayırır (ikon rengini kaldırma)", () => {
    assert.deepEqual(diffServerSettings({ iconColor: "primary" }, { iconColor: null }), {
      iconColor: null,
    });
  });

  it("topluluk sunucusunda görünürlük alanlarını hiç göndermez", () => {
    const patch = stripAdminOwnedFields(
      { discoverable: true, isPublic: true, name: "Mobile Test" },
      "COMMUNITY",
    );

    assert.deepEqual(patch, { name: "Mobile Test" });
  });

  it("kişisel sunucuda görünürlük alanları geçer", () => {
    const patch = stripAdminOwnedFields(
      { discoverable: true, isPublic: true, name: "Mobile Test" },
      "PERSONAL",
    );

    assert.deepEqual(patch, { discoverable: true, isPublic: true, name: "Mobile Test" });
  });
});

describe("sunucu ayarları — seçenek listeleri (K7)", () => {
  it("kayıtlı değer listedeyse liste değişmez", () => {
    assert.deepEqual(selectDeletedNoticeOptions(60), [5, 15, 30, 60, 180, 360, 1440]);
    assert.deepEqual(selectMessageLimitOptions(2000), [2000, 250, 40_000]);
  });

  it("listede olmayan kayıtlı değer başa eklenir, sessizce değiştirilmez", () => {
    assert.deepEqual(selectDeletedNoticeOptions(45), [45, 5, 15, 30, 60, 180, 360, 1440]);
    assert.deepEqual(selectMessageLimitOptions(1234), [1234, 2000, 250, 40_000]);
  });
});
