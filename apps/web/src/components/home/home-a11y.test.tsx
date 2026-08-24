import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";

import { TR_MESSAGES } from "@/lib/locale/messages/tr";

import { HomeCard } from "./home-card";
import { HomeCountBadge, HomeSectionLabel, PresenceDot } from "./home-primitives";
import { renderWithLocale } from "./home-test-render";

/**
 * `08-faz7` §2 — `00-ortak-baglam` §5.3'ün tek tek kapatılması.
 *
 * Bu dosya **işaretlemeyi** sabitliyor: hangi etiketin başlık olduğunu, presence noktasının metin
 * karşılığını ve sayaçların okunabilir etiketini. axe taraması (`e2e/specs/a11y`) çalışan sayfayı
 * ölçüyor; burası sözleşmenin kendisi, ve bir kart yeniden yazılınca burada kırmızı veriyor.
 */

describe("§2.1 — anlamsal yapı", () => {
  it("kart bir `section` ve adını kendi başlığından alır", () => {
    const html = renderWithLocale(
      <HomeCard columnSpan={2} label="Kaldığın yer" padding="0" testId="card">
        <p>gövde</p>
      </HomeCard>,
    );

    const labelledBy = /<section aria-labelledby="([^"]+)"/.exec(html);

    assert.ok(labelledBy, "section aria-labelledby taşımıyor");
    // Başlık **kartın içinde** ve tam o id'yi taşıyor; `aria-label` ile ikinci bir ad verilmiyor.
    assert.match(html, new RegExp(`<h2 [^>]*id="${labelledBy[1]}"`));
    assert.doesNotMatch(html, /aria-label="Kaldığın yer"/);
  });

  it('kart başlığı gerçek bir başlık, `role="heading"` verilmiş bir `div` değil', () => {
    const html = renderWithLocale(
      <HomeCard columnSpan={1} label="Durumun" padding="0" testId="card">
        <p>gövde</p>
      </HomeCard>,
    );

    assert.match(html, /<h2 [^>]*>DURUMUN<\/h2>|<h2 [^>]*>Durumun<\/h2>/);
    assert.doesNotMatch(html, /role="heading"/);
  });

  it("başlık seviyesi çağıranın kararı", () => {
    const html = renderWithLocale(<HomeSectionLabel as="h3">Sıradaki</HomeSectionLabel>);

    assert.match(html, /<h3/);
  });

  it("başlığın büyük harfi CSS'ten gelir, metinden değil", () => {
    // Ekran okuyucu `Kaldığın yer` duyar; `KALDIĞIN YER` harf harf okunabilirdi.
    const html = renderWithLocale(<HomeSectionLabel as="h2">Kaldığın yer</HomeSectionLabel>);

    assert.match(html, />Kaldığın yer</);
    assert.match(html, /uppercase/);
  });
});

describe("§2.2 — presence noktası", () => {
  it("noktanın metin karşılığı var; renk tek taşıyıcı değil", () => {
    for (const [presence, key] of [
      ["ONLINE", "home.presence.online"],
      ["IDLE", "home.presence.idle"],
      ["DND", "home.presence.dnd"],
      ["OFFLINE", "home.friends.offline"],
    ] as const) {
      const html = renderWithLocale(
        <PresenceDot borderColor="transparent" borderWidth={1} presence={presence} size={8} />,
      );

      assert.match(html, new RegExp(`<span class="sr-only">${TR_MESSAGES[key]}</span>`), presence);
    }
  });
});

describe("§2.3 — sayaçların okunabilir etiketi", () => {
  it("okunmamış mesaj rozeti sayıyı cümleyle söyler", () => {
    const html = renderWithLocale(
      <HomeCountBadge
        count={3}
        label={TR_MESSAGES["common.unreadMessages"].replace("{count}", "3")}
        tone="primary"
      />,
    );

    assert.match(html, /aria-label="3 okunmamış mesaj"/);
  });

  it("okunmamış bahsedilme rozeti kendi cümlesini taşır", () => {
    const html = renderWithLocale(
      <HomeCountBadge
        count={2}
        label={TR_MESSAGES["common.unreadMentions"].replace("{count}", "2")}
        tone="danger"
      />,
    );

    assert.match(html, /aria-label="2 okunmamış bahsedilme"/);
  });

  it("§2.3'ün iki cümlesi sözlükte ve sayıyı taşıyor", () => {
    assert.match(TR_MESSAGES["common.unreadMessages"], /\{count\}/);
    assert.match(TR_MESSAGES["common.unreadMentions"], /\{count\}/);
  });
});
