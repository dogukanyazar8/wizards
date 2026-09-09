import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";
import { collectSettingsCopyKeys, SETTINGS_TREE } from "@/lib/settings/tree";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * "Bildirimler + Ayarlar pencereleri" paketinin metin sözleşmesi.
 *
 * Bu dosya bir tablo **taşımaz**: referans HTML'in içindeki `SET` dizisini okur ve
 * `SETTINGS_TREE` ile yan yana gezerek her başlığı, açıklamayı, pili, seçeneği ve düğme
 * etiketini karşılaştırır. Bir cümleyi kısaltan, uzatan ya da "iyileştiren" her değişiklik
 * burada kırmızı verir — spot kontrol değil, 169 ürün satırının tamamı.
 *
 * Genel sözlük denetimi (iki dilin anahtar kümesi, boş değer, çoğul) `messages.test.ts`
 * dosyasındadır.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

const reference = readDesignReference("ayarlar-paketi/referans/Ayarlar-referans.dc.html");

type SetValue = string | number | boolean | null | SetValue[];

/**
 * Referanstaki `SET` dizisinin küçük ayrıştırıcısı.
 *
 * `eval` kullanılmıyor: dize, sayı, boolean ve dizi dışında bir şey içermeyen bir literal için
 * ayrıştırıcı kırk satır, `eval` ise dosyanın geri kalanına açılan bir kapı. `P.user` gibi
 * tanımlayıcılar ikon yoludur ve metin denetimini ilgilendirmez; `null` olarak okunur.
 */
function parseSetLiteral(source: string): SetValue[] {
  const start = source.indexOf("const SET = [");
  assert.notEqual(start, -1, "referansta `const SET = [` yok");

  let index = source.indexOf("[", start);

  const skipSpace = () => {
    while (index < source.length && /\s/u.test(source[index] as string)) index += 1;
  };

  const readString = (): string => {
    const quote = source[index] as string;
    index += 1;
    let out = "";

    while (index < source.length) {
      const char = source[index] as string;

      if (char === "\\") {
        out += source[index + 1];
        index += 2;
        continue;
      }
      if (char === quote) {
        index += 1;
        return out;
      }

      out += char;
      index += 1;
    }

    throw new Error("kapanmamış dize");
  };

  const readValue = (): SetValue => {
    skipSpace();
    const char = source[index] as string;

    if (char === "[") {
      index += 1;
      const items: SetValue[] = [];

      for (;;) {
        skipSpace();
        if (source[index] === "]") {
          index += 1;
          return items;
        }
        if (source[index] === ",") {
          index += 1;
          continue;
        }
        items.push(readValue());
      }
    }

    if (char === "'" || char === '"') return readString();

    let token = "";
    while (index < source.length && !",]".includes(source[index] as string)) {
      token += source[index];
      index += 1;
    }
    token = token.trim();

    if (token === "true") return true;
    if (token === "false") return false;
    if (/^-?\d+(\.\d+)?$/u.test(token)) return Number(token);

    // `P.user` ve benzeri ikon yolları.
    return null;
  };

  const parsed = readValue();
  assert.ok(Array.isArray(parsed));
  return parsed;
}

const SET = parseSetLiteral(reference);

function trOf(key: string | undefined, context: string): string {
  assert.ok(key, `${context}: anahtar yok`);
  const value = TR[key];
  assert.ok(value !== undefined, `${context}: ${key} sözlükte yok`);
  return value;
}

/**
 * K9 — `Boşta sayılma süresi` satırı ağaçta **yok**, ürün yüzeyinde **var**.
 *
 * Karar (00 §3, K9) tercihi kullanıcı barı menüsünden Hesabım › Gizlilik › Görünürlük grubuna
 * indiriyor ve `SPEC_DEVIATIONS` #2 bunu "tasarımda olmayan tek satır" olarak kaydediyor.
 * Satır referans `SET` dizisinde geçmediği için ağaca konulamadı — ağaç `SET` ile satır satır
 * hizalı tutuluyor (aşağıdaki 169 satır testi) — ve
 * `components/settings/sections/account/privacy-tab.tsx` içinde çizim anında ekleniyor.
 *
 * Anahtarları bu yüzden "ölü" değil, **ağaç dışı**: tüketicisi belli, sahibi yazılı.
 */
