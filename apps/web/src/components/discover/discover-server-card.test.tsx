import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverServer } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { DiscoverServerCard } from "@/components/discover/discover-server-card";
import { getMessagesForLocale } from "@/lib/locale";

const noop = () => undefined;

function server(overrides: Partial<DiscoverServer> = {}): DiscoverServer {
  return {
    category: "oyun",
    description: "Turnuvalar ve sahne yayınları için topluluk.",
    featured: false,
    iconUrl: null,
    id: "server-1",
    initials: "OK",
    joined: false,
    languages: ["tr"],
    memberCount: 48_200,
    name: "Oyun Kulübü Türkiye",
    onlineCount: 3_910,
    tags: ["Turnuva", "Sahne"],
    ...overrides,
  };
}

function render(item: DiscoverServer, selected = false): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverServerCard
        onOpen={noop}
        onPreview={noop}
        onToggleJoin={noop}
        selected={selected}
        server={item}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverServerCard", () => {
  it("article kökü, klavye ile açılan kart düğmesi ve gerçek eylem düğmeleri çizer", () => {
    const markup = render(server());

    assert.ok(markup.startsWith("<article"));
    assert.ok(markup.includes('data-testid="discover-server-card-open"'));
    assert.ok(markup.includes('data-category="oyun"'));
    assert.equal(markup.match(/type="button"/g)?.length, 3);
    assert.ok(markup.includes("after:absolute"));
    assert.ok(!markup.includes("lucide-badge-check"));
  });

  it("kenar önceliğini seçili, katıldı, varsayılan sırasıyla uygular", () => {
    const selectedJoined = render(server({ joined: true }), true);
    const joined = render(server({ joined: true }));
    const idle = render(server());

    assert.ok(selectedJoined.includes('data-border-state="selected"'));
    assert.ok(selectedJoined.includes("hsl(var(--primary)/0.5)"));
    assert.ok(joined.includes('data-border-state="joined"'));
    assert.ok(joined.includes("hsl(var(--success)/0.4)"));
    assert.ok(idle.includes('data-border-state="default"'));
    assert.ok(idle.includes("hsl(var(--border)/0.6)"));
  });

  it("katılmış kart basılı durumu ve Katıldın metnini taşır", () => {
    const markup = render(server({ joined: true }));

    assert.ok(markup.includes('aria-pressed="true"'));
    assert.ok(markup.includes("Katıldın"));
  });

  it("null kategori için primary tile kullanır; boş etikette satır bırakmaz", () => {
    const markup = render(server({ category: null, tags: [] }));

    assert.ok(markup.includes('data-tone="primary"'));
    assert.ok(!markup.includes('data-testid="discover-server-card-tags"'));
  });

  it("render sırasında fetch çağırmaz", (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response();
    });

    render(server());
    assert.equal(calls, 0);
  });
});
