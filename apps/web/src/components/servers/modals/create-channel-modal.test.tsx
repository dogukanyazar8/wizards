import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceServerDetail } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { createChannelAdvancedSettings } from "./channel-form-model";
import {
  ChannelModalHeaderIcon,
  channelModalBodyStyle,
  CreateChannelModalView,
} from "./create-channel-modal";

/** Ş8 — kanal penceresi (SPEC-SUNUCU §6.2, 660, dört adım). */
const MESSAGES = getMessagesForLocale("tr");

const copy = (key: string): string => MESSAGES[key] ?? "";
const WORKSPACE_MODALS_SOURCE = readFileSync(
  fileURLToPath(new URL("../../shell/workspace-modals.tsx", import.meta.url)),
  "utf8",
);

const DETAIL = {
  categories: [
    { channels: [], id: "cat-lobby", name: "LOBBY", position: 0 },
    { channels: [], id: "cat-codex", name: "CODEX", position: 1 },
  ],
  invites: [],
  memberPage: { items: [], nextCursor: null, totalCount: 0 },
  members: [],
  roles: [
    {
      color: 0,
      id: "role-team",
      isDefault: false,
      managed: false,
      mentionable: true,
      name: "Ekip",
      permissions: [],
      position: 1,
    },
    {
      color: 0,
      id: "role-everyone",
      isDefault: true,
      managed: false,
      mentionable: false,
      name: "@everyone",
      permissions: [],
      position: 0,
    },
  ],
  server: {
    availableRtcRegions: [],
    id: "srv",
    name: "Mobile Test",
  },
  ungroupedChannels: [],
} as unknown as WorkspaceServerDetail;

type Overrides = Partial<React.ComponentProps<typeof CreateChannelModalView>>;

function render(overrides: Overrides = {}): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <CreateChannelModalView
        advancedSettings={createChannelAdvancedSettings()}
        allowedRoleIds={[]}
        categoryId={null}
        name=""
        onAdvancedSettingsChange={() => {}}
        onAllowedRoleIdsChange={() => {}}
        onCategoryChange={() => {}}
        onNameChange={() => {}}
        onPresetChange={() => {}}
        onSubmit={() => {}}
        onTopicChange={() => {}}
        onTypeChange={() => {}}
        permissionsEditable
        preset="PUBLIC"
        serverDetail={DETAIL}
        topic=""
        type="TEXT"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("kanal penceresi — 1 · kanal türü", () => {
  it("iki kartı tek satırlık açıklamalarıyla çizer", () => {
    const html = render();

    assert.match(html, new RegExp(copy("server.modal.channel.kind.textDescription"), "u"));
    assert.match(html, new RegExp(copy("server.modal.channel.kind.voiceDescription"), "u"));
    // Açıklama tek satır: taşan metin kırpılır.
    assert.match(html, /truncate/u);
  });

  it("seçili kart primary çerçeve + primary/.08 zemin + tik taşır", () => {
    const html = render({ type: "VOICE" });

    assert.match(html, /hsl\(var\(--primary\)\/0\.08\)/u);
    // React nitelikleri JSX sırasına göre yazar; test sıraya değil, aynı `<button>` içinde
    // bulunmalarına bakar.
    assert.match(html, /aria-checked="true"[^>]*data-testid="channel-kind-voice"/u);
    assert.match(html, /aria-checked="false"[^>]*data-testid="channel-kind-text"/u);
  });

  it("düzenleme kipinde kartlar kilitli", () => {
    const html = render({ readOnlyType: true });

    assert.match(html, /aria-disabled="true"[^>]*data-testid="channel-kind-text"/u);
  });
});

