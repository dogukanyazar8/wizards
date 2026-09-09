import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_MESSAGE_SEARCH_FORM,
  MESSAGE_SEARCH_CONTENT_TAGS,
  buildHighlightSegments,
  buildMessageSearchFilters,
  collectUnsupportedFilters,
  isMessageSearchFiltered,
  resolveDateRangeStart,
  toggleContentTag,
} from "./search-filters";

/**
 * Ş5 — SPEC-SUNUCU §4.3'ün alan seti.
 *
 * Testin asıl işi tek cümle: **desteklenmeyen filtre uca gitmez.** İçerik çipleri ve thread
 * anahtarı arayüzde var, sorguda yok; uydurma bir parametre gönderilirse burada kırılır.
 */

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

describe("uç parametreleri (§4.3)", () => {
  it("içerik çipleri ve thread anahtarı hiçbir parametre üretmez", () => {
    const filters = buildMessageSearchFilters(
      {
        ...EMPTY_MESSAGE_SEARCH_FORM,
        contentTags: ["file", "pinned"],
        threadOnly: true,
      },
      "advanced",
      NOW,
    );

    assert.deepEqual(filters, { author: null, exact: false, from: null, to: null });
    assert.deepEqual(Object.keys(filters).sort(), ["author", "exact", "from", "to"]);
  });

  it("desteklenmeyen filtreleri adlandırır", () => {
    assert.deepEqual(collectUnsupportedFilters(EMPTY_MESSAGE_SEARCH_FORM), []);
    assert.deepEqual(
      collectUnsupportedFilters({
        ...EMPTY_MESSAGE_SEARCH_FORM,
        contentTags: ["link"],
        threadOnly: true,
      }),
      ["contentTags", "threadOnly"],
    );
  });

  it("`Basit` kipinde gelişmiş alanların hiçbiri gönderilmez", () => {
    const filters = buildMessageSearchFilters(
      {
        ...EMPTY_MESSAGE_SEARCH_FORM,
        author: "dogukan",
        dateRange: "30d",
        exact: true,
      },
      "basic",
      NOW,
    );

    assert.deepEqual(filters, { author: null, exact: false, from: null, to: null });
  });

  it("`Gelişmiş` kipinde kimden ve tarih aralığı gerçekten gönderilir", () => {
    const filters = buildMessageSearchFilters(
      { ...EMPTY_MESSAGE_SEARCH_FORM, author: " dogukan ", dateRange: "7d" },
      "advanced",
      NOW,
    );

    assert.equal(filters.author, "dogukan");
    assert.equal(filters.from, new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString());
    assert.equal(filters.to, null, "üst sınır gönderilmez; yeni mesaj sessizce elenmemeli");
  });
});

describe("tarih aralığı", () => {
  it("`all` sınır üretmez, kalan dördü gün sayısından türer", () => {
    assert.equal(resolveDateRangeStart("all", NOW), null);
    assert.equal(resolveDateRangeStart("24h", NOW), new Date(NOW - 86_400_000).toISOString());
    assert.equal(resolveDateRangeStart("30d", NOW), new Date(NOW - 30 * 86_400_000).toISOString());
    assert.equal(resolveDateRangeStart("90d", NOW), new Date(NOW - 90 * 86_400_000).toISOString());
  });
});

describe("içerik çipleri", () => {
  it("dört çip SPEC sırasındadır ve çoklu seçilir", () => {
    assert.deepEqual([...MESSAGE_SEARCH_CONTENT_TAGS], ["file", "link", "image", "pinned"]);

    const once = toggleContentTag([], "file");
    const twice = toggleContentTag(once, "image");

    assert.deepEqual([...twice], ["file", "image"]);
    assert.deepEqual([...toggleContentTag(twice, "file")], ["image"]);
  });
});

describe("`N SONUÇ · FİLTRELİ` kararı", () => {
  it("basit kipte hiç filtreli olmaz", () => {
    assert.equal(
      isMessageSearchFiltered({ ...EMPTY_MESSAGE_SEARCH_FORM, dateRange: "7d" }, "basic"),
      false,
    );
  });

  it("uca gitmeyen bir filtre de başlığı filtreli yapar", () => {
    assert.equal(isMessageSearchFiltered(EMPTY_MESSAGE_SEARCH_FORM, "advanced"), false);
    assert.equal(
      isMessageSearchFiltered({ ...EMPTY_MESSAGE_SEARCH_FORM, threadOnly: true }, "advanced"),
      true,
    );
    assert.equal(
      isMessageSearchFiltered({ ...EMPTY_MESSAGE_SEARCH_FORM, contentTags: ["file"] }, "advanced"),
      true,
    );
  });
});

describe("vurgulama (§4.3)", () => {
  it("eşleşen kelimeyi işaretler, gerisini olduğu gibi bırakır", () => {
    const segments = buildHighlightSegments("Taslak hazır, sürüm notları kısaldı", "sürüm", "tr");

    assert.deepEqual(
      segments.map((segment) => [segment.text, segment.highlighted]),
      [
        ["Taslak hazır, ", false],
        ["sürüm", true],
        [" notları kısaldı", false],
      ],
    );
  });

  it("birden çok geçişi ve büyük/küçük harf farkını yakalar", () => {
    const segments = buildHighlightSegments("Sürüm ve sürüm", "sürüm", "tr");

    assert.equal(segments.filter((segment) => segment.highlighted).length, 2);
    assert.equal(segments.map((segment) => segment.text).join(""), "Sürüm ve sürüm");
  });

  it("boş sorguda tek parça döner", () => {
    assert.deepEqual(buildHighlightSegments("metin", "   ", "tr"), [
      { highlighted: false, text: "metin" },
    ]);
  });

  it("eşleşme yoksa metni bölmez", () => {
    assert.deepEqual(buildHighlightSegments("metin", "yok", "tr"), [
      { highlighted: false, text: "metin" },
    ]);
  });
});
