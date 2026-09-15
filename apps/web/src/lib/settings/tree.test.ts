import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SETTINGS_SECTIONS,
  SETTINGS_TABS_BY_SECTION,
  type SettingsSection,
  type SettingsTab,
} from "./navigation";
import {
  collectSettingsCopyKeys,
  findSettingsTab,
  SETTINGS_LOCKED_ROW_KEYS,
  SETTINGS_SHARED_ROW_KEYS,
  SETTINGS_TAB_COUNTS,
  SETTINGS_TREE,
  SETTINGS_TREE_COUNTS,
  walkSettingsRows,
  type SettingsControlType,
  type SettingsRowDef,
} from "./tree";

const rows = [...walkSettingsRows()];
const groups = SETTINGS_TREE.flatMap((section) => section.tabs.flatMap((tab) => tab.groups));
const tabs = SETTINGS_TREE.flatMap((section) => section.tabs);

/** Aynı anahtarın geçtiği bütün yerler. */
const byKey = new Map<
  string,
  { tab: SettingsTab; section: SettingsSection; row: SettingsRowDef }[]
>();
for (const { section, tab, row } of rows) {
  byKey.set(
    row.key,
    (byKey.get(row.key) ?? []).concat([{ section: section.key, tab: tab.key, row }]),
  );
}

describe("içerik ağacı — hacim", () => {
  it("altı bölüm taşır", () => {
    assert.equal(SETTINGS_TREE.length, SETTINGS_TREE_COUNTS.sections);
    assert.deepEqual(
      SETTINGS_TREE.map((section) => section.key),
      ["account", "av", "appearance", "notifications", "desktop", "updates", "about"],
    );
  });

  it("bölüm başına sekme sayısı 6 / 3 / 5 / 7 / 5 / 1", () => {
    assert.equal(tabs.length, SETTINGS_TREE_COUNTS.tabs);

    for (const section of SETTINGS_TREE) {
      assert.equal(
        section.tabs.length,
        SETTINGS_TAB_COUNTS[section.key],
        `${section.key} sekme sayısı`,
      );
    }
  });

  it("güncel grup ve satır sayılarıyla eşleşir", () => {
    assert.equal(groups.length, SETTINGS_TREE_COUNTS.groups);
    assert.equal(rows.length, SETTINGS_TREE_COUNTS.rows);
  });

  it("on üç kontrol tipinin hepsini kullanır", () => {
    const used = new Set<SettingsControlType>(rows.map(({ row }) => row.type));

    assert.equal(used.size, SETTINGS_TREE_COUNTS.controlTypes);
  });

  it("yirmi benzersiz özel blok ve üç riskli satır taşır", () => {
    const blocks = new Set(rows.map(({ row }) => row.block).filter(Boolean));
    const risky = rows.filter(({ row }) => row.type === "risky");

    assert.equal(blocks.size, SETTINGS_TREE_COUNTS.blocks);
    assert.equal(risky.length, SETTINGS_TREE_COUNTS.risky);
    assert.deepEqual(
      risky.map(({ row }) => row.riskyBlock),
      ["password", "twoFactor", "deleteAccount"],
    );
  });

  it("bölüm başına dağılımı referanstaki tabloyla aynı", () => {
    const perSection = SETTINGS_TREE.map((section) => ({
      key: section.key,
      tabs: section.tabs.length,
      groups: section.tabs.reduce((total, tab) => total + tab.groups.length, 0),
      rows: section.tabs.reduce(
        (total, tab) => total + tab.groups.reduce((sum, group) => sum + group.rows.length, 0),
        0,
      ),
    }));

    assert.deepEqual(perSection, [
      { key: "account", tabs: 6, groups: 13, rows: 27 },
      { key: "av", tabs: 3, groups: 7, rows: 21 },
      { key: "appearance", tabs: 6, groups: 9, rows: 25 },
      { key: "notifications", tabs: 7, groups: 14, rows: 50 },
      { key: "desktop", tabs: 4, groups: 6, rows: 18 },
      { key: "updates", tabs: 1, groups: 4, rows: 8 },
      { key: "about", tabs: 1, groups: 2, rows: 2 },
    ]);
  });
});

