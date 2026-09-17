import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PROFILE_BIO_MAX_LENGTH } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  renderSettingsTab,
  splitSettingsGroup,
} from "@/components/settings/rows/render-settings-tab";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_TABS_BY_SECTION, type SettingsSection } from "@/lib/settings/navigation";
import {
  SETTINGS_SHARED_ROW_KEYS,
  SETTINGS_TREE,
  SETTINGS_TREE_COUNTS,
  findSettingsTab,
  walkSettingsRows,
} from "@/lib/settings/tree";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";

/**
 * Ş6 §6 — ağaçtan çizim.
 *
 * Bu dosyanın işi tek soruya kesin cevap vermek: **Ağaçtaki tüm satırlar çiziliyor mu?** Ağaç
 * üzerinden taranıyor, tek tek elle sayılmıyor; bir satır eklendiğinde bu test onu kendiliğinden
 * kapsar. Elle yazılmış bir liste, ağaç değiştiğinde sessizce eskiyen bir liste olurdu.
 */

const MESSAGES = getMessagesForLocale("tr");

it("renders the gated 4K option disabled with an explanation while keeping lower tiers enabled", () => {
  const markup = renderTab("av", "screen-share", { disabledOptions: { e1: [3] } });
  const buttons = [...markup.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
  assert.match(
    buttons.find((button) => button.includes('data-testid="setting-segment-e1-3"')) ?? "",
    /disabled=""/,
  );
  assert.doesNotMatch(
    buttons.find((button) => button.includes('data-testid="setting-segment-e1-0"')) ?? "",
    / disabled=""/,
  );
  assert.ok(markup.includes(MESSAGES["settings.option.e1.4.disabled"] ?? "missing-copy"));
});

function renderTab(
  section: SettingsSection,
  tab: string,
  runtime: Partial<SettingsRowRuntime> = {},
): string {
  const store = new SettingsValueStore({ write: async () => {} });
  const full: SettingsRowRuntime = {
    data: {},
    disabledRows: {},
    onAction: () => {},
    onJump: () => {},
    onNavigate: () => {},
    onSoundPreview: () => {},
    openRisky: null,
    openSelect: null,
    riskyBodies: {},
    setOpenRisky: () => {},
    setOpenSelect: () => {},
    ...runtime,
  };

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <SettingsValueContext.Provider value={store}>
          <SettingsRowRuntimeContext.Provider value={full}>
            {renderSettingsTab(section, tab as never)}
          </SettingsRowRuntimeContext.Provider>
        </SettingsValueContext.Provider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  client.clear();
  return markup;
}

describe("renderSettingsTab — tüm ayar satırları", () => {
  it("her sekme hatasız çiziliyor", () => {
    for (const section of Object.keys(SETTINGS_TABS_BY_SECTION) as SettingsSection[]) {
      for (const tab of SETTINGS_TABS_BY_SECTION[section]) {
        const markup = renderTab(section, tab);

        assert.ok(markup.length > 0, `${section}/${tab} boş çizildi`);
      }
    }
  });

  it("her satır kendi `data-setting-row` niteliğiyle çıkıyor", () => {
    let drawn = 0;
    const missing: string[] = [];

    for (const section of SETTINGS_TREE) {
      for (const tab of section.tabs) {
        const markup = renderTab(section.key, tab.key);

        for (const group of tab.groups) {
          for (const row of group.rows) {
            if (markup.includes(`data-setting-row="${row.key}"`)) {
              drawn += 1;
            } else {
              missing.push(`${section.key}/${tab.key}/${row.key}`);
            }
          }
        }
      }
    }

    assert.deepEqual(missing, []);
    assert.equal(drawn, SETTINGS_TREE_COUNTS.rows);
  });

  it("on üç kontrol tipinin hepsi en az bir kez çizildi", () => {
    const byType = new Map<string, { section: SettingsSection; tab: string }>();

    for (const { row, section, tab } of walkSettingsRows()) {
      if (!byType.has(row.type)) {
        byType.set(row.type, { section: section.key, tab: tab.key });
      }
    }

    assert.equal(byType.size, SETTINGS_TREE_COUNTS.controlTypes);
    assert.equal(byType.size, 13);

    for (const [type, where] of byType) {
      const markup = renderTab(where.section, where.tab);

      assert.ok(markup.length > 0, `${type} çizilemedi`);
    }
  });

  it("bilinmeyen sekme `null` dönüyor, patlamıyor", () => {
    assert.equal(renderSettingsTab("account", "olmayan-sekme" as never), null);
  });
});

describe("renderSettingsTab — tek kontrol ekseni (PROMPT §3)", () => {
  /**
   * Eksen bir piksel değeri değil, bir yapı: her kontrol yuvası aynı sınıf dizesini taşır,
   * büyümez ve sol kolonun **kardeşi** olarak satırın sonunda durur. Üçü birden tuttuğu sürece
   * 38 px anahtar ile 260 px input aynı sağ kenarda biter.
   */
  const SLOT =
    '<div class="flex min-w-0 max-w-full shrink-0 items-center justify-end [&amp;&gt;*]:max-w-full" data-setting-control=';

  it("her sekmedeki her kontrol yuvası aynı sınıf sözleşmesini taşıyor", () => {
    const offenders: string[] = [];

    for (const section of SETTINGS_TREE) {
      for (const tab of section.tabs) {
        const markup = renderTab(section.key, tab.key);
        const slots = markup.match(/<div class="[^"]*" data-setting-control="[^"]+"/gu) ?? [];

        for (const slot of slots) {
          if (!slot.startsWith(SLOT)) {
            offenders.push(`${section.key}/${tab.key}: ${slot}`);
          }
        }
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("her kontrol yuvası sol kolondan sonra çiziliyor", () => {
    for (const section of SETTINGS_TREE) {
      for (const tab of section.tabs) {
        const markup = renderTab(section.key, tab.key);
        let cursor = 0;

        for (;;) {
          const slot = markup.indexOf('data-setting-control="', cursor);

          if (slot < 0) break;

          const label = markup.lastIndexOf('class="min-w-0 flex-1 [overflow-wrap:anywhere]"', slot);

          assert.ok(
            label >= 0 && label < slot,
            `${section.key}/${tab.key}: kontrol yuvası sol kolondan önce`,
          );
          cursor = slot + 1;
        }
      }
    }
  });

  it("kontrol yuvası olan satırlar gerçekten var", () => {
    const markup = renderTab("notifications", "general");

    assert.ok((markup.match(/data-setting-control="/gu)?.length ?? 0) > 3);
  });
});

describe("renderSettingsTab — kontrol seçimi ağaçtan", () => {
  it('anahtar satırı `role="switch"`, menü satırı `listbox` düğmesi', () => {
    const markup = renderTab("notifications", "general");

    assert.ok(markup.includes('role="switch"'));
    assert.ok(markup.includes('aria-haspopup="listbox"'));
  });

  it("kilitli iki satır `aria-disabled` ve `Kilitli` pili taşıyor", () => {
    const markup = renderTab("notifications", "types");

    assert.equal(markup.match(/aria-disabled="true"/gu)?.length, 2);
    assert.equal(markup.match(/Kilitli/gu)?.length, 2);
  });

  it("`pu` satırı `@` öneki taşıyor, değere karışmıyor", () => {
    const markup = renderTab("account", "profile");

    assert.ok(markup.includes(">@<"));
    assert.ok(!markup.includes('value="@'));
  });

  it("`pbio` sayacı ortak profil sınırıyla çiziliyor", () => {
    assert.ok(renderTab("account", "profile").includes(`0 / ${PROFILE_BIO_MAX_LENGTH}`));
  });

  it("`pp` menüsü durum noktalarını token adından alıyor", () => {
    const markup = renderTab("account", "profile", { openSelect: "pp" });

    assert.ok(markup.includes("hsl(var(--success))"));
    assert.ok(markup.includes("hsl(var(--warning))"));
    assert.ok(markup.includes("hsl(var(--danger))"));
    assert.ok(markup.includes("hsl(var(--text-muted))"));
  });

  it("ses satırı anahtarı sağ eksende, şeridi altta çiziyor", () => {
    const markup = renderTab("notifications", "sounds");

    assert.ok(markup.includes('role="switch"'));
    assert.ok(markup.includes("Seviye"));
    assert.ok(markup.includes("Önizle"));
  });
});

describe("renderSettingsTab — aynı anda tek menü, tek riskli blok (tuzak #12)", () => {
  it("iki menü birden açılamıyor", () => {
    const markup = renderTab("account", "profile", { openSelect: "pp" });

    assert.equal(markup.match(/role="listbox"/gu)?.length, 1);
    assert.equal(markup.match(/aria-expanded="true"/gu)?.length, 1);
  });

  it("hiçbir menü açık değilken liste hiç çizilmiyor", () => {
    const markup = renderTab("account", "profile");

    assert.ok(!markup.includes('role="listbox"'));
  });

  it("tek riskli blok gövdesi açılıyor", () => {
    const markup = renderTab("account", "account", {
      openRisky: "password",
      riskyBodies: { apw: <div data-testid="pw-body">parola gövdesi</div> },
    });

    assert.ok(markup.includes("parola gövdesi"));
    assert.equal(markup.match(/aria-expanded="true"/gu)?.length, 1);
  });

  it("e-posta ve telefon düzenleyicileri kendi eylem satırının altında açılır", () => {
    for (const [key, block] of [
      ["ae", "email"],
      ["ap", "phone"],
    ] as const) {
      const markup = renderTab("account", "account", {
        openRisky: block,
        riskyBodies: { [key]: <input data-testid="contact-inline-field" /> },
      });
      assert.ok(markup.includes(`id="setting-risky-${key}"`));
      assert.match(
        markup,
        new RegExp(
          `aria-controls="setting-risky-${key}"[^>]*aria-expanded="true"[^>]*data-testid="setting-actions-${key}-0"`,
          "u",
        ),
      );
      assert.ok(markup.includes('data-testid="contact-inline-field"'));
      assert.equal(markup.match(/aria-expanded="true"/gu)?.length, 1);
    }
  });

  it("kapalı riskli blokta gövde çizilmiyor", () => {
    const markup = renderTab("account", "account", {
      riskyBodies: { apw: <div>parola gövdesi</div> },
    });

    assert.ok(!markup.includes("parola gövdesi"));
  });
});

describe("renderSettingsTab — paylaşılan anahtarlar (tuzak #4)", () => {
  it("beş anahtar iki sekmede de aynı değeri gösteriyor", () => {
    const store = new SettingsValueStore({ write: async () => {} });
    const runtime: SettingsRowRuntime = {
      data: {},
      disabledRows: {},
      onAction: () => {},
      onJump: () => {},
      onNavigate: () => {},
      onSoundPreview: () => {},
      openRisky: null,
      openSelect: null,
      riskyBodies: {},
      setOpenRisky: () => {},
      setOpenSelect: () => {},
    };

    const draw = (tab: string) =>
      renderToStaticMarkup(
        <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
          <SettingsValueContext.Provider value={store}>
            <SettingsRowRuntimeContext.Provider value={runtime}>
              {renderSettingsTab("notifications", tab as never)}
            </SettingsRowRuntimeContext.Provider>
          </SettingsValueContext.Provider>
        </LocaleProvider>,
      );

    // `nq1` Genel'de açık başlar; kapatınca ayrıntı sekmesi de kapalı görmeli.
    assert.ok(draw("general").includes('aria-checked="true"'));
    store.setValue("nq1", false);

    const general = draw("general");
    const quiet = draw("quiet-hours");

    const readNq1 = (markup: string) => {
      const index = markup.indexOf('data-testid="setting-toggle-nq1"');
      assert.ok(index >= 0, "nq1 anahtarı çizilmemiş");

      return markup.slice(Math.max(0, index - 400), index).includes('aria-checked="false"');
    };

    assert.ok(readNq1(general), "Genel sekmesi yeni değeri göstermiyor");
    assert.ok(readNq1(quiet), "Sessiz saatler sekmesi hizalanmamış");
  });

  it("beş paylaşılan anahtar gerçekten iki sekmede", () => {
    for (const key of SETTINGS_SHARED_ROW_KEYS) {
      const tabs = [...walkSettingsRows()].filter(({ row }) => row.key === key);

      assert.equal(tabs.length, 2, `${key} iki sekmede olmalı`);
    }
  });
});

describe("renderSettingsTab — unavailable satırlar", () => {
  const assertControlDisabled = (markup: string, testId: string) => {
    const element = new RegExp(
      `<(?:button|div|input|textarea)[^>]*(?:aria-disabled="true"|disabled="")[^>]*data-testid="${testId}"|<(?:button|div|input|textarea)[^>]*data-testid="${testId}"[^>]*(?:aria-disabled="true"|disabled="")`,
      "u",
    );

    assert.match(markup, element, `${testId} etkileşime açık kaldı`);
  };

  it("motor her yazılabilir kontrol tipinde disabledRows kararını uygular", () => {
    const accountProfile = renderTab("account", "profile", {
      disabledRows: { pbio: true, pe: true, pn: true, pp: true },
    });
    const appearanceText = renderTab("appearance", "text", {
      disabledRows: { m2: true, m3: true },
    });
    const notificationSounds = renderTab("notifications", "sounds", {
      disabledRows: { ns2: true },
    });
    const desktopOverlay = renderTab("desktop", "overlay", {
      disabledRows: { z7: true },
    });

    assertControlDisabled(accountProfile, "setting-input-pn");
    assertControlDisabled(accountProfile, "setting-textarea-pbio");
    assertControlDisabled(accountProfile, "setting-select-pp");
    assertControlDisabled(appearanceText, "setting-segment-m3");
    assertControlDisabled(appearanceText, "setting-slider-m2");
    assertControlDisabled(notificationSounds, "setting-toggle-ns2");
    assertControlDisabled(notificationSounds, "setting-sound-ns2");
    assertControlDisabled(desktopOverlay, "setting-nav-z7");
  });
});

describe("splitSettingsGroup — sapma #9", () => {
  const t = (key: string) => (MESSAGES as Record<string, string>)[key] ?? key;

  it("`ne1` kendi `Varsayılanlar` grubuna iniyor", () => {
    const tab = findSettingsTab("notifications", "exceptions");
    assert.ok(tab);

    const group = tab.groups[0];
    assert.ok(group);

    const rendered = splitSettingsGroup(group, t);

    assert.equal(rendered.length, 2);
    assert.equal(rendered[0]?.title, "Aktif istisnalar");
    assert.deepEqual(
      rendered[0]?.rows.map((row) => row.key),
      ["ne0"],
    );
    assert.equal(rendered[1]?.title, "Varsayılanlar");
    assert.deepEqual(
      rendered[1]?.rows.map((row) => row.key),
      ["ne1"],
    );
  });

  it("ana başlık iki kez çizilmiyor", () => {
    const markup = renderTab("notifications", "exceptions");
    const occurrences = markup.match(/Aktif istisnalar/gu)?.length ?? 0;

    assert.equal(occurrences, 1);
    assert.ok(markup.includes("Varsayılanlar"));
  });

  it("bayrak taşımayan grup tek kap kalıyor", () => {
    const tab = findSettingsTab("account", "profile");
    assert.ok(tab);

    for (const group of tab.groups) {
      assert.equal(splitSettingsGroup(group, t).length, 1);
    }
  });

  it("başlıksız grup başlıksız kalıyor (sapma #8)", () => {
    const tab = findSettingsTab("account", "profile");
    const hero = tab?.groups[0];
    assert.ok(hero);

    assert.equal(splitSettingsGroup(hero, t)[0]?.title, undefined);
  });

  it("ağaçta yalnız bir satır bu bayrağı taşıyor", () => {
    const flagged = [...walkSettingsRows()].filter(({ row }) => row.ownGroupTitleKey);

    assert.deepEqual(
      flagged.map(({ row }) => row.key),
      ["ne1"],
    );
  });
});
