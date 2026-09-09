import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCategoryPositions,
  buildChannelPositions,
  moveCategory,
  moveChannel,
  moveChannelBetweenCategories,
} from "./channel-ordering";

/**
 * Ş12 — SPEC-SUNUCU §8.4'ün sıralama çekirdeği.
 *
 * Testin asıl derdi: **klavye** (yukarı/aşağı düğmeleri) ile **fare** (dnd-kit) aynı yükü
 * üretiyor mu. Aynı taşımanın iki farklı `position` dizisi üretmesi, listeyi bir sonraki
 * okumada farklı sırada gösterirdi.
 */

const CATEGORIES = [{ id: "a" }, { id: "b" }, { id: "c" }];
const CHANNELS = [{ id: "one" }, { id: "two" }, { id: "three" }];

describe("kategori sırası", () => {
  it("yukarı taşıma komşuyla yer değiştirir ve yoğun dizin yazar", () => {
    assert.deepEqual(moveCategory(CATEGORIES, "b", "up"), [
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("aşağı taşıma komşuyla yer değiştirir", () => {
    assert.deepEqual(moveCategory(CATEGORIES, "b", "down"), [
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("uçta `null` döner — boşa giden istek gitmez", () => {
    assert.equal(moveCategory(CATEGORIES, "a", "up"), null);
    assert.equal(moveCategory(CATEGORIES, "c", "down"), null);
    assert.equal(moveCategory(CATEGORIES, "yok", "up"), null);
  });

  it("sürükleme ve düğme aynı yükü üretir", () => {
    const byButton = moveCategory(CATEGORIES, "c", "up");
    const dragged = [{ id: "a" }, { id: "c" }, { id: "b" }];

    assert.deepEqual(byButton, buildCategoryPositions(dragged));
  });
});

describe("kanal sırası", () => {
  it("kategori içinde taşır ve `categoryId`yi korur", () => {
    assert.deepEqual(moveChannel("cat", CHANNELS, "three", "up"), [
      { categoryId: "cat", id: "one", position: 0 },
      { categoryId: "cat", id: "three", position: 1 },
      { categoryId: "cat", id: "two", position: 2 },
    ]);
  });

  it("kategorisiz liste `null` taşır", () => {
    const items = moveChannel(null, CHANNELS, "one", "down");

    assert.equal(
      items?.every((item) => item.categoryId === null),
      true,
    );
  });

  it("aynı kategori içinde sürükleme yalnız o kategoriyi yeniden numaralar", () => {
    const items = moveChannelBetweenCategories({
      channelId: "one",
      sourceCategoryId: "cat",
      sourceChannels: CHANNELS,
      targetCategoryId: "cat",
      targetChannels: CHANNELS,
      targetIndex: 2,
    });

    assert.deepEqual(items, [
      { categoryId: "cat", id: "two", position: 0 },
      { categoryId: "cat", id: "three", position: 1 },
      { categoryId: "cat", id: "one", position: 2 },
    ]);
  });

  it("kategoriler arası taşımada **iki** kategori birden yeniden numaralanır", () => {
    const items = moveChannelBetweenCategories({
      channelId: "two",
      sourceCategoryId: "cat-a",
      sourceChannels: CHANNELS,
      targetCategoryId: "cat-b",
      targetChannels: [{ id: "x" }],
      targetIndex: 0,
    });

    assert.deepEqual(items, [
      { categoryId: "cat-a", id: "one", position: 0 },
      { categoryId: "cat-a", id: "three", position: 1 },
      { categoryId: "cat-b", id: "two", position: 0 },
      { categoryId: "cat-b", id: "x", position: 1 },
    ]);
  });

  it("kategori başlığına bırakılınca sona eklenir", () => {
    const items = moveChannelBetweenCategories({
      channelId: "one",
      sourceCategoryId: "cat-a",
      sourceChannels: CHANNELS,
      targetCategoryId: "cat-b",
      targetChannels: [{ id: "x" }],
      targetIndex: null,
    });

    assert.deepEqual(items?.at(-1), { categoryId: "cat-b", id: "one", position: 1 });
  });

  it("aynı yere bırakma ve bilinmeyen kanal `null` döner", () => {
    assert.equal(
      moveChannelBetweenCategories({
        channelId: "one",
        sourceCategoryId: "cat",
        sourceChannels: CHANNELS,
        targetCategoryId: "cat",
        targetChannels: CHANNELS,
        targetIndex: 0,
      }),
      null,
    );
    assert.equal(
      moveChannelBetweenCategories({
        channelId: "yok",
        sourceCategoryId: "cat",
        sourceChannels: CHANNELS,
        targetCategoryId: "cat",
        targetChannels: CHANNELS,
        targetIndex: 1,
      }),
      null,
    );
  });

  it("yük her zaman 0'dan başlayan yoğun dizindir", () => {
    assert.deepEqual(buildChannelPositions("cat", CHANNELS), [
      { categoryId: "cat", id: "one", position: 0 },
      { categoryId: "cat", id: "two", position: 1 },
      { categoryId: "cat", id: "three", position: 2 },
    ]);
  });
});