describe("içerik ağacı — rota çözücüsüyle aynı sekmeler", () => {
  it("her bölümün sekme sırası navigation.ts ile birebir", () => {
    // İki liste ayrıldığı anda `/settings/notifications/panel` ya 404 verir ya boş pencere açar.
    for (const section of SETTINGS_TREE) {
      assert.deepEqual(
        section.tabs.map((tab) => tab.key),
        [...SETTINGS_TABS_BY_SECTION[section.key]],
        `${section.key}`,
      );
    }

    assert.deepEqual(
      SETTINGS_TREE.map((section) => section.key),
      SETTINGS_SECTIONS,
    );
  });

  it("hiçbir atlama hedefi var olmayan bir sekmeye gitmiyor", () => {
    // SPEC_DEVIATIONS #7'nin kökü: referansın `SET_HITS` dizisi `notif/ozet` diye olmayan bir
    // hedef taşıyor. Ağaçtan üretilen her hedef burada doğrulanır.
    for (const { row } of rows) {
      if (!row.target) continue;

      assert.ok(
        findSettingsTab(row.target.section, row.target.tab),
        `${row.key} hedefi yok: ${row.target.section}/${row.target.tab}`,
      );
    }
  });

  it("Masaüstü bölümü koşullu, diğer beşi değil (K11)", () => {
    for (const section of SETTINGS_TREE) {
      assert.equal(section.desktopOnly === true, section.key === "desktop", section.key);
    }
  });

  it("sol navigasyonun üç grubu dolu", () => {
    const byGroup = new Map<string, string[]>();
    for (const section of SETTINGS_TREE) {
      byGroup.set(section.group, (byGroup.get(section.group) ?? []).concat([section.key]));
    }

    assert.deepEqual([...byGroup.keys()], ["user", "app", "info"]);
    assert.deepEqual(byGroup.get("user"), ["account"]);
    assert.deepEqual(byGroup.get("app"), ["av", "appearance", "notifications", "desktop"]);
    assert.deepEqual(byGroup.get("info"), ["updates", "about"]);
  });
});

describe("içerik ağacı — paylaşılan anahtarlar (tuzak #4)", () => {
  it("beş anahtar iki sekmede geçiyor ve ikisinde de aynı kontrolü çiziyor", () => {
    assert.equal(SETTINGS_SHARED_ROW_KEYS.length, SETTINGS_TREE_COUNTS.sharedRowKeys);

    for (const key of SETTINGS_SHARED_ROW_KEYS) {
      const occurrences = byKey.get(key);

      assert.ok(occurrences, `${key} ağaçta yok`);
      assert.equal(occurrences.length, 2, `${key} iki kez geçmeli`);

      const [first, second] = occurrences;
      assert.ok(first && second);
      assert.equal(first.row.type, second.row.type, `${key} tipi ayrışmış`);
      assert.deepEqual(
        first.row.defaultValue,
        second.row.defaultValue,
        `${key} varsayılanı ayrışmış`,
      );
      assert.deepEqual(first.row.sharedTabs, [second.tab]);
      assert.deepEqual(second.row.sharedTabs, [first.tab]);
    }
  });

  it("`np4` paylaşılan değil — sistem önizlemesinden ayrı bir tercihtir", () => {
    const np4 = byKey.get("np4");

    assert.equal(np4?.length, 1);
    assert.equal(np4?.[0]?.row.sharedTabs, undefined);
    // `na6` sistem bildiriminin metnini, `np4` uygulama içi kartın metnini yönetir.
    assert.ok(SETTINGS_SHARED_ROW_KEYS.includes("na6" as never));
  });

  it("`sharedTabs` yalnız o beş anahtarda var", () => {
    const carriers = rows
      .filter(({ row }) => row.sharedTabs !== undefined)
      .map(({ row }) => row.key);

    assert.deepEqual([...new Set(carriers)].sort(), [...SETTINGS_SHARED_ROW_KEYS].sort());
  });

  it("rastlantısal çakışan anahtarlar durum tutmuyor", () => {
    // `o1` / `o2` Hesabım › Güvenlik ile Hakkında'da aynı harfi taşıyor. İkisi de `custom` ya da
    // `action`; ne bir değer okur ne yazar, bu yüzden çakışma zararsızdır. Bir gün biri
    // `toggle` olursa iki ekran tek anahtarı paylaşmaya başlar — bu test o günü yakalar.
    const stateless = new Set<SettingsControlType>(["custom", "action", "risky", "nav", "jump"]);

    for (const [key, occurrences] of byKey) {
      if (occurrences.length < 2) continue;
      if (SETTINGS_SHARED_ROW_KEYS.includes(key as never)) continue;

      for (const occurrence of occurrences) {
        assert.ok(
          stateless.has(occurrence.row.type),
          `${key} iki kez geçiyor ve durum tutuyor: ${occurrence.row.type}`,
        );
      }
    }
  });
});

describe("içerik ağacı — kilitli türler (tuzak #5)", () => {
  it("`locked` yalnız nt13 ve nt14 üzerinde", () => {
    const locked = rows.filter(({ row }) => row.locked).map(({ row }) => row.key);

    assert.deepEqual(locked, [...SETTINGS_LOCKED_ROW_KEYS]);
  });

  it("kilitli satırlar `lockedToggle` çizer ve açık başlar", () => {
    for (const key of SETTINGS_LOCKED_ROW_KEYS) {
      const occurrence = byKey.get(key)?.[0];

      assert.ok(occurrence, `${key} yok`);
      assert.equal(occurrence.row.type, "lockedToggle");
      assert.equal(occurrence.row.defaultValue, true);
      assert.ok(occurrence.row.badgeKey, `${key} "Kilitli" pilini taşımıyor`);
    }
  });
});

