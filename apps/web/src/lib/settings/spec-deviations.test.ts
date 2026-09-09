import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ADVANCED_WIZARDS_THEMES,
  countAdvancedThemesByMode,
  SIMPLE_WIZARDS_THEMES,
} from "@/lib/appearance";
import { readDesignReference } from "@/lib/design-reference";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { buildSettingsSearchIndex } from "@/lib/settings/search-index";
import { SETTINGS_DIRTY_PROFILE_KEYS, SPEC_DEVIATIONS } from "@/lib/settings/metrics";
import { findSettingsTab, SETTINGS_TREE, walkSettingsRows } from "@/lib/settings/tree";
import { resolveSettingStateKey } from "@/lib/settings/use-setting-value";

/**
 * Ş13 §6 — kayıtlı her sapmanın **davranış** testi.
 *
 * `parity.test.ts` sapma listesinin uzunluğunu ve referanstaki karşılığını kilitliyor; bu dosya
 * öbür yarısını kapatıyor: her kaydın kodda gerçekten uygulandığını. Bir sapma listeye yazılıp
 * uygulanmazsa liste bir iddia olur, kayıt olmaktan çıkar.
 *
 * Prompt on bir kayıt bekliyordu (Ş0'ın dokuzu + iki dalga eklemesi); Dalga 3 ve 4 üç kayıt
 * ekledi; güvenilir Desktop Control sınırı da bir kayıt ekleyerek sayıyı **on üç** yaptı. Bir
 * kaydı sayı tutsun diye silmek, "sessizce kaybolan ayar
 * yasak" kuralının aynısını sapma listesinde çiğnemek olurdu; rapor farkı açıkça yazıyor.
 */

const TR: Record<string, string> = TR_MESSAGES;

const reference = readDesignReference("ayarlar-paketi/referans/Ayarlar-referans.dc.html");

