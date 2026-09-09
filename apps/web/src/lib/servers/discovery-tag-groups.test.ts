import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SERVER_TAG_LIMIT, ServerTagSchema } from "@wizards/types";

import {
  DISCOVERY_TAG_GROUPS,
  DISCOVERY_TAGS,
  findDiscoveryTagGroup,
  normalizeDiscoveryTag,
} from "./discovery-tag-groups";

describe("keşif etiketi önerileri — SPEC §8.2 tablosu", () => {
  it("beş grubu tasarımdaki kod rozetleriyle taşır", () => {
    assert.deepEqual(
      DISCOVERY_TAG_GROUPS.map((group) => group.code),
      ["OY", "İŞ", "ÇA", "Kİ", "DE"],
    );
  });

  it("her grupta dört öneri, toplamda yirmi etiket bulunur", () => {
    for (const group of DISCOVERY_TAG_GROUPS) {
      assert.equal(group.suggestions.length, 4, `${group.id} dört öneri taşımıyor`);
    }

    assert.equal(DISCOVERY_TAGS.length, 20);
  });

  it("tasarımdaki etiket adlarını birebir gösterir", () => {
    assert.deepEqual(
      DISCOVERY_TAG_GROUPS.map((group) => group.suggestions.map((suggestion) => suggestion.label)),
      [
        ["Oyun", "Turnuva", "Takım bulma", "Espor"],
        ["İş", "Kariyer", "Girişimcilik", "Freelance"],
        ["Çalışma", "Yazılım", "Yapay zekâ", "Dil öğrenimi"],
        ["Kişisel", "Müzik", "Fitness", "Film & kitap"],
        ["Destek", "Moderasyon", "Güvenlik", "Teknik yardım"],
      ],
    );
  });

  it("her slug'ı sözleşmenin kuralından geçirir", () => {
    for (const tag of DISCOVERY_TAGS) {
      const parsed = ServerTagSchema.safeParse(tag);

      assert.equal(parsed.success, true, `${tag} ServerTagSchema'dan geçmiyor`);
      assert.equal(parsed.success && parsed.data, tag, `${tag} normalleştirmede değişiyor`);
    }
  });

  it("aynı slug'ı iki gruba koymaz", () => {
    assert.equal(new Set(DISCOVERY_TAGS).size, DISCOVERY_TAGS.length);
  });

  it("bir grup tek başına etiket sınırını aşmaz", () => {
    // Bir gruptaki her öneriyi seçmek 4 etiket eder; sınır 5, yani grup seçimi tek başına
    // "en fazla 5 etiket" kuralını çiğnemez.
    for (const group of DISCOVERY_TAG_GROUPS) {
      assert.ok(group.suggestions.length <= SERVER_TAG_LIMIT);
    }
  });
});

describe("elle yazılan etiket", () => {
  it("büyük harfi ve boşluğu sözleşmenin istediği slug'a indirir ya da reddeder", () => {
    assert.equal(normalizeDiscoveryTag("  Sohbet-Odasi  "), "sohbet-odasi");
    assert.equal(normalizeDiscoveryTag("Sohbet Odası"), null);
    assert.equal(normalizeDiscoveryTag(""), null);
    assert.equal(normalizeDiscoveryTag("t".repeat(25)), null);
    assert.equal(normalizeDiscoveryTag("t".repeat(24)), "t".repeat(24));
  });
});

describe("etiket → kategori", () => {
  it("bir öneriyi kendi grubunda bulur", () => {
    assert.equal(findDiscoveryTagGroup("yapay-zeka")?.code, "ÇA");
    assert.equal(findDiscoveryTagGroup("espor")?.id, "gaming");
  });

  it("öneri olmayan etiketi hiçbir gruba yazmaz", () => {
    // Elle yazılan bir etiket geçerlidir ama Keşfet'te bir kategorinin altına düşmez.
    assert.equal(findDiscoveryTagGroup("kendi-etiketim"), null);
  });
});
