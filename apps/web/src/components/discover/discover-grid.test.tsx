import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverLane } from "@wizards/types";

import { DiscoverCardSkeleton } from "@/components/discover/discover-card-skeleton";
import { DiscoverGrid } from "@/components/discover/discover-grid";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const noop = () => undefined;

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

describe("DiscoverGrid", () => {
  it("medium ve large kart minimumlarını rem değişkenine yazar", () => {
    const medium = render(
      <DiscoverGrid cardSize="medium" lane="servers">
        <article>kart</article>
      </DiscoverGrid>,
    );
    const large = render(
      <DiscoverGrid cardSize="large" lane="servers">
        <article>kart</article>
      </DiscoverGrid>,
    );

    assert.ok(medium.includes("--discover-card-min:16.375rem"));
    assert.ok(large.includes("--discover-card-min:20.625rem"));
  });

  it("kanalları grid yerine tek kolon liste olarak çizer", () => {
    const markup = render(
      <DiscoverGrid cardSize="medium" lane="channels">
        <article>kanal</article>
      </DiscoverGrid>,
    );

    assert.ok(markup.includes('data-layout="list"'));
    assert.ok(markup.includes("flex-direction:column"));
  });

  it("profil paneli açıkken sunucu ızgarasını tek kolona düşürür", () => {
    const markup = render(
      <DiscoverGrid cardSize="medium" lane="servers" panelOpen>
        <article>sunucu</article>
      </DiscoverGrid>,
    );

    assert.ok(markup.includes("grid-template-columns:minmax(0, 1fr)"));
  });

  it("role=list eklemeden aktif şeridi aria-label ile adlandırır", () => {
    const markup = render(
      <DiscoverGrid cardSize="medium" lane="people">
        <article>kişi</article>
      </DiscoverGrid>,
    );

    assert.ok(markup.includes('aria-label="Kişiler"'));
    assert.ok(!markup.includes('role="list"'));
  });

  it("kişiler şeridinde sentinel kurmaz", () => {
    const markup = render(
      <DiscoverGrid cardSize="medium" hasMore lane="people" loadingMore={false} onLoadMore={noop}>
        <article>kişi</article>
      </DiscoverGrid>,
    );

    assert.ok(!markup.includes('data-testid="screen-infinite-sentinel"'));
  });

  it("sayfalı şeritlerde mevcut ScreenInfiniteSentinel bileşenini kullanır", () => {
    const markup = render(
      <DiscoverGrid cardSize="medium" hasMore lane="servers" loadingMore={false} onLoadMore={noop}>
        <article>sunucu</article>
      </DiscoverGrid>,
    );

    assert.ok(markup.includes('data-testid="screen-infinite-sentinel"'));
  });
});

describe("DiscoverCardSkeleton", () => {
  const lanes: readonly DiscoverLane[] = ["servers", "people", "channels", "events"];

  for (const lane of lanes) {
    it(`${lane} şeridi için altı kart ve tek canlı duyuru çizer`, () => {
      const markup = render(<DiscoverCardSkeleton lane={lane} />);

      assert.ok(markup.includes('aria-busy="true"'));
      assert.equal(markup.match(/data-testid="discover-skeleton-card"/g)?.length, 6);
      assert.equal(markup.match(/aria-live="polite"/g)?.length, 1);
      assert.equal(markup.split("Yükleniyor").length - 1, 1);
    });
  }
});
