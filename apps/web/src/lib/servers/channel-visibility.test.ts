import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countHiddenInCollapsedCategory,
  filterCollapsedCategoryChannels,
  shouldShowInCollapsedCategory,
} from "./channel-visibility";

const channels = [
  { id: "welcome", unreadCount: 0 },
  { id: "surum-notlari", unreadCount: 0 },
  { id: "build-durumu", unreadCount: 12 },
  { id: "genel-sohbet", unreadCount: 0 },
  { id: "kod-inceleme", unreadCount: 0 },
];

const voiceStates = new Map([
  ["genel-sohbet", 4],
  ["sessiz-calisma", 0],
]);

describe("daraltılmış kategori filtresi — SPEC §2.4", () => {
  it("aktif kanalı gösterir", () => {
    assert.equal(
      shouldShowInCollapsedCategory(
        { id: "surum-notlari" },
        { activeChannelId: "surum-notlari", voiceStates },
      ),
      true,
    );
  });

  it("okunmamışı olan kanalı gösterir", () => {
    assert.equal(
      shouldShowInCollapsedCategory(
        { id: "build-durumu", unreadCount: 12 },
        { activeChannelId: null, voiceStates },
      ),
      true,
    );
  });

  it("içinde konuşan olan ses kanalını gösterir", () => {
    assert.equal(
      shouldShowInCollapsedCategory({ id: "genel-sohbet" }, { activeChannelId: null, voiceStates }),
      true,
    );
  });

  it("boş bir ses kanalını göstermez", () => {
    // `voiceStates` kanalı tanıyor ama içinde kimse yok; "haritada var" görünür demek değil.
    assert.equal(
      shouldShowInCollapsedCategory(
        { id: "sessiz-calisma" },
        { activeChannelId: null, voiceStates },
      ),
      false,
    );
  });

  it("üç koşulun hiçbirini karşılamayan kanalı gizler", () => {
    assert.equal(
      shouldShowInCollapsedCategory({ id: "welcome", unreadCount: 0 }, { activeChannelId: null }),
      false,
    );
  });

  it("ses durumu hiç verilmediğinde çökmez", () => {
    assert.equal(
      shouldShowInCollapsedCategory({ id: "genel-sohbet" }, { activeChannelId: null }),
      false,
    );
  });
});

describe("daraltılmış kategori sayaçları", () => {
  it("`N gizli` çipinin sayısını verir", () => {
    assert.equal(
      countHiddenInCollapsedCategory(channels, {
        activeChannelId: "surum-notlari",
        voiceStates,
      }),
      2,
    );
  });

  it("görünür kanalları giriş sırasını bozmadan süzer", () => {
    assert.deepEqual(
      filterCollapsedCategoryChannels(channels, {
        activeChannelId: "surum-notlari",
        voiceStates,
      }).map((channel) => channel.id),
      ["surum-notlari", "build-durumu", "genel-sohbet"],
    );
  });

  it("hiçbiri görünmüyorsa tamamını gizli sayar", () => {
    assert.equal(
      countHiddenInCollapsedCategory(channels, { activeChannelId: null }),
      channels.length - 1,
    );
  });
});
