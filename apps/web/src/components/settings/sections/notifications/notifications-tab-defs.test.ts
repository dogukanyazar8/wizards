import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findSettingsTab, type SettingsRowDef } from "@/lib/settings/tree";

import {
  QUIET_TIME_ZONE_BASE_OPTIONS,
  buildQuietHourOptions,
  resolveQuietTimeZoneOptions,
} from "./notification-prefs-bridge";
import { NOTIFICATION_ROW_DATA_FIELDS, deriveNotificationsTab } from "./notifications-tab-defs";

/**
 * Ş9 — ağacın çalışma zamanı türevi.
 *
 * Türev **eksiltmez**: 50 satırın hiçbiri kaybolmaz, sırası değişmez, anahtarı değişmez.
 * Değişen üç alan (`options`, `descriptionData`, izne bağlı `badgeKey` / `tone`) tek tek
 * sınanıyor — ağaç bu şeritte yazılmadığı için türevin doğruluğu tek güvence.
 */

const DERIVATION = {
  permission: "denied" as const,
  quietHourOptions: buildQuietHourOptions(),
  quietTimeZoneOptions: QUIET_TIME_ZONE_BASE_OPTIONS,
};

function rowsOf(tabKey: "general" | "quiet-hours" | "surfaces"): readonly SettingsRowDef[] {
  const tab = findSettingsTab("notifications", tabKey);

  assert.ok(tab, `${tabKey} sekmesi ağaçta yok`);

  return deriveNotificationsTab(tab, DERIVATION).groups.flatMap((group) => group.rows);
}

function findRow(tabKey: "general" | "quiet-hours" | "surfaces", key: string): SettingsRowDef {
  const row = rowsOf(tabKey).find((entry) => entry.key === key);

  assert.ok(row, `${key} satırı ${tabKey} sekmesinde yok`);

  return row;
}

describe("Bildirimler sekme türevi — yapı korunuyor", () => {
  it("satır sayısı, sırası ve anahtarları ağacınkiyle aynı", () => {
    for (const tabKey of ["general", "surfaces", "quiet-hours"] as const) {
      const original = findSettingsTab("notifications", tabKey);

      assert.ok(original);

      const before = original.groups.flatMap((group) => group.rows).map((row) => row.key);
      const after = rowsOf(tabKey).map((row) => row.key);

      assert.deepEqual(after, before);
    }
  });

  it("grup sayısı ve başlıkları değişmiyor", () => {
    const original = findSettingsTab("notifications", "quiet-hours");

    assert.ok(original);

    const derived = deriveNotificationsTab(original, DERIVATION);

    assert.equal(derived.groups.length, original.groups.length);
    assert.deepEqual(
      derived.groups.map((group) => group.titleKey),
      original.groups.map((group) => group.titleKey),
    );
  });
});

describe("Bildirimler sekme türevi — sessiz saatler", () => {
  it("başlangıç ve bitiş menüleri 24 saati yarım saatlik adımlarla listeliyor", () => {
    for (const key of ["nq2", "nq3"]) {
      const row = findRow("quiet-hours", key);

      assert.equal(row.options?.length, 48);
      assert.equal(row.options?.[0], "00:00");
      assert.equal(row.options?.[46], "23:00");
      assert.equal(row.options?.[47], "23:30");
    }
  });

  it("tasarımdaki dört seçenek örnek veriydi — ağaçtaki liste artık çizilmiyor", () => {
    const tree = findSettingsTab("notifications", "quiet-hours");
    const treeRow = tree?.groups.flatMap((group) => group.rows).find((row) => row.key === "nq2");

    assert.equal(treeRow?.options?.length, 4);
    assert.notDeepEqual(findRow("quiet-hours", "nq2").options, treeRow?.options);
  });

  it("zaman dilimi menüsü hesabın dilimini listeye alıyor", () => {
    const tab = findSettingsTab("notifications", "quiet-hours");

    assert.ok(tab);

    const derived = deriveNotificationsTab(tab, {
      ...DERIVATION,
      quietTimeZoneOptions: resolveQuietTimeZoneOptions("Asia/Tokyo"),
    });

    const row = derived.groups.flatMap((group) => group.rows).find((entry) => entry.key === "nq4");

    assert.equal(row?.options?.length, 4);
    assert.equal(row?.options?.[3], "Asia/Tokyo");
  });

  it("`nq1` alt metni gerçek saatlerden dolduruluyor", () => {
    const short = findRow("quiet-hours", "nq1");
    const long = findRow("general", "nq1");

    assert.equal(short.descriptionKey, undefined);
    assert.equal(short.descriptionData, NOTIFICATION_ROW_DATA_FIELDS.quietHoursRange);
    assert.equal(long.descriptionData, NOTIFICATION_ROW_DATA_FIELDS.quietHoursRangeSecure);
  });
});

describe("Bildirimler sekme türevi — sistem izni satırı", () => {
  it("izin engellendiğinde pil ve tehlike tonu duruyor", () => {
    for (const tabKey of ["general", "surfaces"] as const) {
      const row = findRow(tabKey, "na5");

      assert.equal(row.badgeKey, "settings.row.na5.badge");
      assert.equal(row.tone, "danger");
    }
  });

  it("izin verildiğinde pil düşüyor — uydurma metin yazılmıyor", () => {
    const tab = findSettingsTab("notifications", "general");

    assert.ok(tab);

    for (const permission of ["granted", "prompt", "unknown"] as const) {
      const derived = deriveNotificationsTab(tab, { ...DERIVATION, permission });
      const row = derived.groups
        .flatMap((group) => group.rows)
        .find((entry) => entry.key === "na5");

      assert.equal(row?.badgeKey, undefined, `${permission} durumunda pil kalmış`);
      assert.equal(row?.tone, undefined, `${permission} durumunda tehlike tonu kalmış`);
      assert.equal(row?.actions?.length, 2, "iki düğme korunmalı");
    }
  });
});
