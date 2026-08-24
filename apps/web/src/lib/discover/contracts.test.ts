import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DiscoverCategoryKeySchema,
  DiscoverLaneSchema,
  DiscoverSortKeySchema,
} from "@wizards/types";

import {
  DISCOVER_CARD_SIZE_STORAGE_KEY,
  DISCOVER_CATEGORIES,
  DISCOVER_FEATURED_FLAG,
  DISCOVER_LANES,
  DISCOVER_NEW_BADGE_TTL_MS,
  DISCOVER_SEEN_SERVERS_STORAGE_KEY,
  DISCOVER_SORTS,
} from "./contracts";

describe("DISCOVER_CATEGORIES", () => {
  it("SPEC §3.1 tablosunu birebir bu sırada taşır", () => {
    assert.deepEqual(
      DISCOVER_CATEGORIES.map((category) => [category.key, category.initials, category.tone]),
      [
        ["all", "TÜ", "primary"],
        ["oyun", "OY", "warning"],
        ["is", "İŞ", "info"],
        ["calisma", "ÇA", "success"],
        ["kisisel", "Kİ", "primary"],
        ["destek", "DE", "danger"],
      ],
    );
  });

  it("şemadaki her anahtarı tam bir kez kapsar", () => {
    assert.deepEqual(
      DISCOVER_CATEGORIES.map((category) => category.key)
        .slice()
        .sort(),
      [...DiscoverCategoryKeySchema.options].sort(),
    );
  });

  it("her tile metni iki karakterdir", () => {
    const invalid = DISCOVER_CATEGORIES.filter(
      (category) => [...category.initials].length !== 2,
    ).map((category) => category.key);

    assert.deepEqual(invalid, []);
  });
});

describe("DISCOVER_SORTS", () => {
  it("SPEC §3.2 sırasını ve nokta tonlarını taşır", () => {
    assert.deepEqual(
      DISCOVER_SORTS.map((sort) => [sort.key, sort.tone]),
      [
        ["popular", "primary"],
        ["online", "success"],
        ["new", "warning"],
      ],
    );
  });

  it("şemadaki her sıralamayı kapsar", () => {
    assert.deepEqual(
      DISCOVER_SORTS.map((sort) => sort.key)
        .slice()
        .sort(),
      [...DiscoverSortKeySchema.options].sort(),
    );
  });
});

describe("DISCOVER_LANES", () => {
  it("SPEC §4.1 sekme sırasını taşır", () => {
    assert.deepEqual(DISCOVER_LANES, ["servers", "people", "channels", "events"]);
  });

  it("şemadaki her şeridi kapsar", () => {
    assert.deepEqual([...DISCOVER_LANES].sort(), [...DiscoverLaneSchema.options].sort());
  });
});

describe("sözleşme renk taşımaz", () => {
  it("ton alanları token adıdır, hazır renk değil", () => {
    const tones = [
      ...DISCOVER_CATEGORIES.map((category) => category.tone),
      ...DISCOVER_SORTS.map((sort) => sort.tone),
    ];

    const colorLike = tones.filter((tone) => /#|hsl\(|rgb/iu.test(tone));

    assert.deepEqual(colorLike, []);
  });
});

describe("kalıcılık anahtarları ve bayraklar", () => {
  it("sürüm ekli anahtarlar kullanır", () => {
    // Sürüm eki, şekli değişen bir tercihin eski kaydını sessizce okumayı önler.
    assert.equal(DISCOVER_CARD_SIZE_STORAGE_KEY, "wizards.discover.cardSize.v1");
    assert.equal(DISCOVER_SEEN_SERVERS_STORAGE_KEY, "wizards.discover.seenServers.v1");
  });

  it("Yeni etiketi 24 saat yaşar", () => {
    assert.equal(DISCOVER_NEW_BADGE_TTL_MS, 86_400_000);
  });

  it("öne çıkan bayrağı mevcut dizin servisiyle aynı dizgidir", () => {
    // `lib/servers/server-discovery-service.ts` aynı bayrağı `features[]` içinde arıyor.
    assert.equal(DISCOVER_FEATURED_FLAG, "FEATURED");
  });
});
