import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { WorkspaceServerDetail } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import {
  SERVER_SETTINGS_SECTIONS,
  resolveServerSettingsCounts,
} from "@/lib/servers/server-settings-model";
import { ServerSettingsOverlay } from "./server-settings-overlay";
import { ContentSection } from "./sections/content-section";
import { VisibilitySection } from "./sections/visibility-section";
import type { ServerSettingsSectionProps } from "./section-props";
import type { ServerSettingsDraft } from "./use-server-settings-draft";

/**
 * Ş11 — sunucu ayarları kabuğu (§8) ve Görünürlük · İçerik bölümleri (§8.2, §8.3).
 *
 * Kabuğun kendisi `useQuery` · `useAppStore` · `useLayerStack` · `framer-motion` üstüne
 * kurulu; `renderToStaticMarkup` onu bütün olarak süremez. Bu yüzden kabukta iki şey
 * ölçülüyor: **yetki kapısı** (kancalara girmeden, dış bileşende kapanır) ve dosyanın
 * kendi **sözleşmesi** (`modal-focus-contract.test.ts` düzeni). Bölümlerin kendisi
 * doğrudan render edilir.
 *
 * `Genel` bölümü burada değil: `useUploadThing` gerçek bir istemci kancası ve sunucu
 * tarafında `null` döndürmüyor. Onun kararları (`0/64` sayacı, swatch, önizleme) saf
 * modülde ve `shared-parts` testlerinde ölçülüyor.
 */

const MESSAGES = getMessagesForLocale("tr");
/**
 * `renderToStaticMarkup` kesme işaretini `&#x27;` yazar; sözlükten okunan ham metin ("Keşfet'te
 * listele") HTML'de birebir bulunmaz. Karşılaştırma bu yüzden kaçışlanmış hâli üzerinden yapılır
 * — testin metni elle kaçışlaması, sözlük değiştiğinde sessizce kopardı.
 */
const copy = (key: string): string => escapeHtml(MESSAGES[key] ?? "");

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#x27;");
}

/** Bir `data-testid` bloğundaki seçili çipin etiketi. */
function selectedChipLabel(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  assert.notEqual(start, -1, `${testId} render edilmedi`);

  const next = html.indexOf('data-testid="server-settings-', start + 1);
  const block = html.slice(start, next === -1 ? undefined : next);
  const chips = [...block.matchAll(/<button[^>]*aria-checked="true"[^>]*>([^<]*)</gu)];

  assert.equal(chips.length, 1, `${testId} içinde tek seçili çip beklenir`);

  return chips[0]?.[1] ?? "";
}

const here = dirname(fileURLToPath(import.meta.url));

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

function detailFixture(overrides: Record<string, unknown> = {}): WorkspaceServerDetail {
  return {
    categories: [
      {
        channels: [
          { id: "ch-1", name: "welcome-chat" },
          { id: "ch-2", name: "ayran-sohbet" },
        ],
        id: "cat-1",
        name: "GENEL",
        position: 0,
      },
    ],
    invites: [{ id: "inv-1" }, { id: "inv-2" }],
    memberPage: { cursor: null, hasMore: false },
    members: [],
    roles: [{ id: "r-1" }, { id: "r-2" }],
    server: {
      allowFileUploads: true,
      allowGifs: true,
      allowMemberAdds: true,
      deletedMessageNoticeMinutes: 60,
      description: "",
      discoverable: false,
      iconColor: null,
      iconUrl: null,
      id: "srv-1",
      isAdmin: true,
      isOwner: true,
      isPublic: false,
      memberCount: 5,
      messageCharacterLimit: 2000,
      name: "Mobile Test",
      shortName: "MT",
      slowModeDelay: 0,
      tags: [],
      type: "PERSONAL",
      ...(overrides.server as Record<string, unknown> | undefined),
    },
    ungroupedChannels: [{ id: "ch-3", name: "duyurular" }],
  } as unknown as WorkspaceServerDetail;
}

function draftFixture(overrides: Partial<ServerSettingsDraft> = {}): ServerSettingsDraft {
  return {
    allowFileUploads: true,
    allowGifs: true,
    allowMemberAdds: true,
    deletedMessageNoticeMinutes: 60,
    description: "",
    discoverable: false,
    iconColor: null,
    iconUrl: null,
    isPublic: false,
    messageCharacterLimit: 2000,
    name: "Mobile Test",
    shortName: "MT",
    slowModeDelay: 0,
    tags: [],
    ...overrides,
  };
}

function sectionProps(
  detail: WorkspaceServerDetail,
  draft: ServerSettingsDraft,
): ServerSettingsSectionProps {
  const noop = () => undefined;

  return {
    counts: resolveServerSettingsCounts(detail, 2),
    currentUserId: "user-1",
    detail,
    draft,
    flush: noop,
    onOpenDeleteServer: noop,
    patch: noop,
    patchDeferred: noop,
    permissions: {
      canBanMembers: true,
      canManageChannels: true,
      canManageEvents: true,
      canManageInvites: true,
      canManageRoles: true,
      canTimeoutMembers: true,
      isAdmin: true,
      isOwner: true,
    },
    uploadthingEnabled: true,
  } as unknown as ServerSettingsSectionProps;
}

