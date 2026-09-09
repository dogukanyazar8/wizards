import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { SETTINGS_TABS_BY_SECTION } from "@/lib/settings/navigation";
import {
  buildSettingsSearchIndex,
  normalizeSettingsSearchText,
  type SettingsTranslator,
} from "@/lib/settings/search-index";
import { SETTINGS_TREE_COUNTS, walkSettingsRows } from "@/lib/settings/tree";

/**
 * Ş4 §B. İndeks ağaçtan üretiliyor mu, ürettiği her hedef gerçek mi, Türkçe normalizasyon
 * `I`/`İ` ikilisini kapatıyor mu.
 */

const TR: Record<string, string> = TR_MESSAGES;
const t: SettingsTranslator = (key) => TR[key] ?? key;

describe("Türkçe normalizasyon (§6)", () => {
  it("üç yazımı tek dizeye indirir", () => {
    const expected = normalizeSettingsSearchText("bildirim");

    assert.equal(normalizeSettingsSearchText("Bİldİrİm"), expected);
    assert.equal(normalizeSettingsSearchText("BILDIRIM"), expected);
    assert.equal(normalizeSettingsSearchText("Bildirim"), expected);
  });

  it("`İ` küçültmesinin bıraktığı birleşik noktayı düşürür", () => {
    // Tuzağın kendisi: locale'siz küçültme `i` + U+0307 üretir.
    const naive = "İ".toLowerCase();

    assert.notEqual(naive, "i", "ortam beklenenden farklı davranıyor");
    assert.equal(normalizeSettingsSearchText(naive), "i");
  });

  it("`I` yerine `ı` üretip orada bırakmaz", () => {
    assert.equal(normalizeSettingsSearchText("ISIK"), "isik");
    assert.equal(normalizeSettingsSearchText("ışık"), "isik");
  });

  it("Türkçe harfleri ASCII karşılığına katlar", () => {
    assert.equal(normalizeSettingsSearchText("ÇÖĞÜŞİ"), "cogusi");
  });

  it("baştaki, sondaki ve tekrar eden boşlukları toplar", () => {
    assert.equal(normalizeSettingsSearchText("  Sessiz   saatler  "), "sessiz saatler");
  });
});

describe("indeks üretimi (sapma #7)", () => {
  const index = buildSettingsSearchIndex(t);

  it("169 satırın tamamı için kayıt üretir", () => {
    assert.equal(index.length, SETTINGS_TREE_COUNTS.rows);
  });

  it("kayıt sırası ağacın sırasıdır", () => {
    const treeKeys = [...walkSettingsRows()].map(({ row, section }) => `${section.key}:${row.key}`);

    assert.deepEqual(
      index.map((entry) => `${entry.section}:${entry.rowKey}`),
      treeKeys,
    );
    assert.deepEqual(
      index.map((entry) => entry.order),
      index.map((_, position) => position),
    );
  });

  it("hiçbir kayıt var olmayan sekmeye götürmez", () => {
    for (const entry of index) {
      const tabs = SETTINGS_TABS_BY_SECTION[entry.section];

      assert.ok(tabs, `bilinmeyen bölüm: ${entry.section}`);
      assert.ok(
        tabs.includes(entry.tab),
        `${entry.rowKey} → ${entry.section}/${entry.tab} diye bir sekme yok`,
      );
    }
  });

  it("her kaydın gösterilebilir bir başlığı vardır", () => {
    for (const entry of index) {
      assert.notEqual(entry.titleKey, "", `${entry.rowKey} başlıksız`);
      assert.notEqual(entry.title, "", `${entry.rowKey} başlığı sözlükte yok`);
    }
  });

  it("başlığı olmayan `custom` satırında grup ya da sekme etiketine düşer", () => {
    const hero = index.find((entry) => entry.rowKey === "hero");

    assert.ok(hero);
    // Profil hero grubu başlıksızdır (sapma #8): geriye sekme etiketi kalır.
    assert.equal(hero.titleKey, "settings.tab.account.profile");
  });

  it("haystack başlık, açıklama, grup başlığı ve seçenekleri birleştirir", () => {
    const entry = index.find((candidate) => candidate.rowKey === "nd2");

    assert.ok(entry);
    assert.equal(entry.section, "notifications");
    assert.equal(entry.tab, "general");
    assert.ok(entry.haystack.includes(entry.title));
    assert.ok(entry.group.length > 0);
    assert.ok(entry.haystack.includes(entry.group));
    assert.ok(entry.options.length > 0);
    assert.ok(entry.haystack.includes(entry.options));
  });

  it("sözlükte karşılığı olmayan anahtarı metin saymaz", () => {
    const missing = buildSettingsSearchIndex((key) =>
      key.startsWith("settings.row.") ? "gerçek metin" : key,
    );

    for (const entry of missing) {
      assert.ok(!entry.haystack.includes("settings."), "çözülmemiş anahtar haystack'e sızdı");
    }
  });

  it("statik `SET_HITS` dizisi üretim kodunda yok (sapma #7)", () => {
    const offenders: string[] = [];

    for (const root of ["lib/settings", "components/settings"]) {
      const directory = fileURLToPath(new URL(`../../${root}`, import.meta.url));

      if (!existsSync(directory)) continue;

      for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
        if (!file.isFile() || !/\.tsx?$/u.test(file.name)) continue;
        // Testler ve yorumlar adı **anmak** zorunda: sapmanın kendisi bu dizinin
        // kullanılmadığını söylüyor. Aranan şey koda girmiş bir tanımlayıcı.
        if (/\.test\.tsx?$/u.test(file.name)) continue;

        const full = join(file.parentPath ?? directory, file.name);
        // Yorumlardan **ve** dizelerden arındırılır: sapma kaydının kendisi adı bir dize
        // olarak taşımak zorunda (`metrics.ts` içindeki `SPEC_DEVIATIONS`). Yasak olan,
        // koda girmiş bir tanımlayıcı.
        const code = readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//gu, " ")
          .replace(/\/\/[^\n]*/gu, " ")
          .replace(/"(?:[^"\\\n]|\\.)*"/gu, '""')
          .replace(/'(?:[^'\\\n]|\\.)*'/gu, "''")
          .replace(/`(?:[^`\\]|\\.)*`/gu, "``");

        if (/\bSET_HITS\b/u.test(code)) offenders.push(full);
      }
    }

    assert.deepEqual(offenders, []);
  });
});
