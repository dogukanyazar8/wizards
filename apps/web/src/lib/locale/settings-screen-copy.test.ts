import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";
import { collectSettingsCopyKeys } from "@/lib/settings/tree";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * "Bildirimler + Ayarlar pencereleri" paketinin metin sözleşmesi.
 *
 * Bu dosya bir tablo **taşımaz**: referans HTML'in içindeki `SET` dizisini okur ve
 * aktif i18n anahtarlarına eşleyerek başlık, açıklama, seçenek ve düğme metinlerini
 * karşılaştırır. Onaylı ürün değişiklikleri açık bir fark listesiyle korunur; bölüm
 * taşıma veya satır kaldırma diğer metinlerin denetimini kaydırmaz.
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

// Section/tab moves must not align unrelated copy by array position.
const SECTION_KEYS: Record<string, string> = {
  account: "account",
  av: "av",
  look: "appearance",
  notif: "notifications",
  desktop: "desktop",
  about: "about",
};
const TAB_KEYS: Record<string, string> = {
  profil: "profile",
  hesap: "account",
  gizlilik: "privacy",
  guvenlik: "security",
  rozetler: "badges",
  veriler: "data",
  ses: "audio",
  kamera: "camera",
  ekran: "screen-share",
  tema: "theme",
  metin: "text",
  medya: "media",
  duzen: "layout",
  erisim: "accessibility",
  yuzey: "surfaces",
  turler: "types",
  sessiz: "quiet-hours",
  sesler: "sounds",
  panel: "panel",
  istisna: "exceptions",
  uygulama: "app",
  kisayol: "shortcuts",
  overlay: "overlay",
  izin: "permissions",
  guncelleme: "updates",
};

function referenceCopy(): Record<string, string> {
  const copy: Record<string, string> = {};
  const add = (key: string, value: SetValue | undefined) => {
    if (typeof value === "string" && value) copy[key] = value;
  };
  for (const sectionValue of SET) {
    const section = sectionValue as SetValue[];
    const sectionKey = SECTION_KEYS[String(section[0])];
    assert.ok(sectionKey, String(section[0]));
    add(`settings.section.${sectionKey}.label`, section[1]);
    add(`settings.section.${sectionKey}.lead`, section[2]);
    for (const tabValue of section[5] as SetValue[]) {
      const tab = tabValue as SetValue[];
      const tabKey = TAB_KEYS[String(tab[0])] ?? (sectionKey === "about" ? "about" : "general");
      add(`settings.tab.${sectionKey}.${tabKey}`, tab[1] || section[1]);
      (tab[2] as SetValue[]).forEach((groupValue, groupIndex) => {
        const group = groupValue as SetValue[];
        const groupKey = `settings.group.${sectionKey}.${tabKey}.${groupIndex + 1}`;
        add(`${groupKey}.title`, group[0]);
        add(`${groupKey}.note`, group[1]);
        for (const rowValue of group[2] as SetValue[]) {
          const row = rowValue as SetValue[];
          const rowKey = String(row[0]);
          add(`settings.row.${rowKey}.title`, row[2]);
          const descriptionKey = `settings.row.${rowKey}.description`;
          // The general and detailed quiet-hours rows intentionally use different copy.
          add(
            rowKey === "nq1" && descriptionKey in copy ? `${descriptionKey}Short` : descriptionKey,
            row[3],
          );
          add(`settings.row.${rowKey}.badge`, row[7]);
          add(`settings.row.${rowKey}.nav`, row[5]);
          if (!Array.isArray(row[6])) continue;
          const kind = ["sel", "seg"].includes(String(row[1]))
            ? "option"
            : ["act", "jump"].includes(String(row[1]))
              ? "action"
              : null;
          if (kind)
            row[6].forEach((value, index) => add(`settings.${kind}.${rowKey}.${index + 1}`, value));
          else add(`settings.row.${rowKey}.prefix`, row[6][0]);
        }
      });
    }
  }
  return copy;
}