describe("kanal penceresi — 2 · temel bilgiler", () => {
  it("yazı kanalında `#` öneki ve gerçek adlandırma ipucu", () => {
    const html = render();

    assert.match(html, />#</u);
    assert.match(html, new RegExp(copy("server.modal.channel.nameHintText"), "u"));
  });

  it("ses kanalında önek yok, aynı gerçek adlandırma kuralı görünür", () => {
    const html = render({ type: "VOICE" });

    assert.match(html, new RegExp(copy("server.modal.channel.nameHintVoice"), "u"));
    assert.equal(
      copy("server.modal.channel.nameHintVoice"),
      copy("server.modal.channel.nameHintText"),
    );
  });

  it("iki sayaç da SPEC sınırlarını yazar", () => {
    const html = render({ name: "abc", topic: "xy" });

    assert.match(html, />3\/48</u);
    assert.match(html, />2\/120</u);
  });

  it("kategori çipleri `Kategorisiz` + sunucunun kategorileridir", () => {
    const html = render();

    assert.match(html, new RegExp(copy("server.modal.channel.noCategory"), "u"));
    assert.match(html, />LOBBY</u);
    assert.match(html, />CODEX</u);
  });
});

describe("kanal penceresi — 3 · erişim (yetki kapısı)", () => {
  it("başlıkta `Yalnızca yönetici` çipi durur", () => {
    const html = render();

    assert.match(html, new RegExp(copy("server.modal.channel.adminOnly"), "u"));
  });

  it("dört seçenek `WorkspaceChannelPermissionPreset` ile birebir", () => {
    const html = render();

    for (const preset of ["PUBLIC", "LOCKED_VISIBLE", "PRIVATE", "ROLE_GATED"]) {
      assert.match(html, new RegExp(`data-testid="channel-access-${preset}"`, "u"));
    }
  });

  it("üye rolünde adım **hiç** render edilmez", () => {
    const html = render({ permissionsEditable: false });

    assert.doesNotMatch(html, /data-testid="channel-access-PUBLIC"/u);
    assert.doesNotMatch(html, new RegExp(copy("server.modal.channel.adminOnly"), "u"));
  });

  it("adım numaraları görünen adımlardan sayılır", () => {
    const asAdmin = render();
    const asMember = render({ permissionsEditable: false });

    // Yönetici: 1 · 2 · 3 · 4 — dördüncü adım `Gelişmiş ayarlar`.
    assert.match(asAdmin, />4<\/span>/u);
    // Üye: 1 · 2 · 3 — dördüncü numara ekranda kalmaz, `1 · 2 · 4` boşluğu oluşmaz.
    assert.doesNotMatch(asMember, />4<\/span>/u);
    assert.match(asMember, />3<\/span>/u);
  });

  it("`Role bağlı` seçilince rol satırı belirir", () => {
    const gated = render({ preset: "ROLE_GATED" });
    const publicPreset = render();

    assert.match(gated, /data-testid="channel-allowed-roles"/u);
    assert.match(gated, />Ekip</u);
    // Varsayılan rol (@everyone) çip olarak çizilmez.
    assert.doesNotMatch(gated, />@everyone</u);
    assert.doesNotMatch(publicPreset, /data-testid="channel-allowed-roles"/u);
  });
});

describe("kanal penceresi — 4 · gelişmiş / sesli ayarlar", () => {
  it("yazı kanalında yalnız yavaş mod, on iki seçenekle", () => {
    const html = render();

    assert.match(html, /data-testid="channel-slow-mode"/u);
    assert.doesNotMatch(html, /data-testid="channel-bitrate"/u);
    assert.equal(html.match(/role="radio"/gu)?.length, 12 + 2 + 4 + 3);
  });

  it("ses kanalında dört grup birden çizilir", () => {
    const html = render({ type: "VOICE" });

    for (const id of [
      "channel-bitrate",
      "channel-user-limit",
      "channel-rtc-region",
      "channel-video-quality",
    ]) {
      assert.match(html, new RegExp(`data-testid="${id}"`, "u"));
    }
    assert.doesNotMatch(html, /data-testid="channel-slow-mode"/u);
  });

  it("kullanıcı limiti çipleri düz sayı, başlık çipi `10 kişi (varsayılan)`", () => {
    const html = render({ type: "VOICE" });

    assert.match(html, />10 kişi \(varsayılan\)</u);
  });

  it("bölge yayımlanmadığında yalnız `Otomatik` çizilir ve nedeni yazılır", () => {
    const html = render({ type: "VOICE" });

    assert.match(html, new RegExp(copy("server.channel.rtcRegion.auto"), "u"));
    assert.match(html, new RegExp(copy("server.channel.rtcRegion.unavailable"), "u"));
  });

  it("bölge yayımlandığında listeye girer", () => {
    const html = render({
      serverDetail: {
        ...DETAIL,
        server: { ...DETAIL.server, availableRtcRegions: ["EU_WEST"] },
      } as WorkspaceServerDetail,
      type: "VOICE",
    });

    assert.match(html, />EU_WEST</u);
    assert.doesNotMatch(html, new RegExp(copy("server.channel.rtcRegion.unavailable"), "u"));
  });
});

describe("kanal penceresi — sabit dış geometri", () => {
  it("başlık ikonlarını referanstaki 19 px geometri ve yollarla çizer", () => {
    const textIcon = renderToStaticMarkup(<ChannelModalHeaderIcon type="TEXT" />);
    const voiceIcon = renderToStaticMarkup(<ChannelModalHeaderIcon type="VOICE" />);

    for (const icon of [textIcon, voiceIcon]) {
      assert.match(icon, /height="1\.1875rem"/u);
      assert.match(icon, /width="1\.1875rem"/u);
      assert.match(icon, /stroke-width="1\.9"/u);
      assert.match(icon, /viewBox="0 0 24 24"/u);
    }

    assert.match(textIcon, /M10 3 8 21M16 3l-2 18M3\.5 8\.5h17M3 15\.5h17/u);
    assert.match(
      voiceIcon,
      /M11 5 6 9H3v6h3l5 4z M15\.5 8\.5a5 5 0 0 1 0 7M18\.5 5\.5a9 9 0 0 1 0 13/u,
    );
  });

  it("türden bağımsız, viewport içinde kalan sabit gövde yüksekliği üretir", () => {
    assert.deepEqual(channelModalBodyStyle(), {
      flex: "0 1 min(35rem, calc(100dvh - 12rem))",
      height: "min(35rem, calc(100dvh - 12rem))",
    });
  });
});

describe("kanal oluşturma vazgeçme koruması", () => {
  it("tüm kullanıcı kapanışlarını tek kirli-durum kapısından geçirir", () => {
    assert.match(WORKSPACE_MODALS_SOURCE, /hasCreateChannelProgress/u);
    assert.match(WORKSPACE_MODALS_SOURCE, /<BugReportDiscardDialog/u);
    assert.match(WORKSPACE_MODALS_SOURCE, /onClose=\{requestChannelClose\}/u);
  });
});