const OUTSIDE_TREE_ROW_KEYS: readonly string[] = [
  "settings.row.g9.title",
  "settings.row.g9.description",
  "settings.option.g9.1",
  "settings.option.g9.2",
  "settings.option.g9.3",
  "settings.option.g9.4",
  "settings.option.g9.5",
  /*
   * `Yenilikler · {version}` — Hakkında'nın üçüncü grubu.
   *
   * Başlık çalışma zamanı **verisi** taşıyor (sürüm numarası), o yüzden ağaçta `titleKey`
   * değil `titleData` olarak duruyor ve `collectSettingsCopyKeys()` onu göremiyor. Tüketicisi
   * var ve yazılı: `components/settings/sections/about/about-page.tsx` interpolasyonu orada
   * yapıyor. `g9` ile aynı gerekçe — ölü değil, ağaç dışı.
   */
  "settings.group.about.about.3.title",
];

describe("Ayarlar metin sözleşmesi — ağaç ↔ referans SET", () => {
  it("referans altı bölüm ve 27 sekme ile okunuyor", () => {
    assert.equal(SET.length, 6);
    assert.equal(
      SET.reduce<number>(
        (total, section) => total + ((section as SetValue[])[5] as SetValue[]).length,
        0,
      ),
      27,
    );
  });

  it("bölüm adları ve alt satırları birebir", () => {
    SETTINGS_TREE.forEach((section, index) => {
      const raw = SET[index] as SetValue[];

      assert.equal(trOf(section.labelKey, `${section.key} label`), raw[1]);
      assert.equal(trOf(section.leadKey, `${section.key} lead`), raw[2]);
    });
  });

  it("sekme etiketleri birebir", () => {
    SETTINGS_TREE.forEach((section, sectionIndex) => {
      const rawTabs = (SET[sectionIndex] as SetValue[])[5] as SetValue[];

      section.tabs.forEach((tab, tabIndex) => {
        const raw = rawTabs[tabIndex] as SetValue[];
        const expected = (raw[1] as string) || ((SET[sectionIndex] as SetValue[])[1] as string);

        assert.equal(trOf(tab.labelKey, `${section.key}/${tab.key}`), expected);
      });
    });
  });

  it("grup başlıkları ve notları birebir", () => {
    SETTINGS_TREE.forEach((section, sectionIndex) => {
      const rawTabs = (SET[sectionIndex] as SetValue[])[5] as SetValue[];

      section.tabs.forEach((tab, tabIndex) => {
        const rawGroups = (rawTabs[tabIndex] as SetValue[])[2] as SetValue[];

        tab.groups.forEach((group, groupIndex) => {
          const raw = rawGroups[groupIndex] as SetValue[];
          const context = `${section.key}/${tab.key}/${groupIndex + 1}`;

          if (raw[0]) {
            if (group.titleData) return;
            assert.equal(trOf(group.titleKey, `${context} title`), raw[0]);
          } else {
            assert.equal(group.titleKey, undefined, `${context} başlığı uydurulmuş`);
          }

          if (raw[1] && !group.noteData) {
            assert.equal(trOf(group.noteKey, `${context} note`), raw[1]);
          }
        });
      });
    });
  });

  it("169 ürün satırının başlık, açıklama, pil, seçenek ve düğme metni birebir", () => {
    let checked = 0;

    SETTINGS_TREE.forEach((section, sectionIndex) => {
      const rawTabs = (SET[sectionIndex] as SetValue[])[5] as SetValue[];

      section.tabs.forEach((tab, tabIndex) => {
        const rawGroups = (rawTabs[tabIndex] as SetValue[])[2] as SetValue[];

        tab.groups.forEach((group, groupIndex) => {
          const rawRows = ((rawGroups[groupIndex] as SetValue[])[2] as SetValue[]).filter(
            (rawRow) =>
              !(
                section.key === "desktop" &&
                tab.key === "app" &&
                (rawRow as SetValue[])[0] === "w3"
              ),
          );

          group.rows.forEach((row, rowIndex) => {
            const raw = rawRows[rowIndex] as SetValue[];
            const context = `${section.key}/${tab.key}/${row.key}`;

            assert.equal(row.key, raw[0], `${context}: anahtar kaymış`);

            if (raw[2]) assert.equal(trOf(row.titleKey, `${context} title`), raw[2]);
            else assert.equal(row.titleKey, undefined, `${context}: başlık uydurulmuş`);

            if (raw[3] && !row.descriptionData) {
              assert.equal(trOf(row.descriptionKey, `${context} description`), raw[3]);
            }

            if (raw[7] && !row.badgeData) {
              assert.equal(trOf(row.badgeKey, `${context} badge`), raw[7]);
            }

            if (row.type === "select" || row.type === "segment") {
              const rawOptions = raw[6] as SetValue[];

              row.options?.forEach((optionKey, optionIndex) => {
                assert.equal(
                  trOf(optionKey, `${context} option ${optionIndex + 1}`),
                  rawOptions[optionIndex],
                );
              });
            }

            if (row.type === "action" || row.type === "jump") {
              const rawActions = raw[6] as SetValue[];

              row.actions?.forEach((action, actionIndex) => {
                if (row.key === "q3" || row.key === "w1" || row.key === "w2") {
                  // SPEC_DEVIATIONS #13 — uzak WebView ayrıcalıklı kısayol mutasyonu yapmaz;
                  // referansın Kaydet/Sıfırla çifti güvenilir Desktop Control geçişine iner.
                  assert.equal(actionIndex, 0);
                  assert.equal(
                    trOf(action.labelKey, `${context} action ${actionIndex + 1}`),
                    "Masaüstü Denetimi'nde yönet",
                  );
                  return;
                }

                assert.equal(
                  trOf(action.labelKey, `${context} action ${actionIndex + 1}`),
                  rawActions[actionIndex],
                );
              });
            }

            if (row.type === "nav") {
              assert.equal(trOf(row.navLabelKey, `${context} nav`), raw[5]);
            }

            if (row.prefixKey) {
              assert.equal(trOf(row.prefixKey, `${context} prefix`), (raw[6] as SetValue[])[0]);
            }

            checked += 1;
          });
        });
      });
    });

    assert.equal(checked, 169);
  });

  it("SPEC_DEVIATIONS #9 — `Varsayılanlar` başlığı kararın kendisinden geliyor", () => {
    // Referansta yok; PLAN §4'ün dokuzuncu sapması bu grubun adını veriyor. Satır metni
    // ("Yeni istisnalar için geçici sessize alma") **değişmedi**, yalnız üstüne başlık geldi.
    assert.equal(TR["settings.group.notifications.exceptions.defaults.title"], "Varsayılanlar");
    assert.ok(!reference.includes("'Varsayılanlar'"));
    assert.ok(reference.includes("'Yeni istisnalar için geçici sessize alma'"));
  });
});

