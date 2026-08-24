import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";

import { renderWithLocale } from "@/components/home/home-test-render";

import { AwaitingRow } from "@/components/home/home-awaiting-card";
import { HomeListRow } from "@/components/home/home-list-row";
import { HOME_METRICS } from "@/lib/home/metrics";
import type { HomeAwaitingItem } from "@/lib/home/types";

import { ScreenFilterChips, ScreenSegmented } from "./screen-chips";
import { ScreenInfiniteSentinel } from "./screen-infinite-sentinel";

/**
 * `07-faz6` §8 — yan ekranların çizim sözleşmesi.
 *
 * Ekranların kendisi sorgu açar, o yüzden burada test edilen şey sunum katmanı:
 * satırın **tek dosya** olduğu, okunmamış şeridin gerçekten çizildiği, çiplerin
 * doğru rolü taşıdığı ve sonsuz listenin sesli okunduğu.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");

type ListRowFixture = {
  author: React.ComponentProps<typeof HomeListRow>["user"];
  context: string;
  excerpt: string;
  href: string;
  occurredAt: string;
  read: boolean;
};

const MENTION: ListRowFixture = {
  author: { avatarUrl: null, displayName: "Ayşe", presence: "ONLINE" },
  context: "Whispr · #genel",
  excerpt: "@ben şuna bakabilir misin",
  href: "/channels/s1/c1?message=m1",
  occurredAt: "2026-08-19T11:58:00.000Z",
  read: false,
};

const AWAITING: HomeAwaitingItem = {
  action: "accept",
  context: "",
  href: "/messages",
  id: "friend_request:fr-1",
  occurredAt: "2026-08-19T11:40:00.000Z",
  reason: "",
  source: "friend_request",
  user: { avatarUrl: null, displayName: "Selin", id: "u3", presence: "IDLE" },
};

function mentionRowMarkup(item: ListRowFixture = MENTION): string {
  return renderWithLocale(
    <HomeListRow
      context={item.context}
      excerpt={item.excerpt}
      href={item.href}
      now={NOW}
      occurredAt={item.occurredAt}
      testId="mentions-row"
      unread={!item.read}
      user={item.author}
      variant="full"
    />,
  );
}

/**
 * Ana Sayfa'nın liste satırı (`HomeListRow`). Bu blok Bahsedilmeler ekranının satırıydı;
 * Dalga 2 / Ş5 o ekranı `components/mentions/` altındaki akışla değiştirdi ve satır Ana Sayfa
 * ile Gelen kutusuna kaldı. İddialar aynen duruyor çünkü satırın kendisi değişmedi — yalnız
 * sahibi değişti.
 */
describe("Ana Sayfa liste satırı", () => {
  it("okunmamış satırın soluna 3px --primary şerit çizer", () => {
    const markup = mentionRowMarkup();

    assert.match(markup, /data-unread="true"/);
    // §2.1 birebir: 3px. `inset` gölge olarak, çünkü ayrı bir öğe yarıçapı takip
    // etmez ve satırın genişliğini oynatırdı.
    assert.match(markup, /inset 0\.1875rem 0 0 0 hsl\(var\(--primary\)\)/);
  });

  it("okunmuş satırda şerit hiç yoktur", () => {
    const markup = mentionRowMarkup({ ...MENTION, read: true });

    assert.ok(!markup.includes("data-unread"));
    assert.ok(!markup.includes("inset 0.1875rem"));
  });

  it("alıntıyı iki satıra kadar sarar, kartta ise tek satırda keser", () => {
    assert.match(mentionRowMarkup(), /line-clamp-2/);

    const cardRow = renderWithLocale(
      <HomeListRow
        context="Whispr · #genel"
        excerpt="kısa"
        href="/x"
        now={NOW}
        occurredAt={MENTION.occurredAt}
        user={MENTION.author}
      />,
    );

    assert.ok(!cardRow.includes("line-clamp-2"));
    assert.match(cardRow, /truncate whitespace-nowrap/);
  });

  it("bağlamı boş olan satırda ikinci başlık parçası hiç çizilmez", () => {
    const markup = renderWithLocale(
      <HomeListRow
        context=""
        excerpt="merhaba"
        href="/x"
        now={NOW}
        occurredAt={MENTION.occurredAt}
        user={MENTION.author}
      />,
    );

    assert.ok(!markup.includes('text-muted))]" style="font-size:0.71875rem">'));
  });
});

/**
 * §8 — "Yanıt bekliyor satırı tek bileşen: Ana Sayfa ve Gelen kutusu aynı dosyayı
 * kullanıyor". Kaynak seviyesinde bakılıyor, çünkü asıl iddia "aynı görünüyor"
 * değil, **aynı dosya**.
 */
