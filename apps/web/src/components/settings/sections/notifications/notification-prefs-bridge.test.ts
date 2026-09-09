import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCKED_NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPE_KEYS,
  NotificationPrefsPatchSchema,
  type NotificationPrefs,
} from "@wizards/types";

import { findSettingsTab, SETTINGS_TREE } from "@/lib/settings/tree";
import {
  SETTINGS_SOUND_PROFILE_SUFFIX,
  SETTINGS_SOUND_VOLUME_SUFFIX,
  SettingsValueStore,
} from "@/lib/settings/use-setting-value";

import {
  buildQuietHourOptions,
  buildSoundResetPatch,
  buildSoundRowDefaults,
  buildValuesContext,
  LOCKED_NOTIFICATION_TYPE_ROW_KEYS,
  NOTIFICATION_SOUND_ROW_KEYS,
  NOTIFICATION_TYPE_ROW_KEYS,
  NOTIFICATION_TYPE_TOTAL,
  QUIET_TIME_ZONE_BASE_OPTIONS,
  resolveQuietHourOptions,
  resolveQuietTimeZoneOptions,
  summarizeNotificationPrefs,
  toNotificationPrefsPatch,
  toSettingsValues,
} from "./notification-prefs-bridge";

/**
 * Ş9 — satır anahtarı ↔ `NotificationPrefs` köprüsü.
 *
 * Bu dosyanın işi üç soruyu React ağacı kurmadan yanıtlamak: paylaşılan beş anahtar tek durum
 * mu, `np4` ile `na6` gerçekten ayrı mı, ve kilitli iki satır yamaya hiç giriyor mu.
 */

function makePrefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  const types = Object.fromEntries([
    ...NOTIFICATION_TYPE_KEYS.map((key) => [key, true]),
    ...LOCKED_NOTIFICATION_TYPE_KEYS.map((key) => [key, true]),
  ]) as NotificationPrefs["types"];

  return {
    defaultMuteDuration: "8h",
    delivery: { email: false, inApp: true, push: true, system: "mentions" },
    exceptions: [],
    level: "important",
    panel: { autoClose: true, count: 5, durationSec: 10, showContent: false, showSource: true },
    permission: "unknown",
    quietHours: {
      allowCalls: true,
      enabled: true,
      end: "08:00",
      start: "23:00",
      tz: "Europe/Istanbul",
    },
    sounds: {
      call: { enabled: true, profile: "classic", volume: 80 },
      join: { enabled: true, profile: "whispr", volume: 50 },
      leave: { enabled: true, profile: "whispr", volume: 50 },
      notification: { enabled: true, profile: "whispr", volume: 60 },
    },
    surfaces: { badge: true, inAppToast: true, systemWhileOpen: false },
    systemPreview: false,
    types,
    ...overrides,
  };
}

describe("bildirim köprüsü — okuma", () => {
  it("on altı tür satırının hepsini düzleştiriyor", () => {
    const values = toSettingsValues(makePrefs());
    const typeRows = [
      ...Object.keys(NOTIFICATION_TYPE_ROW_KEYS),
      ...Object.keys(LOCKED_NOTIFICATION_TYPE_ROW_KEYS),
    ];

    assert.equal(typeRows.length, 16);

    for (const rowKey of typeRows) {
      assert.equal(values[rowKey], true, `${rowKey} düzleşmedi`);
    }
  });

  it("dört ses satırı üç anahtar taşıyor", () => {
    const values = toSettingsValues(makePrefs());

    for (const rowKey of Object.keys(NOTIFICATION_SOUND_ROW_KEYS)) {
      assert.equal(typeof values[rowKey], "boolean");
      assert.equal(typeof values[`${rowKey}${SETTINGS_SOUND_PROFILE_SUFFIX}`], "string");
      assert.equal(typeof values[`${rowKey}${SETTINGS_SOUND_VOLUME_SUFFIX}`], "number");
    }

    assert.equal(values[`ns2${SETTINGS_SOUND_PROFILE_SUFFIX}`], "classic");
    assert.equal(values[`ns2${SETTINGS_SOUND_VOLUME_SUFFIX}`], 80);
  });

  it("menü dizinlerini sözleşmenin sırasından çözüyor", () => {
    const values = toSettingsValues(makePrefs());

    assert.equal(values["b1"], 1, "level=important ikinci seçenek");
    assert.equal(values["nd2"], 1, "system=mentions ikinci seçenek");
    assert.equal(values["np1"], 2, "count=5 üçüncü segment");
    assert.equal(values["np3"], 1, "durationSec=10 ikinci segment");
    assert.equal(values["ne1"], 1, "defaultMuteDuration=8h ikinci segment");
  });

  it("sessiz saat dizinleri yarım saatlik ızgaradan geliyor", () => {
    const values = toSettingsValues(makePrefs());
    const options = buildQuietHourOptions();

    assert.equal(options.length, 48);
    assert.equal(options[0], "00:00");
    assert.equal(options[options.length - 1], "23:30");
    assert.equal(options[values["nq2"] as number], "23:00");
    assert.equal(options[values["nq3"] as number], "08:00");
  });

  it("`np4` ile `na6` ayrı anahtar — regresyon (tuzak #4)", () => {
    const values = toSettingsValues(
      makePrefs({
        panel: { autoClose: true, count: 5, durationSec: 10, showContent: true, showSource: true },
        systemPreview: false,
      }),
    );

    assert.equal(values["np4"], true);
    assert.equal(values["na6"], false);
  });
});

