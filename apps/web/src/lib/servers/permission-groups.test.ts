import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkspacePermissionKeySchema, type WorkspacePermissionKey } from "@wizards/types";

import {
  countGroupSelected,
  countSelected,
  getPermissionGroupSelection,
  listGroupKeys,
  resolvePreset,
  SERVER_PERMISSION_GROUPS,
  SERVER_PERMISSION_ROW_COUNT,
  setPermissionGroupSelection,
} from "./permission-groups";

const ALL_ROWS = SERVER_PERMISSION_GROUPS.flatMap((group) => group.rows);

describe("yetki grupları — SPEC §8.5 tablosu", () => {
  it("dört grubu tasarımdaki sırayla taşır", () => {
    assert.deepEqual(
      SERVER_PERMISSION_GROUPS.map((group) => group.id),
      ["general", "voice", "moderation", "management"],
    );
  });

  it("grup başına 5 · 5 · 4 · 4 satır, toplam 18 çizer", () => {
    assert.deepEqual(
      SERVER_PERMISSION_GROUPS.map((group) => group.rows.length),
      [5, 5, 4, 4],
    );
    assert.equal(SERVER_PERMISSION_ROW_COUNT, 18);
  });

  it("her anahtarı mevcut sözleşmeden seçer, yenisini üretmez", () => {
    for (const row of ALL_ROWS) {
      if (!row.key) {
        continue;
      }

      assert.equal(
        WorkspacePermissionKeySchema.safeParse(row.key).success,
        true,
        `${row.id} bilinmeyen bir anahtara bağlı: ${row.key}`,
      );
    }
  });

  it("aynı anahtarı iki satıra bağlamaz", () => {
    // İki satır aynı biti yazsaydı birini kapatmak diğerini de kapatırdı ve anahtarlardan
    // biri kendiliğinden yer değiştirmiş görünürdü.
    const keys = ALL_ROWS.flatMap((row) => (row.key ? [row.key] : []));

    assert.equal(new Set(keys).size, keys.length);
  });

  it("`Geçmişi oku` satırını uydurma bir anahtara bağlamak yerine kapatılamaz bırakır", () => {
    // Üründe "mesaj geçmişini oku" biti yok; satır ekranda kalır ama bir anahtarı yoktur.
    const alwaysOn = ALL_ROWS.filter((row) => row.alwaysOn);

    assert.deepEqual(
      alwaysOn.map((row) => row.id),
      ["readHistory"],
    );
    assert.equal(alwaysOn[0]?.key, undefined);
  });

  it("`Yönetici` satırını yalnız sahibe açar", () => {
    const ownerOnly = ALL_ROWS.filter((row) => row.ownerOnly);

    assert.deepEqual(
      ownerOnly.map((row) => row.key),
      ["MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_SERVER", "ADMINISTRATOR"],
    );
  });
});

describe("hazır ayarlar — SPEC §8.5 `HAZIR AYARLAR`", () => {
  it("`Üye` yalnız Genel grubu açar", () => {
    assert.deepEqual(resolvePreset("member"), listGroupKeys("general"));
  });

  it("`Moderatör` Genel + Ses ve Medya + Moderasyon'u açar", () => {
    assert.deepEqual(resolvePreset("moderator"), [
      ...listGroupKeys("general"),
      ...listGroupKeys("voice"),
      ...listGroupKeys("moderation"),
    ]);
  });

  it("`Admin` hepsini açar ama `Yönetici`yi asla", () => {
    const admin = resolvePreset("admin");

    assert.equal(admin.includes("ADMINISTRATOR"), false);
    assert.deepEqual(admin, [
      ...listGroupKeys("general"),
      ...listGroupKeys("voice"),
      ...listGroupKeys("moderation"),
      ...listGroupKeys("management").filter((key) => key !== "ADMINISTRATOR"),
    ]);
  });
});

describe("sayaçlar — başlıktaki `N yetki seçili`", () => {
  it("`Moderatör` hazır ayarında tasarımın 14'ünü verir", () => {
    // SPEC'in örneği Genel (5) + Ses ve Medya (5) + Moderasyon (4); kapatılamaz satır sayının
    // içindedir, yoksa toplam 13 çıkardı.
    assert.equal(countSelected(resolvePreset("moderator")), 14);
  });

  it("`Üye` 5, `Admin` 17 sayar", () => {
    assert.equal(countSelected(resolvePreset("member")), 5);
    assert.equal(countSelected(resolvePreset("admin")), 17);
  });

  it("hiçbir yetki seçili değilken bile kapatılamaz satırı sayar", () => {
    assert.equal(countSelected([]), 1);
  });

  it("gruba ait olmayan bir anahtarı saymaz", () => {
    const outsider = "VIEW_AUDIT_LOG" satisfies WorkspacePermissionKey;

    assert.equal(countSelected([outsider]), 1);
  });

  it("grup başlığındaki `seçili/toplam` değerini verir", () => {
    assert.deepEqual(countGroupSelected("general", resolvePreset("member")), {
      selected: 5,
      total: 5,
    });
    assert.deepEqual(countGroupSelected("management", resolvePreset("member")), {
      selected: 0,
      total: 4,
    });
    assert.deepEqual(countGroupSelected("management", resolvePreset("admin")), {
      selected: 3,
      total: 4,
    });
  });
});

describe("grup toplu seçimi", () => {
  it("hiçbiri, kısmi ve tümü durumlarını gerçek anahtarlardan türetir", () => {
    assert.equal(getPermissionGroupSelection("voice", []).state, "none");
    assert.equal(getPermissionGroupSelection("voice", ["CONNECT_VOICE"]).state, "mixed");
    assert.equal(getPermissionGroupSelection("voice", listGroupKeys("voice")).state, "all");
  });

  it("grubu açıp kapatırken başka ve bilinmeyen anahtarları korur", () => {
    const outsider = "VIEW_AUDIT_LOG" satisfies WorkspacePermissionKey;
    const enabled = setPermissionGroupSelection([outsider], "voice", true);

    assert.deepEqual(enabled, [outsider, ...listGroupKeys("voice")]);
    assert.deepEqual(setPermissionGroupSelection(enabled, "voice", false), [outsider]);
  });

  it("sahip olmayan kullanıcı için Yönetici anahtarını saymaz ve değiştirmez", () => {
    const options = { includeOwnerOnly: false } as const;

    assert.deepEqual(countGroupSelected("management", [], options), { selected: 0, total: 0 });
    assert.equal(
      setPermissionGroupSelection(["ADMINISTRATOR"], "management", true, options).includes(
        "ADMINISTRATOR",
      ),
      true,
    );
    assert.equal(
      getPermissionGroupSelection(
        "management",
        ["MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_SERVER"],
        options,
      ).state,
      "none",
    );
    assert.deepEqual(setPermissionGroupSelection([], "management", true, options), []);
  });
});