describe("içerik ağacı — sapmaların ağaçtaki karşılığı", () => {
  it("#4 — `v7`/`x1` ve `v8`/`x5` tek durum paylaşıyor", () => {
    const stateKeyOf = (key: string) => byKey.get(key)?.[0]?.row.stateKey;

    assert.equal(stateKeyOf("v7"), "reduceMotion");
    for (const key of ["x1", "v8", "x5", "x6", "x7", "v5", "v6"])
      assert.equal(byKey.has(key), false);
  });

  it("#4 — `stateKey` taşıyan başka satır yok", () => {
    const carriers = rows.filter(({ row }) => row.stateKey).map(({ row }) => row.key);

    assert.deepEqual(carriers, ["v7"]);
  });

  it("#8 — başlıksız grup render edilebilir", () => {
    const untitled = groups.filter((group) => !group.titleKey && !group.titleData);

    assert.equal(untitled.length, 2);
    assert.deepEqual(
      untitled.map((group) => group.rows[0]?.block),
      ["hero", "about"],
    );
  });

  it("#9 — `ne1` kendi başlığını taşıyor ama grubunu terk etmiyor", () => {
    const ne1 = byKey.get("ne1")?.[0];

    assert.ok(ne1);
    assert.equal(ne1.tab, "exceptions");
    assert.equal(
      ne1.row.ownGroupTitleKey,
      "settings.group.notifications.exceptions.defaults.title",
    );
    assert.equal(groups.length, SETTINGS_TREE_COUNTS.groups);
  });
});

describe("içerik ağacı — satır sözleşmesi", () => {
  it("özel blok satırı başlık taşımaz, blok anahtarı taşır", () => {
    for (const { row } of rows) {
      if (row.type !== "custom") continue;

      assert.ok(row.block, `${row.key} blok anahtarı yok`);
      if (row.block === "profileEmoji") assert.equal(row.titleKey, "settings.row.ps.title");
      else assert.equal(row.titleKey, undefined, `${row.key} başlık taşıyor`);
    }
  });

  it("başlık taşımayan tek tip özel bloktur", () => {
    for (const { row } of rows) {
      if (row.type === "custom") continue;

      assert.ok(row.titleKey, `${row.key} başlıksız`);
    }
  });

  it("seçenekli kontroller seçenek listesi ve geçerli bir varsayılan taşır", () => {
    for (const { row } of rows) {
      if (row.type !== "select" && row.type !== "segment") continue;

      assert.ok(row.options && row.options.length > 1, `${row.key} seçenek listesi eksik`);
      assert.equal(typeof row.defaultValue, "number", `${row.key} varsayılanı yok`);
      assert.ok(
        (row.defaultValue as number) >= 0 && (row.defaultValue as number) < row.options.length,
        `${row.key} varsayılanı listenin dışında`,
      );
    }
  });

  it("kaydırıcılar min < max aralığı ve aralık içinde varsayılan taşır", () => {
    for (const { row } of rows) {
      if (row.type !== "slider") continue;

      assert.ok(row.range, `${row.key} aralığı yok`);
      const [min, max] = row.range;
      assert.ok(min < max, `${row.key} aralığı ters`);
      assert.ok(
        typeof row.defaultValue === "number" && row.defaultValue >= min && row.defaultValue <= max,
        `${row.key} varsayılanı aralığın dışında`,
      );
    }
  });

  it("ses satırları profil ve seviye varsayılanı taşır", () => {
    const sounds = rows.filter(({ row }) => row.type === "sound");

    assert.equal(sounds.length, 5);
    for (const { row } of sounds) {
      assert.ok(row.sound, `${row.key} ses varsayılanı yok`);
      assert.ok(["whispr", "classic"].includes(row.sound.profile));
      assert.ok(row.sound.volume >= 0 && row.sound.volume <= 100);
    }
  });

  it("eylem satırlarında en çok üç düğme var ve yalnız ilki vurgulu", () => {
    for (const { row } of rows) {
      if (!row.actions) continue;

      assert.ok(row.actions.length <= 3, `${row.key} üçten fazla düğme taşıyor`);
      for (const [index, action] of row.actions.entries()) {
        if (index === 0) continue;
        assert.equal(action.kind, undefined, `${row.key} ikinci düğmesi vurgulu`);
      }
    }
  });

  it("her i18n anahtarı beklenen önekle başlıyor", () => {
    for (const key of collectSettingsCopyKeys()) {
      assert.match(
        key,
        /^settings\.(section|tab|group|row|option|action)\./u,
        `beklenmeyen anahtar: ${key}`,
      );
    }
  });

  it("çalışma zamanı verisi olan satırlar anahtar değil alan adı taşıyor", () => {
    // Bu on iki satırın alt metni hesabın kendisidir (`dogukan@whispr.app`, `10 kod · 8 tanesi
    // kullanılmadı`). Sözlüğe yazılsalardı demo veri ürüne sızardı.
    const dataRows = rows
      .filter(({ row }) => row.descriptionData)
      .map(({ row }) => row.key)
      .sort();

    assert.deepEqual(dataRows, ["ae", "ap", "apw", "d1", "e7", "h1", "s2", "z7"]);

    for (const { row } of rows) {
      assert.ok(
        !(row.descriptionKey && row.descriptionData),
        `${row.key} hem anahtar hem alan adı taşıyor`,
      );
    }
  });
});
