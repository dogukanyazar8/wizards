import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InviteCandidateDTO } from "@wizards/types";

import {
  InviteCandidateRow,
  inviteCandidateStatusKey,
} from "@/components/messages/invite-candidate-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş10 — §16'nın aday satırı.
 *
 * Satırın tamamı tek hedef: onay kutusu `aria-hidden` süs, durum `role="option"` +
 * `aria-selected` üzerinden okunuyor.
 */

function candidate(overrides: Partial<InviteCandidateDTO> = {}): InviteCandidateDTO {
  return {
    initials: "CÖ",
    name: "Can Öztürk",
    presence: "online",
    statusText: null,
    tint: "primary",
    userId: "user-2",
    ...overrides,
  };
}

function render(props: Partial<React.ComponentProps<typeof InviteCandidateRow>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <InviteCandidateRow
        candidate={candidate()}
        onToggle={() => undefined}
        selected={false}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("aday satırı — tek tıklama hedefi", () => {
  it("satırın kendisi buton ve role=option", () => {
    const markup = render();

    assert.match(markup, /<button[^>]*role="option"/);
    assert.match(markup, /data-testid="invite-candidate-user-2"/);
  });

  it("onay kutusu ayrı bir tıklama hedefi değil", () => {
    const markup = render();
    const box = /data-testid="invite-candidate-box-user-2"/.exec(markup);

    assert.ok(box);
    // Kutu bir `span`; markup'ta ikinci bir `<button` yalnız satırın kendisidir.
    assert.equal(markup.split("<button").length - 1, 1);
    assert.match(markup, /aria-hidden="true"[^>]*data-testid="invite-candidate-box-user-2"/);
  });

  it("seçim durumu aria-selected ile taşınır", () => {
    assert.match(render({ selected: false }), /aria-selected="false"/);
    assert.match(render({ selected: true }), /aria-selected="true"/);
  });

  it("seçili satır primary zemine geçer", () => {
    assert.match(render({ selected: true }), /background:hsl\(var\(--primary\)\/0\.1\)/);
  });
});

describe("aday satırı — kimlik ve durum", () => {
  it("baş harf karosu tintten boyanır, ham hex yok", () => {
    const markup = render({ candidate: candidate({ tint: "success" }) });

    assert.match(markup, /CÖ/);
    assert.match(markup, /hsl\(var\(--success\)/);
    assert.doesNotMatch(markup, /#[0-9a-fA-F]{6}/);
  });

  it("kendi durum metni varsa o basılır", () => {
    const markup = render({
      candidate: candidate({ statusText: "PUBG oynuyor · 2. sıra" }),
    });

    assert.match(markup, /PUBG oynuyor · 2. sıra/);
  });

  it("durum metni yoksa presence sözcüğüne düşer", () => {
    const markup = render({ candidate: candidate({ presence: "offline", statusText: null }) });

    assert.match(markup, /Çevrimdışı/i);
  });

  it("presence anahtarları dört durumu da karşılar", () => {
    const messages = getMessagesForLocale("tr");

    for (const presence of ["online", "idle", "dnd", "offline"] as const) {
      assert.ok(inviteCandidateStatusKey(presence) in messages, presence);
    }
  });

  it("presence noktasının metin karşılığı var", () => {
    const markup = render();

    assert.match(markup, /sr-only/);
  });
});

describe("aday satırı — roving tabindex", () => {
  it("varsayılan sekme turunda durmaz", () => {
    assert.match(render(), /tabindex="-1"/);
  });

  it("listenin ilk satırı sekme turunda durur", () => {
    assert.match(render({ tabIndex: 0 }), /tabindex="0"/);
  });
});