describe("Ayarlar metin sözleşmesi — sözlük bütünlüğü", () => {
  const treeKeys = collectSettingsCopyKeys();

  it("ağacın her anahtarı iki dilde de var", () => {
    const missingTr = treeKeys.filter((key) => !(key in TR)).sort();
    const missingEn = treeKeys.filter((key) => !(key in EN)).sort();

    assert.deepEqual(missingTr, []);
    assert.deepEqual(missingEn, []);
  });

  it("ağacın hiçbir anahtarı boş değil", () => {
    const empty = treeKeys.filter((key) => !TR[key]?.trim() || !EN[key]?.trim());

    assert.deepEqual(empty, []);
  });

  it("ağaç önekleri altında ölü anahtar yok", () => {
    // Bu altı önek **tamamen** ağaçtan üretilir. Sözlükte ağacın istemediği bir anahtar
    // kalırsa, onu çizen bir satır yok demektir.
    const owned = new Set([...treeKeys, ...OUTSIDE_TREE_ROW_KEYS]);
    const dead = Object.keys(TR)
      .filter((key) => /^settings\.(section|tab|group|row|option|action)\./u.test(key))
      .filter((key) => !owned.has(key))
      .sort();

    assert.deepEqual(dead, []);
  });

  /**
   * Ş13 — bu iddia bir **sayaç** değil artık.
   *
   * Ş5–Ş12 boyunca `settings.block.*` ve `notif.*` anahtarlarının tüketicisi henüz yazılmamıştı
   * ve test onları sayarak "borç burada" diyordu (296 kayıt). Yirmi blok, üç popover ve altı
   * bölüm indi; borç kapandı. Sayacın yerini gerçek tarama aldı: sözlükteki her `settings.*` /
   * `notif.*` anahtarı ya ağaçtan üretiliyor ya da kaynakta adıyla geçiyor.
   *
   * Dinamik anahtarlar (`settings.userMenu.duration.${id}` gibi) şablon önekiyle tanınıyor;
   * bir şablonun ürettiği anahtar "kimse yazmıyor" sayılmamalı.
   */
  it("hiçbir `settings.*` / `notif.*` anahtarı tüketicisiz değil", () => {
    const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
    const sources: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(path);
          continue;
        }

        if (!/\.(ts|tsx)$/u.test(entry.name)) continue;
        if (path.split(sep).join("/").includes("lib/locale/messages/")) continue;

        sources.push(readFileSync(path, "utf8"));
      }
    };

    walk(sourceRoot);

    const blob = sources.join("\n");
    const dynamicPrefixes = [
      ...blob.matchAll(/["'`]((?:settings|notif)\.[A-Za-z0-9_.]*?)\$\{/gu),
    ].map((match) => match[1] as string);

    const dead = Object.keys(TR)
      .filter((key) => key.startsWith("settings.") || key.startsWith("notif."))
      .filter((key) => {
        const base = key.replace(/_(one|other|zero|few|many|two)$/u, "");

        if (treeKeys.includes(base) || OUTSIDE_TREE_ROW_KEYS.includes(base)) return false;
        if (dynamicPrefixes.some((prefix) => base.startsWith(prefix))) return false;

        return (
          !blob.includes(`"${base}"`) &&
          !blob.includes(`'${base}'`) &&
          !blob.includes("`" + base + "`")
        );
      })
      .sort();

    assert.deepEqual(dead, []);
  });

  it("iki dilin anahtar kümesi aynı", () => {
    const trKeys = Object.keys(TR).filter(
      (key) => key.startsWith("settings.") || key.startsWith("notif."),
    );
    const enKeys = Object.keys(EN).filter(
      (key) => key.startsWith("settings.") || key.startsWith("notif."),
    );

    assert.deepEqual(
      trKeys.filter((key) => !(key in EN)),
      [],
    );
    assert.deepEqual(
      enKeys.filter((key) => !(key in TR)),
      [],
    );
  });

  /**
   * Ş13 eski panelin 181 ölü anahtarını sildi; bu liste **kalanları** kilitliyor. Yeni ağacın
   * kabuğu, arama alanı ve üç grup etiketi silinen kümeye girmemeli.
   */
  it("kabuğun ve ağacın kendi `settings.*` anahtarları duruyor", () => {
    for (const key of [
      "settings.title",
      "settings.search.placeholder",
      "settings.dirty",
      "settings.saveChanges",
      "settings.discard",
      "settings.section.account.label",
      "settings.tab.notifications.quiet-hours",
      "settings.row.nq1.title",
    ]) {
      assert.ok(key in TR, `${key} silinmiş`);
      assert.ok(key in EN, `${key} silinmiş`);
    }
  });
});