// Reviewed product changes: native permissions/actions, live audio controls,
// game privacy, language relocation and the dedicated Updates section.
// Keep these explicit; do not derive expected copy from the implementation.
const APPROVED_COPY_CHANGES: Record<string, string> = {
  "settings.row.z1.title": "Voice Mini",
  "settings.row.z5.description":
    "Oyun overlay’inde sessiz katılımcıları gizle. Kimse konuşmadığında overlay görünmez.",
  "settings.option.px.5": "30 dakika sonra",
  "settings.action.ap.2": "Doğrulama · Yakında",
  "settings.row.g7.description":
    "Masaüstünde algılanan oyunu görünürlük tercihlerine göre paylaşır. Görünmezken paylaşılmaz.",
  "settings.row.i4.description":
    "Yalnızca mikrofon testi çalışırken açılabilir. Kulaklık kullan; test durunca kendini duyma kapanır.",
  "settings.group.av.audio.3.note":
    "Gürültü engelleme yöntemini seç; yankı ve ses düzeyini ayrıca ayarla.",
  "settings.row.p7.title": "Gürültü engelleme",
  "settings.row.p7.description":
    "Krisp arka plan gürültüsünü azaltır. Desteklenmediğinde standart işleme kullanılır.",
  "settings.option.p7.1": "Krisp (Önerilen)",
  "settings.option.p7.2": "Standart",
  "settings.option.p7.3": "Kapalı",
  "settings.row.p5.title": "Otomatik ses düzeyi",
  "settings.row.e4.description":
    "Destekleyen kaynak seçicilerde mevcut Whispr sekmesini dışlar. Tam ekran paylaşımında Whispr penceresini gizlemez. Sonraki kaynak seçiminde uygulanır.",
  "settings.row.e5.description":
    "Kaynak değiştir düğmesini açar. Tarayıcının sekme değiştirme kontrolüne ilişkin tercih, sonraki paylaşımda uygulanır.",
  "settings.action.e7.1": "Paylaşımı başlat",
  "settings.tab.appearance.language": "Dil ve bölge",
  "settings.group.notifications.exceptions.defaults.title": "Varsayılanlar",
  "settings.action.desktopApp.manage": "Masaüstü ayarlarını aç",
  "settings.row.w8.title": "Oyun etkinliği",
  "settings.row.w8.description":
    "Bu cihazdaki oyun algılamasını yönet. Paylaşım tercihi Hesabım · Gizlilik bölümünde.",
  "settings.action.z7.1": "Yönet",
  "settings.section.updates.label": "Güncelleme",
  "settings.section.updates.lead":
    "Sürüm bilgileri, yenilikler ve uygulama güncellemelerini yönet.",
  "settings.action.h1.1": "Güncellemeleri denetle",
  "settings.action.o5.1": "Görüntüle",
  "settings.action.n4.1": "Destek araçlarını aç",
  "settings.action.n4.2": "Kurtarma araçlarını aç",
  "settings.section.about.lead": "Whispr hakkında ve katkıda bulunanlar",
};

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
 * hizalı tutuluyor (aşağıdaki 167 satır testi) — ve
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

  it("aktif metinleri sabit anahtarlarla referansa ve onaylı değişikliklere bağlar", () => {
    const expected = { ...referenceCopy(), ...APPROVED_COPY_CHANGES };
    for (const key of collectSettingsCopyKeys()) {
      assert.ok(key in expected, `${key}: yeni ürün metni için sözleşme eksik`);
      assert.equal(trOf(key, key), expected[key], key);
    }
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
      .filter((key) => !owned.has(key.replace(/\.desktop$/u, "")))
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
        if (/\.test\.(ts|tsx)$/u.test(entry.name)) continue;
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
        const base = (
          key.endsWith(".desktop") && key.slice(0, -8) in TR ? key.slice(0, -8) : key
        ).replace(/_(one|other|zero|few|many|two)$/u, "");

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
      "settings.search",
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
