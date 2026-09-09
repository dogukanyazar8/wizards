import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceRole } from "@wizards/types";

import { countSelected, resolvePreset } from "./permission-groups";
import {
  DEFAULT_ROLE_TONE,
  SERVER_ROLE_TONES,
  roleColorToTone,
  roleToneToColor,
} from "./role-color";
import {
  ROLE_NAME_MAX_LENGTH,
  applyRolePreset,
  canDeleteRole,
  canSubmitRoleDraft,
  clampRoleName,
  countRoleMembers,
  createRoleDraft,
  getRoleGuardCopy,
  isProtectedRole,
  matchRolePreset,
  sortRolesForSettings,
  toRoleDraft,
  togglePermission,
} from "./role-editor";

/** Ş12 — SPEC-SUNUCU §8.5'in davranış çekirdeği. */

function role(overrides: Partial<WorkspaceRole> = {}): WorkspaceRole {
  return {
    color: roleToneToColor("primary"),
    id: "role-1",
    isDefault: false,
    managed: false,
    mentionable: false,
    name: "Yayın Ekibi",
    permissions: [],
    position: 1,
    ...overrides,
  };
}

describe("rol rengi", () => {
  it("altı swatch'ın tamsayısı benzersiz ve gidiş-dönüş kayıpsız", () => {
    const colors = SERVER_ROLE_TONES.map((tone) => roleToneToColor(tone));

    assert.equal(new Set(colors).size, SERVER_ROLE_TONES.length);
    for (const tone of SERVER_ROLE_TONES) {
      assert.equal(roleColorToTone(roleToneToColor(tone)), tone);
    }
  });

  it("tanınmayan tamsayı en yakın swatch'a düşer, hata vermez", () => {
    // Ürünün eski rol paletindeki `DEFAULT_ROLE_COLOR` (#797150) — hiçbir swatch'a eşit değil.
    assert.equal(roleColorToTone(7_958_864), "textMuted");
    // `0` (siyah) da bir swatch değil; en yakın nötr tona düşer.
    assert.ok(SERVER_ROLE_TONES.includes(roleColorToTone(0)));
  });
});

describe("rol sıralaması ve üye sayısı", () => {
  it("varsayılan rol en üstte, kalanı `position` artan", () => {
    const sorted = sortRolesForSettings([
      role({ id: "admin", name: "Admin", position: 3 }),
      role({ id: "everyone", isDefault: true, name: "@everyone", position: 0 }),
      role({ id: "uye", name: "Üye", position: 1 }),
    ]);

    assert.deepEqual(
      sorted.map((entry) => entry.id),
      ["everyone", "uye", "admin"],
    );
  });

  it("varsayılan rol tüm üyeleri sayar, kalanı rozetten sayılır (K12)", () => {
    const members = [
      { roles: [{ id: "uye" }] },
      { roles: [{ id: "uye" }] },
      { roles: [] as { id: string }[] },
    ];

    assert.equal(countRoleMembers({ id: "everyone", isDefault: true }, members, 5), 5);
    assert.equal(countRoleMembers({ id: "uye", isDefault: false }, members, 5), 2);
  });
});

describe("rol taslağı", () => {
  it("`Üye` ön ayarıyla, primary renkte, etiketlenemez açılır — 5 yetki", () => {
    const draft = createRoleDraft();

    assert.equal(draft.name, "");
    assert.equal(draft.tone, DEFAULT_ROLE_TONE);
    assert.equal(draft.mentionable, false);
    assert.deepEqual([...draft.permissions], resolvePreset("member"));
    // SPEC: "yalnızca Genel · 5 yetki" — `Geçmişi oku` kapatılamaz satır olarak sayılır.
    assert.equal(countSelected(draft.permissions), 5);
  });

  it("ad boşken gönderilemez, doluysa gönderilebilir", () => {
    assert.equal(canSubmitRoleDraft(createRoleDraft()), false);
    assert.equal(canSubmitRoleDraft({ ...createRoleDraft(), name: "   " }), false);
    assert.equal(canSubmitRoleDraft({ ...createRoleDraft(), name: "Yayın" }), true);
  });

  it("ad 32 karakterde kesilir (K6)", () => {
    const clamped = clampRoleName("x".repeat(80));

    assert.equal(clamped.length, ROLE_NAME_MAX_LENGTH);
    assert.equal(clampRoleName("Yayın"), "Yayın");
  });

  it("mevcut rol taslağa çevrilirken renk tondan okunur", () => {
    const draft = toRoleDraft(role({ color: roleToneToColor("danger"), mentionable: true }));

    assert.equal(draft.tone, "danger");
    assert.equal(draft.mentionable, true);
  });
});

describe("yetki seti", () => {
  it("`N yetki seçili` SPEC'in 14'ünü verir (Genel + Ses + Moderasyon)", () => {
    assert.equal(countSelected(resolvePreset("moderator")), 14);
  });

  it("hazır ayar çipi yetki setine bakar, ada değil", () => {
    assert.equal(matchRolePreset(resolvePreset("member")), "member");
    assert.equal(matchRolePreset(resolvePreset("moderator")), "moderator");
    assert.equal(matchRolePreset(resolvePreset("admin")), "admin");
    assert.equal(matchRolePreset(["VIEW_CHANNEL"]), null);
  });

  it("`Admin` hazır ayarı `ADMINISTRATOR` vermez", () => {
    assert.equal(resolvePreset("admin").includes("ADMINISTRATOR"), false);
  });

  it("18 satırın dışındaki anahtarlar hazır ayarda ve anahtar açıp kapatmada korunur", () => {
    const withHidden = applyRolePreset(["BAN_MEMBERS", "VIEW_CHANNEL"], "member");

    assert.ok(withHidden.includes("BAN_MEMBERS"));
    assert.deepEqual(
      [...withHidden].filter((key) => key !== "BAN_MEMBERS").sort(),
      [...resolvePreset("member")].sort(),
    );

    const toggled = togglePermission(withHidden, "SEND_MESSAGES", false);
    assert.equal(toggled.includes("SEND_MESSAGES"), false);
    assert.ok(toggled.includes("BAN_MEMBERS"));
  });
});

describe("korunan rol guard'ları", () => {
  it("varsayılan, yönetilen ve yüksek yetkili roller korunur", () => {
    assert.equal(isProtectedRole(role({ isDefault: true })), true);
    assert.equal(isProtectedRole(role({ managed: true })), true);
    assert.equal(isProtectedRole(role({ permissions: ["MANAGE_SERVER"] })), true);
    assert.equal(isProtectedRole(role({ permissions: ["SEND_MESSAGES"] })), false);
  });

  it("guard metni sistem ve güvenli rolü ayırır", () => {
    assert.equal(
      getRoleGuardCopy(role({ isDefault: true }))?.labelKey,
      "server.settings.roles.guard.system",
    );
    assert.equal(
      getRoleGuardCopy(role({ permissions: ["ADMINISTRATOR"] }))?.labelKey,
      "server.settings.roles.guard.safe",
    );
    assert.equal(getRoleGuardCopy(role()), null);
  });

  it("silme yalnız sahibe ve yalnız korunmayan role açık", () => {
    assert.equal(canDeleteRole(role(), true), true);
    assert.equal(canDeleteRole(role(), false), false);
    assert.equal(canDeleteRole(role({ isDefault: true }), true), false);
  });
});