describe("bildirim köprüsü — yazma", () => {
  const context = buildValuesContext(makePrefs());

  it("kısmi yama kısmi kalıyor — dokunulmayan tercih gönderilmiyor", () => {
    const patch = toNotificationPrefsPatch({ nt3: false }, context);

    assert.deepEqual(patch, { types: { mentionRole: false } });
  });

  it("ters mantıklı iki tür düz mantıkla gidiyor (tuzak #2)", () => {
    // Bileşen `false` gösterir, uç `false` alır; `suppressRoleMentions = true` çevirmesi
    // `prefs-service` içinde kalır ve bu katmanda hiç görünmez.
    const patch = toNotificationPrefsPatch({ nt3: false, nt4: false }, context);

    assert.deepEqual(patch.types, { mentionEveryone: false, mentionRole: false });
  });

  it("kilitli iki satır yamaya hiç girmiyor (tuzak #5)", () => {
    const patch = toNotificationPrefsPatch({ nt13: false, nt14: false, nt15: false }, context);

    assert.deepEqual(patch, { types: { announcements: false } });
  });

  it("`np4` yazması `systemPreview`'a sızmıyor", () => {
    const patch = toNotificationPrefsPatch({ np4: true }, context);

    assert.deepEqual(patch, { panel: { showContent: true } });
    assert.equal("systemPreview" in patch, false);
  });

  it("`na6` yazması panele sızmıyor", () => {
    const patch = toNotificationPrefsPatch({ na6: true }, context);

    assert.deepEqual(patch, { systemPreview: true });
    assert.equal("panel" in patch, false);
  });

  it("ses satırı üç anahtarı tek kovada birleştiriyor", () => {
    const patch = toNotificationPrefsPatch({ ns1: false, ns1_p: "classic", ns1_v: 25 }, context);

    assert.deepEqual(patch, {
      sounds: { notification: { enabled: false, profile: "classic", volume: 25 } },
    });
  });

  it("saat ve zaman dilimi dizinleri listeden çözülüyor", () => {
    const patch = toNotificationPrefsPatch({ nq2: 0, nq3: 47, nq4: 1 }, context);

    assert.deepEqual(patch, {
      quietHours: { end: "23:30", start: "00:00", tz: "Europe/London" },
    });
  });

  it("liste dışındaki dizin alanı hiç göndermiyor", () => {
    const patch = toNotificationPrefsPatch({ nq2: 999 }, context);

    assert.deepEqual(patch, {});
  });

  it("tanımadığı anahtarı sessizce düşürüyor", () => {
    assert.deepEqual(toNotificationPrefsPatch({ pn: "Doğukan", v7: true }, context), {});
  });

  it("ürettiği her yama sözleşmenin şemasından geçiyor", () => {
    const patch = toNotificationPrefsPatch(
      {
        b1: 0,
        na1: false,
        nd4: true,
        ne1: 3,
        np1: 3,
        np3: 4,
        nq1: false,
        nq5: false,
        ns4: false,
        nt1: false,
      },
      context,
    );

    assert.doesNotThrow(() => NotificationPrefsPatchSchema.parse(patch));
  });
});

describe("bildirim köprüsü — paylaşılan anahtarlar tek durum (tuzak #4)", () => {
  it("`nd2` iki sekmede de aynı kutuyu okuyor", () => {
    const store = new SettingsValueStore({ write: async () => {} });

    store.setValue("nd2", 2);

    // İki sekmenin ağaç tanımı da aynı `key`'i taşıyor; ikinci bir durum kurulmadığı için
    // okuma da aynı kutudan geliyor.
    const general = findSettingsTab("notifications", "general");
    const surfaces = findSettingsTab("notifications", "surfaces");

    assert.ok(
      general?.groups.some((group) => group.rows.some((row) => row.key === "nd2")),
      "nd2 Genel sekmesinde yok",
    );
    assert.ok(
      surfaces?.groups.some((group) => group.rows.some((row) => row.key === "nd2")),
      "nd2 Yüzeyler sekmesinde yok",
    );
    assert.equal(store.getValue("nd2"), 2);
  });

  it("beş paylaşılan anahtarın hiçbiri `stateKey` taşımıyor — aynı anahtar, aynı kutu", () => {
    const shared = new Set(["nd2", "na5", "na6", "nq1", "ns1"]);
    const notifications = SETTINGS_TREE.find((section) => section.key === "notifications");

    for (const tab of notifications?.tabs ?? []) {
      for (const group of tab.groups) {
        for (const row of group.rows) {
          if (shared.has(row.key)) {
            assert.equal(row.stateKey, undefined, `${row.key} ikinci bir duruma bağlanmış`);
          }
        }
      }
    }
  });
});

