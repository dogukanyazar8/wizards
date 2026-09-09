import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceChannel, WorkspaceRole } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { resolvePreset } from "@/lib/servers/permission-groups";
import { roleToneToColor } from "@/lib/servers/role-color";
import { ROLE_NAME_MAX_LENGTH, createRoleDraft, toRoleDraft } from "@/lib/servers/role-editor";
import { ChannelsSectionView } from "./channels-section";
import { RolesSectionView } from "./roles-section";

/**
 * Ş12 — Kanallar ve Kategoriler (§8.4) · Roller ve Yetkiler (§8.5).
 *
 * Testler ölçünün **değerini** değil, ölçünün sözlükten geldiğini ve yetki kapılarının
 * render seviyesinde kapandığını doğrular. Sıralama ve taslak kuralları saf modüllerde
 * (`channel-ordering.test.ts`, `role-editor.test.ts`) ayrıca testli.
 */

const MESSAGES = getMessagesForLocale("tr");
const copy = (key: string): string => MESSAGES[key] ?? "";

/**
 * Bir `data-testid`'nin ait olduğu etiketin tamamı. React öznitelikleri JSX sırasıyla yazıyor;
 * `data-testid`nin solundaki ya da sağındaki özniteliği aramak testi sıraya bağlar ve bir
 * öznitelik yer değiştirdiğinde davranış aynıyken test kırılır.
 */
