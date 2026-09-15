import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DATE_FORMAT_BY_INDEX,
  DM_POLICY_BY_INDEX,
  IDLE_TIMEOUT_BY_INDEX,
  LOCALE_BY_INDEX,
  PRESENCE_BY_INDEX,
  TIME_FORMAT_BY_INDEX,
  TIME_ZONE_BY_INDEX,
  VISIBILITY_BY_INDEX,
  indexOf,
  splitAccountPatch,
  toAccountSettingsPayload,
} from "@/components/settings/sections/account/account-surface";
import type { AccountSettingsState } from "@/lib/account/actions";
import { findSettingsTab } from "@/lib/settings/tree";

/** Ş7 — anahtar → kolon eşlemesi. Satır motoru dizin konuşur, sunucu enum konuşur. */

const ACCOUNT: AccountSettingsState = {
  avatarUrl: null,
  displayName: "Doğukan Yazar",
  email: "dogukan@whispr.app",
  emailVerified: true,
  id: "user-1",
  status: "ONLINE",
  twoFactorEnabled: false,
  username: "dogukan",
};

function optionCount(rowKey: string): number {
  for (const group of [
    ...(findSettingsTab("account", "privacy")?.groups ?? []),
    ...(findSettingsTab("appearance", "language")?.groups ?? []),
  ]) {
    for (const row of group.rows) {
      if (row.key === rowKey) return row.options?.length ?? 0;
    }
  }

  return 0;
}

describe("splitAccountPatch — tanınan anahtarlar", () => {
  it("routes read receipts to the existing messaging privacy contract", () => {
    const split = splitAccountPatch({ g6: false });
    assert.deepEqual(split.messagingPrivacy, { readReceipts: false });
    assert.deepEqual(split.layout, {});
    assert.deepEqual(split.unmapped, []);
  });
  it("gizlilik menüleri kolonlara çevriliyor", () => {
    const split = splitAccountPatch({ g1: 1, g2: 2, g3: 3, g4: 0, g5: false });

    assert.deepEqual(split.layout, {
      allowGroupInvites: false,
      dmPolicy: "NOBODY",
      friendRequestPolicy: "EVERYONE",
      presenceVisibility: "NOBODY",
      profileVisibility: "FRIENDS",
    });
    assert.deepEqual([...split.unmapped], []);
  });

  it("dil ve bölge: `l1` sunucuya gitmiyor, `l2`–`l4` gidiyor", () => {
    const split = splitAccountPatch({ l1: 1, l2: 2, l3: 1, l4: 2 });

    assert.equal(split.localeIndex, 1);
    assert.deepEqual(split.layout, {
      dateFormat: "DMY",
      timeFormat: "H24",
      timeZone: "America/New_York",
    });
  });

  it("K9 — `g9` yerel tercihe düşüyor, sunucuya gitmiyor", () => {
    const split = splitAccountPatch({ g9: 4 });

    assert.equal(split.localMinutes, 60);
    assert.deepEqual(split.layout, {});
    assert.deepEqual([...split.unmapped], []);
  });
});

describe("splitAccountPatch — karşılığı olmayanlar", () => {
  it("web yazma yolu olmayan anahtarlar sessizce yutulmuyor", () => {
    const split = splitAccountPatch({
      g6: true,
      g7: true,
      g8: 2,
      pbio: "x",
      ps: "Release",
      pe: "🚀",
      px: 4,
    });

    assert.deepEqual([...split.unmapped].sort(), ["g8"]);
    assert.deepEqual(split.gameSharing, { enabled: true });
    assert.deepEqual(split.layout, {});
  });
});

describe("Dizin ↔ enum listeleri", () => {
  it("liste uzunlukları ağaçtaki seçenek sayısıyla uyuşuyor", () => {
    assert.equal(VISIBILITY_BY_INDEX.length, optionCount("g1"));
    assert.equal(VISIBILITY_BY_INDEX.length, optionCount("g2"));
    assert.equal(DM_POLICY_BY_INDEX.length, optionCount("g3"));
    assert.equal(LOCALE_BY_INDEX.length, optionCount("l1"));
    assert.equal(TIME_ZONE_BY_INDEX.length, optionCount("l2"));
    assert.equal(DATE_FORMAT_BY_INDEX.length, optionCount("l3"));
    assert.equal(TIME_FORMAT_BY_INDEX.length, optionCount("l4"));
  });

  it("K9 listesi ürünün boşta seçenekleriyle aynı", () => {
    assert.deepEqual([...IDLE_TIMEOUT_BY_INDEX], [5, 10, 15, 30, 60]);
  });

  it("bilinmeyen değer sıfırıncı seçeneğe düşüyor", () => {
    assert.equal(indexOf(VISIBILITY_BY_INDEX, "GHOST" as never), 0);
    assert.equal(indexOf(IDLE_TIMEOUT_BY_INDEX, 7 as never, 2), 2);
  });
});

describe("toAccountSettingsPayload", () => {
  it("yalnız taslakta olan alanı değiştiriyor", () => {
    const next = toAccountSettingsPayload(ACCOUNT, { displayName: "Yeni Ad" });

    assert.equal(next.displayName, "Yeni Ad");
    assert.equal(next.username, "dogukan");
    assert.equal(next.status, "ONLINE");
  });

  it("`pp` dizini durum enum'una çevriliyor", () => {
    assert.equal(toAccountSettingsPayload(ACCOUNT, { presenceIndex: 2 }).status, "DND");
    assert.equal(PRESENCE_BY_INDEX[3], "INVISIBLE");
  });

  it("boş taslak mevcut değeri silmiyor", () => {
    assert.equal(
      toAccountSettingsPayload(ACCOUNT, { displayName: "   " }).displayName,
      ACCOUNT.displayName,
    );
  });
});