describe("SPEC_DEVIATIONS — her kayıt için davranış", () => {
  it("liste on üç kayıt taşıyor ve her alan tekil", () => {
    const fields = SPEC_DEVIATIONS.map(({ field }) => field);

    assert.equal(fields.length, 13);
    assert.equal(new Set(fields).size, 13);
  });

  it("#1 tema sayımı koddan okunuyor: 14 koyu + 9 açık", () => {
    assert.deepEqual(countAdvancedThemesByMode(), { dark: 14, light: 9 });
    assert.equal(ADVANCED_WIZARDS_THEMES.length, 23);
    assert.equal(SIMPLE_WIZARDS_THEMES.length, 4);
    // SPEC 13/10 diyor; kayıt farkı taşıyor.
    assert.equal(SPEC_DEVIATIONS[0]?.html, "14/9");
    assert.equal(SPEC_DEVIATIONS[0]?.spec, "13/10");
  });

  it("#2 `Boşta sayılma süresi` ağaçta değil, Gizlilik › Görünürlük'te çiziliyor", () => {
    const rowKeys = [...walkSettingsRows()].map(({ row }) => row.key);

    // Satır referans `SET` dizisinde yok, bu yüzden ağaçta da yok.
    assert.ok(!rowKeys.includes("g9"));
    assert.ok(!reference.includes("'g9'"));

    // Ama üründe var: metni sözlükte ve çizen dosya adıyla belli.
    assert.ok("settings.row.g9.title" in TR);

    const privacyTab = readFileSync(
      new URL("../../components/settings/sections/account/privacy-tab.tsx", import.meta.url),
      "utf8",
    );

    assert.match(privacyTab, /IDLE_TIMEOUT_ROW/u);
    assert.match(privacyTab, /settings\.row\.g9\.title/u);
  });

  it("#3 Web / Masaüstü segmenti referansta var, üründe çizilmiyor", () => {
    assert.ok(reference.includes("runtimes"));

    const header = readFileSync(
      new URL("../../components/settings/settings-header.tsx", import.meta.url),
      "utf8",
    );

    // Yorumdaki gerekçe kalabilir; çizen kod kalamaz. Sözlükteki `header.runtimeSegment`
    // ölçüsü başlığın kalan boşluğunu hesaplamak için duruyor ve hiçbir öğeye bağlanmıyor.
    const code = header.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*/gu, "");

    assert.ok(!code.includes("runtimeSegment"));
    assert.ok(!/["'`]Web["'`]/u.test(code));
  });

  it("#4 `Hareketi azalt` ve `Text-to-speech` tek durum anahtarına bağlı", () => {
    assert.equal(resolveSettingStateKey("v7"), resolveSettingStateKey("x1"));
    assert.equal(resolveSettingStateKey("v8"), resolveSettingStateKey("x5"));
    assert.equal(resolveSettingStateKey("v7"), "reduceMotion");
    assert.equal(resolveSettingStateKey("v8"), "enableTTS");
    // Referans iki ayrı anahtar tutuyor; sapma tam olarak bu.
    assert.equal(reference.match(/'Hareketi azalt'/gu)?.length, 2);
  });

  it("#5 kirli profil alanları sayılı; `p1…p9` listede yok", () => {
    assert.deepEqual(
      [...SETTINGS_DIRTY_PROFILE_KEYS],
      ["pn", "pu", "pz", "pbio", "pp", "ps", "pe", "px"],
    );

    const audioRows = [...walkSettingsRows()]
      .filter(({ section }) => section.key === "av")
      .map(({ row }) => row.key)
      .filter((key) => /^p\d$/u.test(key));

    assert.ok(audioRows.length > 0);
    assert.ok(audioRows.every((key) => !SETTINGS_DIRTY_PROFILE_KEYS.includes(key as never)));
  });

  it("#6 iki etiket kümesi, tek `level` anahtarı", () => {
    // Genel sekmesindeki `b1` üç seçenek taşıyor…
    const general = findSettingsTab("notifications", "general");
    const level = general?.groups.flatMap((group) => group.rows).find((row) => row.key === "b1");

    assert.ok(level);
    assert.equal(level.options?.length, 3);
    assert.notEqual(TR[level.options?.[0] ?? ""], undefined);

    // …560 px pencere aynı `level`i **başka** metinle yazıyor.
    const dialog = readFileSync(
      new URL("../../components/notifications/notification-prefs-dialog.tsx", import.meta.url),
      "utf8",
    );

    assert.match(dialog, /NOTIF_LEVEL_BY_INDEX|level/u);
    assert.match(dialog, /notif\.prefs\.level\./u);
    assert.notEqual(TR["notif.prefs.level.important.title"], TR[level.options?.[1] ?? ""]);
  });

  it("#7 arama indeksi ağaçtan üretiliyor, `SET_HITS` ölü hedefi yok", () => {
    const index = buildSettingsSearchIndex((key) => TR[key] ?? key);
    const rows = new Set([...walkSettingsRows()].map(({ row }) => row.key));

    assert.ok(index.length > 0);
    assert.ok(index.every((entry) => rows.has(entry.rowKey)));

    // Referansın ölü hedefi (`ozet`) hiçbir girdinin sekmesi değil.
    assert.ok(reference.includes("'ozet'"));
    assert.ok(!index.some((entry) => String(entry.tab) === "ozet"));
  });

  it("#8 başlıksız grup render edilebiliyor", () => {
    const untitled = [...SETTINGS_TREE]
      .flatMap((section) => section.tabs)
      .flatMap((tab) => tab.groups)
      .filter((group) => !group.titleKey && !group.titleData);

    // Profil hero grubu ve Hakkında'nın ilk grubu.
    assert.ok(untitled.length >= 2);

    const groupSource = readFileSync(
      new URL("../../components/settings/rows/settings-group.tsx", import.meta.url),
      "utf8",
    );

    // Başlık opsiyonel: `title` yoksa başlık kutusu hiç çizilmiyor.
    assert.match(groupSource, /title\s*\?/u);
  });

  it("#9 `ne1` kendi grubunda ve metni değişmemiş", () => {
    const exceptions = findSettingsTab("notifications", "exceptions");
    const row = exceptions?.groups
      .flatMap((group) => group.rows)
      .find((entry) => entry.key === "ne1");

    assert.ok(row);
    assert.equal(row.ownGroupTitleKey, "settings.group.notifications.exceptions.defaults.title");
    assert.equal(TR["settings.row.ne1.title"], "Yeni istisnalar için geçici sessize alma");
    assert.ok(reference.includes("'Yeni istisnalar için geçici sessize alma'"));
    // Ağaç `SET` ile birebir: grup sayısı 58'de kaldı.
    assert.equal(
      SETTINGS_TREE.flatMap((section) => section.tabs).flatMap((tab) => tab.groups).length,
      58,
    );
  });

  it("#10 ses notu tasarımdan, saklama sunucuda", () => {
    assert.ok(reference.includes("Ses ayarları bu cihaza kaydedilir."));

    const bridge = readFileSync(
      new URL(
        "../../components/settings/sections/notifications/notification-prefs-bridge.ts",
        import.meta.url,
      ),
      "utf8",
    );

    // Dört ses satırının üçer alanı sunucu tercihine gidiyor — cihaz deposuna değil.
    for (const key of ["ns1", "ns2", "ns3", "ns4"]) {
      assert.ok(bridge.includes(key), `${key} köprüde yok`);
    }

    assert.match(bridge, /soundNotification|NOTIFICATION_SOUND_KEYS/u);
    assert.ok(!bridge.includes("useSoundStore"));
  });

  it("#11 `desktopShortcuts` Json kolonu, çakışma saklanmıyor", () => {
    const schema = readFileSync(
      new URL("../../../../../packages/db/prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    assert.match(schema, /desktopShortcuts\s+Json\?/u);
    // Çakışma her açılışta kabuktan okunuyor; kolonda yok.
    assert.ok(!/desktopShortcutConflicts/u.test(schema));

    const shortcuts = readFileSync(new URL("../desktop/shortcuts.ts", import.meta.url), "utf8");

    assert.match(shortcuts, /conflict/iu);
  });

  it("#12 `Canary` çipi `UAT` değerini yazıyor", () => {
    const channel = readFileSync(new URL("../desktop/release-channel.ts", import.meta.url), "utf8");

    assert.match(channel, /UAT/u);
    assert.equal(TR["settings.option.h2.3"], "Canary");

    const schema = readFileSync(
      new URL("../../../../../packages/db/prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    assert.match(schema, /enum ReleaseChannel \{[^}]*UAT/su);
    assert.ok(!/enum ReleaseChannel \{[^}]*CANARY/su.test(schema));
  });

  it("#13 uzak Ayarlar kısayol mutasyonunu Desktop Control'e yönlendiriyor", () => {
    const shortcutsTab = findSettingsTab("desktop", "shortcuts");
    const action = shortcutsTab?.groups
      .flatMap((group) => group.rows)
      .find((row) => row.key === "q3")?.actions;
    const section = readFileSync(
      new URL("../../components/settings/sections/desktop/desktop-section.tsx", import.meta.url),
      "utf8",
    );

    assert.equal(action?.length, 1);
    assert.equal(TR[action?.[0]?.labelKey ?? ""], "Masaüstü Denetimi'nde yönet");
    assert.match(section, /openDesktopControl\("shortcuts"\)/u);
    assert.doesNotMatch(section, /writeDesktopShortcutStatus/u);
  });
});