function tagFor(html: string, testId: string): string {
  const index = html.indexOf(`data-testid="${testId}"`);
  assert.notEqual(index, -1, `${testId} render edilmedi`);

  return html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

function channel(overrides: Partial<WorkspaceChannel> = {}): WorkspaceChannel {
  return {
    bitrate: 64_000,
    canAccess: true,
    categoryId: "cat-general",
    id: "ch-welcome",
    locked: false,
    mentionCount: 0,
    name: "welcome-chat",
    position: 0,
    readOnly: false,
    rtcRegion: null,
    slowModeDelay: 0,
    topic: null,
    type: "TEXT",
    unreadCount: 0,
    userLimit: 0,
    videoQualityMode: "AUTO",
    ...overrides,
  };
}

const noop = () => undefined;

function renderChannels(
  overrides: Partial<React.ComponentProps<typeof ChannelsSectionView>> = {},
): string {
  return render(
    <ChannelsSectionView
      accessByChannelId={{ "ch-welcome": "PUBLIC" }}
      categories={[
        {
          channels: [channel()],
          id: "cat-general",
          name: "GENEL",
        },
      ]}
      onAddCategory={noop}
      onAddChannel={noop}
      onDeleteCategory={noop}
      onDeleteChannel={noop}
      onDragEnd={noop}
      onEditCategory={noop}
      onEditChannel={noop}
      onMoveCategory={noop}
      {...overrides}
    />,
  );
}

describe("Kanallar ve Kategoriler (§8.4)", () => {
  it("iki ekleme düğmesi de `+` ikonlu ve gerçek `button`", () => {
    const html = renderChannels();

    assert.match(html, /data-testid="settings-add-category"/u);
    assert.match(html, /data-testid="settings-add-channel"/u);
    assert.ok(html.includes(copy("server.settings.channels.addCategory")));
    assert.ok(html.includes(copy("server.settings.channels.addChannel")));
    // İki düğme + kategori başlığındaki `+` = üç artı ikonu.
    assert.equal(html.split("lucide-plus").length - 1, 3);
  });

  it("üst çubuğun notu SPEC metninin birebir aynısı", () => {
    assert.ok(renderChannels().includes(copy("server.settings.channels.note")));
  });

  it("kategori şeridi yukarı · aşağı · `+` · düzenle · sil taşır; ölçü sözlükten", () => {
    const html = renderChannels();
    const { settingsSections } = SERVER_METRICS;

    for (const testId of [
      "settings-category-up-cat-general",
      "settings-category-down-cat-general",
      "settings-category-add-cat-general",
      "settings-category-edit-cat-general",
      "settings-category-delete-cat-general",
    ]) {
      assert.match(html, new RegExp(`data-testid="${testId}"`, "u"));
    }

    assert.ok(html.includes(`height:${pxToRem(settingsSections.channelsActionSize)}`));
    assert.ok(html.includes(`width:${pxToRem(settingsSections.channelsActionSize)}`));
  });

  it("tek kategori varken yukarı/aşağı pasif — boşa istek gitmez", () => {
    const html = renderChannels();

    assert.match(tagFor(html, "settings-category-up-cat-general"), /disabled=""/u);
    assert.match(tagFor(html, "settings-category-down-cat-general"), /disabled=""/u);
  });

  it("`Herkese açık` çipi **success**, kilitli warning, gizli danger, role bağlı primary", () => {
    const cases: Array<[string, string]> = [
      ["PUBLIC", "--success"],
      ["LOCKED_VISIBLE", "--warning"],
      ["PRIVATE", "--danger"],
      ["ROLE_GATED", "--primary"],
    ];

    for (const [preset, variable] of cases) {
      const html = renderChannels({ accessByChannelId: { "ch-welcome": preset } as never });

      assert.match(html, new RegExp(`data-testid="settings-channel-access-${preset}"`, "u"));
      assert.ok(html.includes(`color:hsl(var(${variable}))`));
      assert.ok(html.includes(copy(`server.settings.channels.access.${preset}`)));
    }
  });

  it("erişim yanıtı gelmeden çip boş çizilir, tahmin edilmez", () => {
    const html = renderChannels({ accessByChannelId: {} });

    assert.match(html, /data-testid="settings-channel-access-pending"/u);
    assert.equal(html.includes(copy("server.settings.channels.access.PUBLIC")), false);
  });

  it("ses kanalı hoparlör simgesini success, yazı kanalı `#` simgesini muted çizer", () => {
    const html = renderChannels({
      accessByChannelId: { "ch-room": "PUBLIC", "ch-welcome": "PUBLIC" },
      categories: [
        {
          channels: [channel(), channel({ id: "ch-room", name: "live-room", type: "VOICE" })],
          id: "cat-general",
          name: "GENEL",
        },
      ],
    });

    assert.match(html, /text-\[hsl\(var\(--success\)\)\][^"]*"[^>]*><svg[^>]*lucide-volume2/u);
    assert.match(html, /lucide-hash/u);
  });

  it("her satır sürükleme tutamacı taşır ve tutamak odaklanabilir `button`", () => {
    const html = renderChannels();

    assert.ok(
      html.includes(
        copy("server.settings.channels.channelHandle").replace("{name}", "welcome-chat"),
      ),
    );
    assert.ok(
      html.includes(copy("server.settings.channels.categoryHandle").replace("{name}", "GENEL")),
    );
    assert.match(html, /aria-label="welcome-chat kanalını sürükle"[^>]*/u);
  });

  it("kategorisiz kanalların sahte kartında yeniden adlandırma ve silme yok", () => {
    const html = renderChannels({
      categories: [
        {
          channels: [channel({ categoryId: null })],
          id: null,
          name: copy("server.modal.channel.noCategory"),
        },
      ],
    });

    assert.match(html, /data-testid="settings-category-add-uncategorized"/u);
    assert.equal(html.includes('data-testid="settings-category-edit-'), false);
    assert.equal(html.includes('data-testid="settings-category-delete-'), false);
  });

  it("kanal yokken boş metin çizilir", () => {
    const html = renderChannels({ categories: [] });

    assert.ok(html.includes(copy("server.settings.channels.empty")));
  });
});

function role(overrides: Partial<WorkspaceRole> = {}): WorkspaceRole {
  return {
    color: roleToneToColor("primary"),
    id: "role-mod",
    isDefault: false,
    managed: false,
    mentionable: false,
    name: "Moderatör",
    permissions: resolvePreset("moderator"),
    position: 2,
    ...overrides,
  };
}

const ROLES = [
  role({ id: "role-everyone", isDefault: true, name: "@everyone", permissions: [], position: 0 }),
  role(),
];

function renderRoles(
  overrides: Partial<React.ComponentProps<typeof RolesSectionView>> = {},
): string {
  return render(
    <RolesSectionView
      draft={toRoleDraft(ROLES[1] as WorkspaceRole)}
      guard={null}
      isOwner
      onCancelDraft={noop}
      onDeleteRole={noop}
      onDraftChange={noop}
      onNameCommit={noop}
      onSelectRole={noop}
      onStartDraft={noop}
      onSubmitDraft={noop}
      readOnly={false}
      roleMemberCounts={{ "role-everyone": 5, "role-mod": 1 }}
      roles={ROLES}
      selection={{ kind: "role", roleId: "role-mod" }}
      submitting={false}
      {...overrides}
    />,
  );
}

describe("Roller ve Yetkiler (§8.5)", () => {
  it("iki kolon `212 / 1fr` ve ölçü sözlükten", () => {
    const html = renderRoles();
    const { settingsSections } = SERVER_METRICS;

    assert.ok(
      html.includes(
        `grid-template-columns:${pxToRem(settingsSections.rolesListColumnWidth)} minmax(0,1fr)`,
      ),
    );
    assert.ok(html.includes(`gap:${pxToRem(settingsSections.rolesGridGap)}`));
  });

  it("dört yetki grubu `5/5 · 5/5 · 4/4 · 0/4` ile gelir", () => {
    const html = renderRoles();

    for (const group of ["general", "voice", "moderation", "management"]) {
      assert.match(html, new RegExp(`data-testid="permission-group-${group}"`, "u"));
    }

    assert.equal(html.split(">5/5<").length - 1, 2);
    assert.ok(html.includes(">4/4<"));
    assert.ok(html.includes(">0/4<"));
  });

  it("başlıktaki `N yetki seçili` canlı sayar — SPEC örneği 14", () => {
    const html = renderRoles();

    assert.match(html, /data-testid="settings-role-permission-count"/u);
    assert.ok(html.includes(copy("server.settings.roles.selectedCount").replace("{count}", "14")));
  });

  it("üç hazır ayar çipi çizilir ve eşleşen küme işaretlenir", () => {
    const html = renderRoles();

    assert.match(tagFor(html, "settings-role-preset-member"), /aria-pressed="false"/u);
    assert.match(tagFor(html, "settings-role-preset-moderator"), /aria-pressed="true"/u);
    assert.match(tagFor(html, "settings-role-preset-admin"), /aria-pressed="false"/u);
  });

  it("rol adı 32'de kesilir ve renk swatch'ları `radiogroup`", () => {
    const html = renderRoles();

    assert.match(
      tagFor(html, "settings-role-name"),
      new RegExp(`maxLength="${ROLE_NAME_MAX_LENGTH}"`, "u"),
    );
    assert.match(html, /role="radiogroup"/u);
    assert.match(html, /data-testid="settings-role-swatch-danger"[^>]*/u);
    assert.ok(html.includes("background:hsl(var(--danger))"));
  });

  it("seçili rolün noktası `Role.color`'dan türeyen tonu kullanır", () => {
    const html = renderRoles({
      draft: toRoleDraft(role({ color: roleToneToColor("warning") })),
    });

    assert.ok(html.includes("background:hsl(var(--warning))"));
  });

  it("sahip için `Yönetici` satırı ve `Rolü sil` kartı çizilir", () => {
    const html = renderRoles();

    assert.match(html, /data-testid="permission-row-administrator"/u);
    assert.match(html, /data-testid="settings-role-delete-card"/u);
    assert.ok(html.includes(copy("server.settings.ownerOnly")));
  });

  it("sahip değilse `Yönetici` yetkisi ve `Rolü sil` **hiç** render edilmez", () => {
    const html = renderRoles({ isOwner: false });

    assert.equal(html.includes('data-testid="permission-row-administrator"'), false);
    assert.equal(html.includes(copy("server.settings.roles.permission.administrator")), false);
    assert.equal(html.includes('data-testid="settings-role-delete-card"'), false);
    assert.equal(html.includes('data-testid="settings-role-delete"'), false);
    // Yönetim grubu yine görünür, yalnız satır düşer.
    assert.match(html, /data-testid="permission-group-management"/u);
  });

  it("korunan rolde guard metni çizilir ve girdiler kilitlenir", () => {
    const html = renderRoles({
      guard: {
        descriptionKey: "server.settings.roles.guard.systemHint",
        labelKey: "server.settings.roles.guard.system",
      },
      readOnly: true,
      selection: { kind: "role", roleId: "role-everyone" },
    });

    assert.match(html, /data-testid="settings-role-guard"/u);
    assert.ok(html.includes(copy("server.settings.roles.guard.system")));
    assert.match(tagFor(html, "settings-role-name"), /disabled=""/u);
  });
});

describe("Rol oluşturma — ayrı pencere değil (§8.5)", () => {
  function renderDraft(name = ""): string {
    return renderRoles({
      draft: { ...createRoleDraft(), name },
      selection: { kind: "draft" },
    });
  }

  it("sol listede `TASLAK` satırı belirir, mevcut roller seçimsiz kalır", () => {
    const html = renderDraft();

    assert.match(html, /data-testid="settings-role-draft-row"/u);
    assert.ok(html.includes(copy("server.settings.roles.draftBadge")));
    assert.equal(html.includes('aria-current="true"'), false);
  });

  it("sağ panel boş taslağa geçer: `Yeni rol` başlığı + rozeti, `Üye` ön ayarı", () => {
    const html = renderDraft();

    assert.match(html, /data-testid="settings-role-heading"/u);
    assert.ok(html.includes(copy("server.settings.roles.newRoleBadge")));
    assert.ok(html.includes(copy("server.settings.roles.selectedCount").replace("{count}", "5")));
    assert.ok(html.includes(copy("server.settings.roles.namePlaceholder")));
  });

  it("ad girilince başlık ada döner", () => {
    const html = renderDraft("Yayın Ekibi");
    const headingIndex = html.indexOf('data-testid="settings-role-heading"');

    assert.ok(html.slice(headingIndex, headingIndex + 200).includes("Yayın Ekibi"));
  });

  it("`Rolü sil` kartının yerini alt çubuk alır", () => {
    const html = renderDraft();

    assert.match(html, /data-testid="settings-role-draft-bar"/u);
    assert.equal(html.includes('data-testid="settings-role-delete-card"'), false);
  });

  it("ad boşken durum metni warning ve `Rol oluştur` pasif", () => {
    const html = renderDraft();

    assert.ok(html.includes(copy("server.settings.roles.draft.hint")));
    assert.ok(html.includes("text-[hsl(var(--warning))]"));
    assert.match(tagFor(html, "settings-role-draft-submit"), /aria-disabled="true"/u);
    assert.match(tagFor(html, "settings-role-draft-submit"), /cursor-not-allowed/u);
  });

  it("ad doluysa özet satırı yetki sayısını yazar ve düğme etkinleşir", () => {
    const html = renderDraft("Yayın Ekibi");

    assert.ok(html.includes(copy("server.settings.roles.draft.summary").replace("{count}", "5")));
    assert.match(tagFor(html, "settings-role-draft-submit"), /aria-disabled="false"/u);
  });

  it("`Vazgeç` düğmesi taslak çubuğunda durur", () => {
    const html = renderDraft("Yayın");

    assert.match(html, /data-testid="settings-role-draft-cancel"/u);
    assert.ok(html.includes(copy("common.cancel")));
  });

  it("taslak açıkken `+ Rol oluştur` düğmesi primary tonuna geçer", () => {
    const draftHtml = renderDraft();
    const idleHtml = renderRoles();

    assert.ok(draftHtml.includes("border-color:hsl(var(--primary)/0.55)"));
    assert.equal(idleHtml.includes("border-color:hsl(var(--primary)/0.55)"), false);
  });
});