describe("bildirim köprüsü — sessiz saat listesi", () => {
  it("ızgaraya oturmayan değer listeye sıralı giriyor", () => {
    const options = resolveQuietHourOptions("23:15", "08:00");

    assert.equal(options.length, 49);
    assert.equal(options.indexOf("23:15"), options.indexOf("23:00") + 1);
  });

  it("ızgaradaki değerler listeyi büyütmüyor", () => {
    assert.equal(resolveQuietHourOptions("23:00", "08:00").length, 48);
  });

  it("hesabın zaman dilimi üç seçeneğin dışındaysa listeye ekleniyor", () => {
    const options = resolveQuietTimeZoneOptions("Asia/Tokyo");

    assert.equal(options.length, QUIET_TIME_ZONE_BASE_OPTIONS.length + 1);
    assert.equal(options[options.length - 1]?.id, "Asia/Tokyo");
  });

  it("bilinen zaman dilimi listeyi büyütmüyor", () => {
    assert.equal(
      resolveQuietTimeZoneOptions("Europe/London").length,
      QUIET_TIME_ZONE_BASE_OPTIONS.length,
    );
  });
});

describe("bildirim köprüsü — ses varsayılanları", () => {
  it("varsayılanlar ağaçtan okunuyor", () => {
    const defaults = buildSoundRowDefaults();

    assert.deepEqual(defaults["ns1"], { enabled: true, profile: "whispr", volume: 60 });
    assert.deepEqual(defaults["ns2"], { enabled: true, profile: "classic", volume: 80 });
    assert.equal(Object.keys(defaults).length, 4);
  });

  it("`Varsayılana döndür` dört satırın on iki anahtarını da yazıyor", () => {
    const patch = buildSoundResetPatch();

    assert.equal(Object.keys(patch).length, 12);
    assert.equal(patch["ns2_p"], "classic");
    assert.equal(patch["ns3_v"], 50);
  });

  it("ağaçtaki ses satırları sekmeler arası tutarlı", () => {
    const sounds = findSettingsTab("notifications", "sounds");
    const general = findSettingsTab("notifications", "general");
    const inSounds = sounds?.groups.flatMap((group) => group.rows).find((row) => row.key === "ns1");
    const inGeneral = general?.groups
      .flatMap((group) => group.rows)
      .find((row) => row.key === "ns1");

    assert.deepEqual(inSounds?.sound, inGeneral?.sound);
  });
});

describe("bildirim köprüsü — özet sayıları", () => {
  it("payda on dört açılabilir tür artı kilitli iki tür", () => {
    assert.equal(NOTIFICATION_TYPE_TOTAL, 16);
  });

  it("kilitli iki tür her zaman açık sayılıyor", () => {
    const types = Object.fromEntries([
      ...NOTIFICATION_TYPE_KEYS.map((key) => [key, false]),
      ...LOCKED_NOTIFICATION_TYPE_KEYS.map((key) => [key, true]),
    ]) as NotificationPrefs["types"];

    const summary = summarizeNotificationPrefs(makePrefs({ types }), {
      count: 0,
      truncated: false,
    });

    assert.equal(summary.typesOpen, 2);
    assert.equal(summary.typesTotal, 16);
  });

  it("teslim kanalı sayımı `off` sistem kipini kapalı sayıyor", () => {
    const open = summarizeNotificationPrefs(makePrefs(), { count: 0, truncated: false });
    const closed = summarizeNotificationPrefs(
      makePrefs({ delivery: { email: false, inApp: true, push: true, system: "off" } }),
      { count: 0, truncated: false },
    );

    assert.equal(open.channelsOpen, 3);
    assert.equal(closed.channelsOpen, 2);
    assert.equal(open.channelsTotal, 4);
  });

  it("istisna sayısı Ş4 ucunun uzunluğu — ikinci sayaç yok", () => {
    const summary = summarizeNotificationPrefs(makePrefs(), { count: 6, truncated: true });

    assert.equal(summary.exceptions, 6);
    assert.equal(summary.exceptionsTruncated, true);
  });
});