describe("sunucu ayarları kabuğu — yetki kapısı (00 §5)", () => {
  it("düz üyeye kaplamayı hiç render etmez", () => {
    const detail = detailFixture({ server: { isAdmin: false, isOwner: false } });

    const html = renderToStaticMarkup(
      <ServerSettingsOverlay
        currentUserId="user-1"
        detail={detail}
        onOpenDeleteServer={() => undefined}
        open
        uploadthingEnabled
      />,
    );

    assert.equal(html, "");
    assert.equal(html.includes("server-settings-overlay"), false);
  });

  it("`open` kapalıyken hiçbir sunucu için çizmez", () => {
    const html = renderToStaticMarkup(
      <ServerSettingsOverlay
        currentUserId="user-1"
        detail={detailFixture()}
        onOpenDeleteServer={() => undefined}
        open={false}
        uploadthingEnabled
      />,
    );

    assert.equal(html, "");
  });
});

describe("sunucu ayarları kabuğu — dosya sözleşmesi", () => {
  const overlay = readFileSync(join(here, "server-settings-overlay.tsx"), "utf8");

  it("dokuz bölümün dokuzu da `lazy` sınırının ardında", () => {
    for (const section of SERVER_SETTINGS_SECTIONS) {
      assert.match(
        overlay,
        new RegExp(`sections/${section.id}-section`, "u"),
        `${section.id} bölümü lazy haritasında yok`,
      );
    }

    // Dokuz `lazySection` çağrısı; onuncu bir statik `import` sızmamalı.
    assert.equal(overlay.match(/lazySection\(/gu)?.length, SERVER_SETTINGS_SECTIONS.length + 1);
    assert.equal(/^import .*sections\//mu.test(overlay), false);
  });

  it("her bölümün kendi Skeleton'u var (PROMPT §11)", () => {
    const skeletons = readFileSync(join(here, "section-skeletons.tsx"), "utf8");

    for (const section of SERVER_SETTINGS_SECTIONS) {
      const name = `${section.id.charAt(0).toUpperCase()}${section.id.slice(1)}SectionSkeleton`;
      assert.match(skeletons, new RegExp(`export function ${name}\\b`, "u"), name);
      assert.match(overlay, new RegExp(`Skeleton: ${name}`, "u"), name);
    }

    assert.match(overlay, /<Suspense fallback=\{<active\.Skeleton \/>\}>/u);
  });

  it("katman yığınından geçer, kendi z-index'ini yazmaz (K11)", () => {
    assert.match(overlay, /kind: "settings"/u);
    assert.match(overlay, /zIndex: settingsLayer\.zIndex/u);
    assert.equal(/z-\[\d+\]/u.test(overlay), false);
  });

  it("kaydetme göstergesi sahte gecikme taşımaz", () => {
    // `saveState` doğrudan mutation'dan; kabukta zamanlayıcı yok.
    assert.equal(/setTimeout/u.test(overlay), false);
    assert.match(overlay, /data-testid="server-settings-saved-indicator"/u);
  });
});

describe("Görünürlük ve Keşfet (§8.2)", () => {
  it("üç satırı ve etiket seçicisini çizer", () => {
    const html = render(<VisibilitySection {...sectionProps(detailFixture(), draftFixture())} />);

    assert.match(html, /data-testid="server-settings-server-type-row"/u);
    assert.match(html, /data-testid="server-settings-is-public-toggle"/u);
    assert.match(html, /data-testid="server-settings-discoverable-toggle"/u);
    assert.match(html, /data-testid="server-settings-discovery-tags"/u);
  });

  it("herkese açık değilken listeleme kapalı ve nedeni yazılı", () => {
    const html = render(
      <VisibilitySection {...sectionProps(detailFixture(), draftFixture({ isPublic: false }))} />,
    );

    assert.ok(html.includes(copy("server.settings.visibility.discoverableRequiresPublic")));
    // 00 §8: `aria-disabled`, `disabled` değil — kapalı kontrol klavye gezinmesinden düşmez.
    assert.match(html, /aria-disabled="true"/u);
    assert.equal(html.includes("<button disabled"), false);
    assert.ok(html.includes("cursor-not-allowed"));
  });

  it("herkese açıkken listeleme açılabilir ve açıklaması değişir", () => {
    const html = render(
      <VisibilitySection {...sectionProps(detailFixture(), draftFixture({ isPublic: true }))} />,
    );

    assert.ok(html.includes(copy("server.settings.visibility.discoverableDescription")));
    assert.equal(
      html.includes(copy("server.settings.visibility.discoverableRequiresPublic")),
      false,
    );
  });

  it("satır ölçüsünü sözlükten alır — 13/15 · r16 · ikon 32", () => {
    const { settingsSections } = SERVER_METRICS;
    const html = render(<VisibilitySection {...sectionProps(detailFixture(), draftFixture())} />);

    assert.ok(html.includes(`border-radius:${pxToRem(settingsSections.visibilityRowRadius)}`));
    assert.ok(
      html.includes(
        `padding:${pxToRem(settingsSections.visibilityRowPaddingY)} ${pxToRem(
          settingsSections.visibilityRowPaddingX,
        )}`,
      ),
    );
    assert.ok(html.includes(`width:${pxToRem(settingsSections.visibilityIconSize)}`));
    assert.ok(html.includes(`opacity:${settingsSections.visibilityRowDisabledOpacity}`));
  });

  it("topluluk sunucusunda iki anahtar da kapalı ve nedeni yazılı", () => {
    const detail = detailFixture({ server: { type: "COMMUNITY" } });
    const html = render(<VisibilitySection {...sectionProps(detail, draftFixture())} />);

    assert.match(html, /data-testid="server-settings-visibility-community-notice"/u);
    assert.equal(html.match(/aria-disabled="true"/gu)?.length, 2);
  });
});

describe("İçerik ve Mesajlaşma (§8.3)", () => {
  const html = render(
    <ContentSection
      {...sectionProps(
        detailFixture(),
        draftFixture({ deletedMessageNoticeMinutes: 60, slowModeDelay: 300 }),
      )}
    />,
  );

  it("iki anahtar satırının testid'i korunur (e2e sözleşmesi)", () => {
    assert.match(html, /data-testid="server-media-gifs-toggle"/u);
    assert.match(html, /data-testid="server-media-files-toggle"/u);
  });

  it("üç seçenek grubunu çizer", () => {
    assert.match(html, /data-testid="server-settings-message-limit"/u);
    assert.match(html, /data-testid="server-settings-deleted-notice"/u);
    assert.match(html, /data-testid="server-settings-slow-mode"/u);
  });

  it("`Yakında` etiketi yok — yavaş mod gerçek bir ayar", () => {
    assert.equal(/Yakında/u.test(html), false);
    assert.equal(html.match(/role="radiogroup"/gu)?.length, 3);
  });

  it("yavaş modun on iki seçeneği kanal penceresiyle aynı sözlükten gelir", () => {
    assert.ok(html.includes(copy("server.channel.slowMode.off")));
    // 300 sn = `5 dk`; etiket `server.channel.slowMode.minutes` şablonundan geliyor.
    assert.equal(selectedChipLabel(html, "server-settings-slow-mode"), "5 dk");
  });

  it("K7 — kayıtlı 60 dakika seçili gelir, SPEC'in 15'i dayatılmaz", () => {
    assert.equal(selectedChipLabel(html, "server-settings-deleted-notice"), "1 saat");
  });

  it("kart ölçüsünü sözlükten alır — 15 · r16", () => {
    const { settingsSections } = SERVER_METRICS;

    assert.ok(html.includes(`border-radius:${pxToRem(settingsSections.contentCardRadius)}`));
    assert.ok(
      html.includes(
        `padding:${pxToRem(settingsSections.contentCardPadding)} ${pxToRem(
          settingsSections.contentCardPadding,
        )}`,
      ),
    );
  });
});

/**
 * Ş14 — §11'in `<1024` tek kolon kırılımı.
 *
 * Kırılım CSS'te yaşıyor (`buildServerSingleColumnCss`), yani `renderToStaticMarkup` onu
 * *uygulayamaz*; ölçülebilen şey kabuğun kuralın tutamağını gerçekten takıp takmadığı.
 * Kuralın kendisi `lib/servers/shell-layout.test.ts`te, gerçek kolon sırası
 * `e2e/specs/design/server-parity.spec.ts` → "§11 · kırılımlar"ta.
 */
describe("sunucu ayarları kabuğu — tek kolon kırılımı (§11)", () => {
  const overlay = readFileSync(join(here, "server-settings-overlay.tsx"), "utf8");

  it("üç tutamağı da takar ve kuralı sözlükten okur", () => {
    assert.match(overlay, /SERVER_SINGLE_COLUMN_ATTRIBUTE\]: "shell"/u);
    assert.match(overlay, /SERVER_SINGLE_COLUMN_ATTRIBUTE\]: "aside"/u);
    assert.match(overlay, /SERVER_SINGLE_COLUMN_ATTRIBUTE\]: "main"/u);
    assert.match(overlay, /buildServerSingleColumnCss\(\)/u);
  });

  it("kırılımı Tailwind'in `rem` tabanlı `md:`/`lg:`'ine bırakmaz", () => {
    // `md:flex-row` kabuğu 768'de kırardı (SPEC 1024 diyor); `lg:` ise `64rem`'dir ve kabuk
    // kökü büyüttüğünde kayar. İkisi de kaplamanın kolon sınıflarında olmamalı.
    assert.equal(
      /className="flex h-full w-full flex-col overflow-hidden border md:flex-row"/u.test(overlay),
      false,
    );
    assert.equal(/md:w-\[var\(--server-settings-nav-width\)\]/u.test(overlay), false);
  });
});