describe("tek satır bileşeni", () => {
  const rowSource = readFileSync(new URL("../home/home-list-row.tsx", import.meta.url), "utf8");
  const cardSource = readFileSync(
    new URL("../home/home-awaiting-card.tsx", import.meta.url),
    "utf8",
  );
  const inboxSource = readFileSync(new URL("./inbox-screen.tsx", import.meta.url), "utf8");

  it("satır kutusunu yalnız bir dosya çiziyor", () => {
    // Avatar + presence noktası + zaman damgası üçlüsü satırın imzası.
    assert.match(rowSource, /<PresenceDot/);
    assert.ok(!inboxSource.includes("<PresenceDot"));
    assert.ok(!cardSource.includes("<PresenceDot"));
  });

  it("Ana Sayfa kartı ve Gelen kutusu aynı satırı içeri alıyor", () => {
    assert.match(cardSource, /from "\.\/home-list-row"/);
    assert.match(
      inboxSource,
      /import \{ AwaitingRow \} from "@\/components\/home\/home-awaiting-card"/,
    );
  });

  /**
   * Bahsedilmeler Dalga 2 / Ş5: eski `mentions-screen.tsx` **silindi**. Ekran artık
   * `components/mentions/` altındaki akış; `HomeListRow` Ana Sayfa'nın kendi satırı olarak
   * kaldı ve Bahsedilmeler onu artık kullanmıyor.
   *
   * İddia dosyanın yokluğu üzerinden kuruluyor, çünkü asıl sözleşme "eski ekran gitti" —
   * "yeni ekran şöyle çiziyor" değil; onun testleri `components/mentions/` altında.
   */
  it("eski Bahsedilmeler ekranı kaldırıldı ve hiçbir yerden içeri alınmıyor", () => {
    assert.equal(existsSync(new URL("./mentions-screen.tsx", import.meta.url)), false);

    const routeSource = readFileSync(
      new URL("../../app/(main)/mentions/page.tsx", import.meta.url),
      "utf8",
    );

    assert.ok(!routeSource.includes("components/screens/mentions-screen"));
    assert.match(routeSource, /from "@\/components\/mentions\/mentions-page"/);
  });

  it("Gelen kutusu satırı geniş varyantla, ama aynı aksiyonla çiziyor", () => {
    const inbox = renderWithLocale(
      <AwaitingRow
        item={AWAITING}
        now={NOW}
        onAccept={() => undefined}
        pending={false}
        variant="full"
      />,
    );
    const card = renderWithLocale(
      <AwaitingRow item={AWAITING} now={NOW} onAccept={() => undefined} pending={false} />,
    );

    assert.match(inbox, /data-testid="home-awaiting-row"/);
    assert.match(card, /data-testid="home-awaiting-row"/);
    // Aynı aksiyon, aynı testid — ikinci bir "kabul et" yolu yok.
    for (const markup of [inbox, card]) {
      assert.match(markup, /data-testid="home-awaiting-action"[^>]*>Kabul et</);
    }
    assert.match(inbox, /line-clamp-2/);
    assert.ok(!card.includes("line-clamp-2"));
  });

  it("uçuştaki satırın butonu her iki yüzeyde de devre dışı", () => {
    const markup = renderWithLocale(
      <AwaitingRow item={AWAITING} now={NOW} onAccept={() => undefined} pending variant="full" />,
    );

    assert.match(markup, /data-testid="home-awaiting-action"[^>]*disabled/);
  });
});

describe("çipler", () => {
  const choices = [
    { label: "Tümü", value: "all" },
    { label: "Okunmamış", value: "unread" },
  ] as const;

  it("filtre çipleri button + aria-pressed taşır", () => {
    const markup = renderWithLocale(
      <ScreenFilterChips
        choices={choices}
        label="Bahsedilmeler"
        onSelect={() => undefined}
        testId="mentions-filter"
        value="unread"
      />,
    );

    assert.match(markup, /aria-pressed="false"[^>]*data-testid="mentions-filter-all"/);
    assert.match(markup, /aria-pressed="true"[^>]*data-testid="mentions-filter-unread"/);
    assert.ok(!markup.includes('role="tab"'));
  });

  /**
   * Ş10: bu segmentin tek tüketicisi olan eski Etkinlikler ekranı silindi; ortak ilkel
   * (`ScreenSegmented`) yerinde ve testli kaldı, örnek etiketleri artık nötr.
   */
  it("görünüm segmenti tablist/tab + aria-selected taşır", () => {
    const markup = renderWithLocale(
      <ScreenSegmented
        choices={[
          { label: "Liste", value: "list" },
          { label: "Izgara", value: "grid" },
        ]}
        label="Görünüm"
        onSelect={() => undefined}
        testId="view-mode"
        value="grid"
      />,
    );

    assert.match(markup, /role="tablist"/);
    assert.match(markup, /aria-selected="true"[^>]*data-testid="view-mode-grid"/);
    assert.match(markup, /aria-selected="false"[^>]*data-testid="view-mode-list"/);
    // Tek sekme durağı: seçili olmayan sekme Tab sırasında değil.
    assert.match(markup, /data-testid="view-mode-list"[\s\S]*?tabindex="-1"/);
  });

  it("çip kutusu `Durumun` kartındaki çiple aynı", () => {
    const markup = renderWithLocale(
      <ScreenFilterChips
        choices={choices}
        label="Bahsedilmeler"
        onSelect={() => undefined}
        testId="mentions-filter"
        value="all"
      />,
    );

    const { presenceCard } = HOME_METRICS;
    assert.equal(presenceCard.chipPaddingY, 8);
    assert.equal(presenceCard.chipPaddingX, 10);
    assert.equal(presenceCard.chipRadius, 11);
    assert.match(markup, /border-radius:0\.6875rem/);
    assert.match(markup, /padding:0\.5rem 0\.625rem/);
  });
});

describe("sonsuz listenin alt sınırı", () => {
  it("yükleniyor durumunu aria-live ile duyurur", () => {
    const markup = renderWithLocale(
      <ScreenInfiniteSentinel hasMore loading onLoadMore={() => undefined} />,
    );

    assert.match(markup, /aria-live="polite"/);
    assert.match(markup, /Daha fazla yükleniyor/);
  });

  it("yükleme yokken bölgeyi boş bırakır ama kaldırmaz", () => {
    const markup = renderWithLocale(
      <ScreenInfiniteSentinel hasMore={false} loading={false} onLoadMore={() => undefined} />,
    );

    // Bölge kalır: `aria-live` sonradan eklenen bir kap duyurmaz.
    assert.match(markup, /aria-live="polite"/);
    assert.ok(!markup.includes("Daha fazla yükleniyor"));
  });
});
