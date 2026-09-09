import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PROFILE_MEDIA_PREVIEW_COUNT, type SharedMediaItemDTO } from "@wizards/types";

import {
  ProfileMediaGrid,
  ProfileMediaGridSkeleton,
  selectMediaPreview,
} from "@/components/messages/profile-media-grid";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — §15.5'in medya ızgarası.
 *
 * Buradaki asıl iddia `+N`: sayı **uçtan gelen `total`** ile çizilen karo sayısının farkı,
 * yüklenen sayfanın uzunluğu değil. Ş3'ün raporu bunu ayrıca uyarıyor, çünkü K11'in
 * kaldırdığı önbellek türetmesinin hatası tam olarak buydu.
 */

const NOW = new Date("2026-08-27T12:00:00.000Z");

function media(index: number, overrides: Partial<SharedMediaItemDTO> = {}): SharedMediaItemDTO {
  return {
    attachmentId: `att-${index}`,
    createdAt: "2026-08-26T14:04:00.000Z",
    height: 800,
    kind: "image",
    messageId: `m-${index}`,
    thumbnailUrl: `https://cdn.whispr.test/thumb-${index}`,
    url: `https://cdn.whispr.test/att-${index}`,
    width: 1200,
    ...overrides,
  };
}

function items(count: number): SharedMediaItemDTO[] {
  return Array.from({ length: count }, (_unused, index) => media(index));
}

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

describe("medya önizleme seçimi (SPEC §15.5)", () => {
  it("altı karo çizer ve kalanı total'dan hesaplar", () => {
    const { overlayCount, tiles } = selectMediaPreview(items(30), 18);

    assert.equal(tiles.length, PROFILE_MEDIA_PREVIEW_COUNT);
    assert.equal(overlayCount, 12);
  });

  /**
   * Kritik durum: sayfa kısa döndü (Ş3 §7.4 — görülemeyen ek düşer, kod çiti içindeki URL
   * öğe üretmez). Örtü sayfa uzunluğundan hesaplansaydı `+12` derdi; doğru cevap `+16`.
   */
  it("sayfa kısa döndüğünde çizilen karo sayısına göre borçlanır", () => {
    const { overlayCount, tiles } = selectMediaPreview(items(2), 18);

    assert.equal(tiles.length, 2);
    assert.equal(overlayCount, 16);
  });

  it("hepsi görünüyorsa örtü yok", () => {
    assert.equal(selectMediaPreview(items(6), 6).overlayCount, 0);
    assert.equal(selectMediaPreview([], 0).overlayCount, 0);
  });
});

describe("medya ızgarası", () => {
  it("örtüyü son karoya yazar", () => {
    const markup = render(
      <ProfileMediaGrid items={items(9)} now={NOW} onOpen={() => undefined} total={18} />,
    );

    assert.equal(markup.match(/data-testid="profile-media-tile"/g)?.length, 6);
    assert.equal(markup.match(/data-testid="profile-media-overflow"/g)?.length, 1);
    assert.match(markup, /\+12/);
  });

  it("örtü gerekmiyorsa hiç çizilmez", () => {
    const markup = render(
      <ProfileMediaGrid items={items(4)} now={NOW} onOpen={() => undefined} total={4} />,
    );

    assert.doesNotMatch(markup, /data-testid="profile-media-overflow"/);
  });

  /**
   * Altı istek panelin açılışını yarıştırmasın: karolar tembel yükleniyor. Karo gerçek bir
   * `button`, görselin kendisi `alt=""` — erişilebilir ad butonda, iki kez okunmasın.
   */
  it("görseller tembel yüklenir ve karo gerçek buttondur", () => {
    const markup = render(
      <ProfileMediaGrid items={items(3)} now={NOW} onOpen={() => undefined} total={3} />,
    );

    assert.equal(markup.match(/loading="lazy"/g)?.length, 3);
    assert.match(markup, /<button[^>]+data-testid="profile-media-tile"/);
    assert.match(markup, /alt=""/);
  });

  it("erişilebilir ad türü ve tarihi taşır", () => {
    const markup = render(
      <ProfileMediaGrid
        items={[media(1), media(2, { kind: "video", thumbnailUrl: null })]}
        now={NOW}
        onOpen={() => undefined}
        total={2}
      />,
    );

    assert.match(markup, /aria-label="Görsel · Dün/);
    assert.match(markup, /aria-label="Video · Dün/);
  });

  /**
   * Video karosu **süre** rozeti taşımıyor: `SharedMediaItemDTO` süre alanı açmadı ve
   * uydurulmuş bir `0:00` ürünün bilmediği bir sayı olurdu. Ayırt edici işaret oynat
   * simgesi.
   */
  it("video karosu oynat rozetiyle ayrılır", () => {
    const markup = render(
      <ProfileMediaGrid
        items={[media(1, { kind: "video" })]}
        now={NOW}
        onOpen={() => undefined}
        total={1}
      />,
    );

    assert.match(markup, /data-testid="profile-media-tile-video"/);
  });

  it("iskelet altı yer tutucu çizer", () => {
    const markup = render(<ProfileMediaGridSkeleton />);

    assert.match(markup, /data-testid="profile-media-grid-skeleton"/);
    assert.equal(markup.match(/animate-pulse/g)?.length, PROFILE_MEDIA_PREVIEW_COUNT);
  });
});
