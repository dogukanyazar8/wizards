import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MentionCounts } from "@wizards/types";

import {
  MENTION_KIND_GLYPH,
  MENTION_KIND_TONE,
  MENTION_SIDEBAR_KIND_ROWS,
  MENTION_TABS,
  readMentionKindRowCount,
  readMentionTabCount,
} from "./contracts";

/** SPEC §3/§4 örnek verisi: 7 bahsetme, 2 okunmamış, 3 rol+@herkes, 2 DM. */
const counts: MentionCounts = {
  all: 7,
  unread: 2,
  me: 3,
  role: 2,
  everyone: 1,
  thread: 1,
  readLater: 0,
  roleNames: [],
  bySource: { "s-whispr": 3, "s-product": 2, "s-oyun": 1, dm: 2 },
};

describe("mentions contracts — tür tonları", () => {
  it("rol bahsetmesi --info token'ını kullanır", () => {
    // Tasarımın `hsl(199 89% 48%)` tonunun token karşılığı Ş0.1'de tanımlandı; bileşene
    // gömülü bir hex bırakılmadı.
    assert.equal(MENTION_KIND_TONE.role, "--info");
  });

  it("dört türün de tonu var ve hiçbiri ham renk değil", () => {
    for (const tone of Object.values(MENTION_KIND_TONE)) {
      assert.match(tone, /^--[a-z-]+$/);
    }

    assert.deepEqual(Object.keys(MENTION_KIND_TONE).sort(), ["everyone", "me", "role", "thread"]);
  });

  it("ray glifleri SPEC §3 tablosunu taşır", () => {
    assert.equal(MENTION_KIND_GLYPH.me, "@");
    assert.equal(MENTION_KIND_GLYPH.role, "R");
    assert.equal(MENTION_KIND_GLYPH.thread, "T");
    assert.equal(MENTION_KIND_GLYPH.unread, "!");
  });
});

describe("mentions contracts — sayı okuma", () => {
  it("sekme sırası tasarımdan", () => {
    assert.deepEqual(
      MENTION_TABS.map((tab) => tab.id),
      ["all", "unread", "role", "dm"],
    );
  });

  it("`Rol · @herkes` sekmesi iki türü birden sayar", () => {
    assert.equal(readMentionTabCount(counts, "role"), 3);
  });

  it("DM sekmesi sayıyı kaynak haritasından alır", () => {
    assert.equal(readMentionTabCount(counts, "dm"), 2);
    assert.equal(readMentionTabCount({ ...counts, bySource: {} }, "dm"), 0);
  });

  it("ray satırı ve sekme aynı sayıyı verir", () => {
    // İki yüzey aynı sayıyı göstermek zorunda (PROMPT kural 3).
    assert.equal(readMentionKindRowCount(counts, "role"), readMentionTabCount(counts, "role"));
    assert.equal(readMentionKindRowCount(counts, "unread"), readMentionTabCount(counts, "unread"));
  });

  it("ray satır sırası tasarımdan", () => {
    assert.deepEqual(
      MENTION_SIDEBAR_KIND_ROWS.map((row) => row.id),
      ["me", "role", "thread", "unread"],
    );
  });

  it("örnek veride tür sayıları toplamı listeyi aşmaz", () => {
    const total =
      readMentionKindRowCount(counts, "me") +
      readMentionKindRowCount(counts, "role") +
      readMentionKindRowCount(counts, "thread");

    assert.equal(total, counts.all);
  });
});
