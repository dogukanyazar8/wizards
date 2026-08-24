import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MessageSearchHitDTO } from "@wizards/types";

import { MessageSearchResults } from "@/components/messages/message-search-results";
import { MessagesSidePanel } from "@/components/messages/messages-side-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function wrap(node: React.ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof MessagesSidePanel>> = {}) {
  return wrap(
    <MessagesSidePanel onClose={() => undefined} title="Thread" {...overrides}>
      <p>gövde</p>
    </MessagesSidePanel>,
  );
}

function hit(overrides: Partial<MessageSearchHitDTO> = {}): MessageSearchHitDTO {
  return {
    authorAvatarUrl: null,
    authorId: "user-1",
    authorInitials: "AD",
    authorName: "Ada",
    conversationId: "conversation-1",
    conversationName: "Ada",
    excerpt: "yoğunluğu ölçtük",
    matchRanges: [[0, 9]],
    messageId: "message-1",
    timeLabel: "14:32",
    ...overrides,
  };
}

function renderResults(overrides: Partial<React.ComponentProps<typeof MessageSearchResults>> = {}) {
  return wrap(
    <MessageSearchResults
      chips={[]}
      onChangeQuery={() => undefined}
      onSelect={() => undefined}
      query="yoğun"
      results={[hit()]}
      totalLabel={1}
      {...overrides}
    />,
  );
}

describe("ortak panel kabuğu (SPEC §6)", () => {
  it("340 genişlik ve başlık satırı", () => {
    const markup = renderPanel();

    assert.match(markup, /data-testid="messages-side-panel"/);
    assert.match(markup, /width:21\.25rem/);
    assert.match(markup, /data-testid="messages-side-panel-close"/);
  });

  /**
   * Yerleşik panelde focus tuzağı kurulsaydı, klavye kullanıcısı sohbetin geri
   * kalanı gözünün önündeyken oraya hiç gidemezdi.
   */
  it("yerleşikken complementary, overlay'de dialog", () => {
    assert.match(renderPanel(), /role="complementary"/);
    assert.doesNotMatch(renderPanel(), /aria-modal/);

    const overlay = renderPanel({ overlay: true });

    assert.match(overlay, /role="dialog"/);
    assert.match(overlay, /aria-modal="true"/);
  });

  it("başlık odaklanabilir — panel açılınca odak oraya gider", () => {
    assert.match(renderPanel(), /data-testid="messages-side-panel-title"[^>]*tabindex="-1"/);
  });

  it("alt satır verilmezse çizilmez", () => {
    assert.doesNotMatch(renderPanel(), /data-testid="messages-side-panel-subtitle"/);
    assert.match(
      renderPanel({ subtitle: "Toplantı · 4 yanıt" }),
      /data-testid="messages-side-panel-subtitle"/,
    );
  });
});

describe("arama paneli gövdesi (SPEC §6.2)", () => {
  it("sonuç kartı yazar, saat ve eşleşme taşır", () => {
    const markup = renderResults();

    assert.match(markup, /data-testid="message-search-result"/);
    assert.ok(markup.includes("Ada"));
    assert.ok(markup.includes("14:32"));
    assert.ok(markup.includes("1 sonuç"));
  });

  /** Vurgu aralığı sunucudan; istemci kendi aramasını kurmaz. */
  it("eşleşen kelimeyi mark ile sarar", () => {
    const markup = renderResults();

    assert.match(markup, /data-testid="message-search-highlight"[^>]*>yoğunluğu</);
  });

  it("sonuç yokken tek satır metin", () => {
    const markup = renderResults({ results: [], totalLabel: 0 });

    assert.match(markup, /data-testid="message-search-empty"/);
    assert.doesNotMatch(markup, /data-testid="message-search-result"/);
  });

  /** Liste boşaltılsaydı her harfte silinip yeniden kurulurdu. */
  it("yenilenirken önceki sonuçlar kaybolmaz, soluklaşır", () => {
    const markup = renderResults({ isRefreshing: true });

    assert.match(markup, /data-refreshing="true"/);
    assert.match(markup, /data-testid="message-search-result"/);
  });

  it("kişi çipi kaldırılabilir olarak çizilir", () => {
    const markup = renderResults({
      chips: [
        {
          active: true,
          id: "person",
          label: "Kişi: Ada",
          onRemove: () => undefined,
        },
      ],
    });

    assert.match(markup, /data-testid="message-search-chip-person"/);
    assert.match(markup, /data-testid="message-search-chip-remove-person"/);
  });

  it("çip yokken filtre şeridi hiç çizilmez", () => {
    assert.doesNotMatch(renderResults(), /data-testid="message-search-filters"/);
  });
});
