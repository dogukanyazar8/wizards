import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { resolveSettingsRoute } from "@/lib/settings/navigation";
import {
  buildSettingsSearchIndex,
  type SettingsSearchEntry,
  type SettingsTranslator,
} from "@/lib/settings/search-index";
import {
  buildSettingsSearchPath,
  searchSettings,
  SETTINGS_SEARCH_PATH_SEPARATOR,
} from "@/lib/settings/search";

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;
const tr: SettingsTranslator = (key) => TR[key] ?? key;
const en: SettingsTranslator = (key) => EN[key] ?? key;

const index = buildSettingsSearchIndex(tr);

function keysOf(entries: readonly SettingsSearchEntry[]): string[] {
  return entries.map((entry) => `${entry.section}:${entry.rowKey}`);
}

/** Kademeleri elle kurulmuş küçük bir indeksle sınamak için. */
function entry(overrides: Partial<SettingsSearchEntry>): SettingsSearchEntry {
  return {
    description: "",
    group: "",
    haystack: "",
    options: "",
    order: 0,
    rowKey: "x",
    section: "notifications",
    sectionLabelKey: "settings.section.notifications.label",
    tab: "general",
    tabLabelKey: "settings.tab.notifications.general",
    title: "",
    titleKey: "settings.row.x.title",
    ...overrides,
  };
}

describe("sorgu eşiği", () => {
  it("boş ve tek karakterli sorgu boş döner", () => {
    assert.deepEqual(searchSettings(index, ""), []);
    assert.deepEqual(searchSettings(index, "   "), []);
    assert.deepEqual(searchSettings(index, "b"), []);
    assert.deepEqual(searchSettings(index, " b "), []);
  });

  it("iki karakterde arama başlar", () => {
    assert.ok(searchSettings(index, "bi").length > 0);
  });

  it("limit sıfır ya da altındaysa boş döner", () => {
    assert.deepEqual(searchSettings(index, "bildirim", 0), []);
    assert.deepEqual(searchSettings(index, "bildirim", -3), []);
  });

  it("limit sonuç sayısını keser", () => {
    const all = searchSettings(index, "bildirim", 500);

    assert.ok(all.length > 3);
    assert.deepEqual(keysOf(searchSettings(index, "bildirim", 3)), keysOf(all.slice(0, 3)));
  });
});

describe("Türkçe yazım (§6)", () => {
  it("`Bİldİrİm` / `BILDIRIM` / `bildirim` aynı kümeyi bulur", () => {
    const expected = keysOf(searchSettings(index, "bildirim", 500));

    assert.ok(expected.length > 0);
    assert.deepEqual(keysOf(searchSettings(index, "Bİldİrİm", 500)), expected);
    assert.deepEqual(keysOf(searchSettings(index, "BILDIRIM", 500)), expected);
    assert.deepEqual(keysOf(searchSettings(index, "  BiLdIrIm  ", 500)), expected);
  });
});

describe("sıralama önceliği", () => {
  const ranked = [
    entry({ order: 0, rowKey: "option", options: "sessiz saatler" }),
    entry({ order: 1, rowKey: "group", group: "sessiz saatler" }),
    entry({ order: 2, rowKey: "description", description: "gece boyunca sessiz kalir" }),
    entry({ order: 3, rowKey: "inside", title: "tamsessizmod" }),
    entry({ order: 4, rowKey: "wordstart", title: "sessiz saatler" }),
  ];

  it("başlık kelime başı → başlık içi → açıklama → seçenek", () => {
    assert.deepEqual(
      searchSettings(ranked, "sessiz", 10).map((item) => item.rowKey),
      ["wordstart", "inside", "description", "option", "group"],
    );
  });

  it("kelime ortasındaki eşleşme kelime başı sayılmaz", () => {
    const middle = [
      entry({ order: 0, rowKey: "middle", title: "yansesli" }),
      entry({ order: 1, rowKey: "start", title: "ses ayarlari" }),
    ];

    assert.deepEqual(
      searchSettings(middle, "ses", 10).map((item) => item.rowKey),
      ["start", "middle"],
    );
  });

  it("noktalama ve tire kelime sınırıdır", () => {
    const bounded = [entry({ order: 0, rowKey: "dash", title: "push-bildirim" })];

    assert.deepEqual(
      searchSettings(bounded, "bildirim", 10).map((item) => item.rowKey),
      ["dash"],
    );
    // Kelime başı olduğu için sıralamada başlık-içi eşleşmenin önüne geçer.
    const mixed = [
      entry({ order: 0, rowKey: "inside", title: "genelbildirim" }),
      entry({ order: 1, rowKey: "dash", title: "push-bildirim" }),
    ];

    assert.deepEqual(
      searchSettings(mixed, "bildirim", 10).map((item) => item.rowKey),
      ["dash", "inside"],
    );
  });

  it("eşit kademede ağaçtaki sıra korunur", () => {
    const ties = [
      entry({ order: 7, rowKey: "later", title: "sessiz saatler" }),
      entry({ order: 2, rowKey: "earlier", title: "sessiz mod" }),
    ];

    assert.deepEqual(
      searchSettings(ties, "sessiz", 10).map((item) => item.rowKey),
      ["earlier", "later"],
    );
  });
});

describe("ölü hedef yok", () => {
  it("her sonuç gerçek bir bölüm/sekme çiftine gider", () => {
    const queries = ["bildirim", "sessiz", "tema", "ses", "gizlilik", "guvenlik", "surum", "panel"];
    let checked = 0;

    for (const query of queries) {
      for (const hit of searchSettings(index, query, 500)) {
        assert.deepEqual(resolveSettingsRoute(hit.section, hit.tab), {
          section: hit.section,
          tab: hit.tab,
        });
        checked += 1;
      }
    }

    assert.ok(checked > 0);
  });

  it("indeksin tamamı çözülebilir hedef taşır (169 satır)", () => {
    for (const hit of index) {
      assert.deepEqual(resolveSettingsRoute(hit.section, hit.tab), {
        section: hit.section,
        tab: hit.tab,
      });
    }
  });
});

describe("sonuç yolu", () => {
  it("`Bölüm › Grup` yolunu sözlükten kurar", () => {
    const hit = index.find((candidate) => candidate.rowKey === "nd2");

    assert.ok(hit);
    assert.equal(
      buildSettingsSearchPath(hit, tr),
      `Bildirimler${SETTINGS_SEARCH_PATH_SEPARATOR}Bildirim düzeyi`,
    );
  });

  it("grup başlıksızsa sekme etiketine düşer", () => {
    const hero = index.find((candidate) => candidate.rowKey === "hero");

    assert.ok(hero);
    assert.equal(hero.groupTitleKey, undefined);
    assert.equal(
      buildSettingsSearchPath(hero, tr),
      `${TR["settings.section.account.label"]}${SETTINGS_SEARCH_PATH_SEPARATOR}${TR["settings.tab.account.profile"]}`,
    );
  });

  it("yol sabit Türkçe metin taşımaz — dil değişince yol da değişir", () => {
    const hit = index.find((candidate) => candidate.rowKey === "nd2");

    assert.ok(hit);
    assert.notEqual(buildSettingsSearchPath(hit, en), buildSettingsSearchPath(hit, tr));
    assert.ok(
      buildSettingsSearchPath(hit, en).includes(en("settings.section.notifications.label")),
    );
  });
});
