import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverPerson } from "@wizards/types";

import { DiscoverPersonCard } from "@/components/discover/discover-person-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const noop = () => undefined;

function person(overrides: Partial<DiscoverPerson> = {}): DiscoverPerson {
  return {
    avatarUrl: null,
    handle: "selin",
    id: "person-1",
    initials: "SA",
    interestTags: ["Tasarım", "Ürün"],
    mutualServerCount: 3,
    mutualServerName: "Whispr Topluluğu",
    name: "Selin Aksoy",
    presence: "online",
    requestSent: false,
    ...overrides,
  };
}

function render(item: DiscoverPerson, reason?: string): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverPersonCard
        onAddFriend={noop}
        onOpen={noop}
        onOpenProfile={noop}
        person={item}
        {...(reason === undefined ? {} : { reason })}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverPersonCard", () => {
  it("article kökü, tam kart düğmesi ve aria-label taşıyan profil düğmesi çizer", () => {
    const markup = render(person());

    assert.ok(markup.startsWith("<article"));
    assert.ok(markup.includes('data-testid="discover-person-card-open"'));
    assert.ok(markup.includes('aria-label="Profili aç"'));
    assert.ok(markup.includes('aria-label="çevrimiçi"'));
    assert.ok(markup.includes("before:-inset-1.5"));
    assert.equal(markup.match(/type="button"/g)?.length, 3);
    assert.ok(!markup.includes("lucide-badge-check"));
  });

  it("etiket yoksa etiket satırı; ortak metin ve gerekçe yoksa ortak şerit çizmez", () => {
    const markup = render(
      person({ interestTags: [], mutualServerCount: 0, mutualServerName: null }),
    );

    assert.ok(!markup.includes('data-testid="discover-person-card-tags"'));
    assert.ok(!markup.includes('data-testid="discover-person-card-mutual"'));
  });

  it("ortak sunucu yoksa verilen öneri gerekçesini çizer", () => {
    const markup = render(
      person({ mutualServerCount: 0, mutualServerName: null }),
      "Dil Değişimi’nde eşleşme önerisi",
    );

    assert.ok(markup.includes("Dil Değişimi’nde eşleşme önerisi"));
  });

  it("istek gönderilmişse düğmeyi pasifleştirir", () => {
    const markup = render(person({ requestSent: true }));

    assert.ok(markup.includes("İstek gönderildi"));
    assert.ok(markup.includes("disabled"));
  });

  it("presence noktasını renk yanında görünmez metinle açıklar", () => {
    const markup = render(person({ presence: "idle" }));

    assert.ok(markup.includes("hsl(var(--warning))"));
    assert.ok(markup.includes("Boşta"));
  });

  it("render sırasında fetch çağırmaz", (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response();
    });

    render(person());
    assert.equal(calls, 0);
  });
});
