import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PinnedMessageDTO } from "@wizards/types";

import { PinnedList } from "@/components/messages/pinned-list-sheet";
import { PinnedStrip, selectVisiblePin } from "@/components/messages/pinned-strip";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function pin(overrides: Partial<PinnedMessageDTO> = {}): PinnedMessageDTO {
  return {
    authorName: "Ada",
    excerpt: "Toplantı yarın 10:00",
    messageId: "message-1",
    pinnedAt: "2026-08-20T09:00:00.000Z",
    removable: true,
    ...overrides,
  };
}

function renderStrip(overrides: Partial<React.ComponentProps<typeof PinnedStrip>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <PinnedStrip
        dismissedId={null}
        onDismiss={() => undefined}
        onSeeAll={() => undefined}
        pins={[pin()]}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

// `PinnedListSheet` bir `Modal` portalı ve sunucuda `null` döner; sınanan şey
// listenin kendisidir.
function renderSheet(overrides: Partial<React.ComponentProps<typeof PinnedList>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <PinnedList
        onJump={() => undefined}
        onUnpin={() => undefined}
        pins={[pin()]}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("sabitlenen şerit (SPEC §5.2)", () => {
  it("sayı, önizleme ve Tümünü gör çizer", () => {
    const markup = renderStrip({ pins: [pin(), pin({ messageId: "message-2" })] });

    assert.ok(markup.includes("2 sabitlenen mesaj"));
    assert.ok(markup.includes("Ada"));
    assert.ok(markup.includes("Toplantı yarın 10:00"));
    assert.match(markup, /data-testid="pinned-strip-see-all"/);
  });

  it("sabit yoksa çizilmez", () => {
    assert.equal(renderStrip({ pins: [] }), "");
  });

  it("kapatılan sabit gizlenir", () => {
    assert.equal(renderStrip({ dismissedId: "message-1" }), "");
  });

  /**
   * Kapatma kalıcı olsaydı, birinin sabitlediği yeni bir mesaj diğerine hiç
   * görünmezdi. `dismissedId` yalnız o an görülen sabiti saklar.
   */
  it("yeni sabit gelince şerit geri döner", () => {
    const markup = renderStrip({
      dismissedId: "message-1",
      pins: [pin({ excerpt: "Yeni duyuru", messageId: "message-2" }), pin()],
    });

    assert.ok(markup.includes("Yeni duyuru"));
  });

  it("selectVisiblePin en yeni sabiti verir", () => {
    const newest = pin({ messageId: "message-2" });

    assert.equal(selectVisiblePin([newest, pin()], null)?.messageId, "message-2");
    assert.equal(selectVisiblePin([newest, pin()], "message-2"), null);
    assert.equal(selectVisiblePin([], null), null);
  });
});

describe("sabitlenenler listesi (Tümünü gör)", () => {
  it("her satırda mesaja git bulunur", () => {
    const markup = renderSheet();

    assert.match(markup, /data-testid="pinned-list-row"/);
    assert.match(markup, /data-testid="pinned-list-jump"/);
  });

  /**
   * Yetkiyi uç söylüyor (`removable`). İstemci "kendi mesajı mı" diye tahmin
   * etseydi, başkasının mesajını kaldırabilen yöneticiyi kaçırırdı.
   */
  it("yetkisi olmayanda kaldırma butonu çizilmez", () => {
    assert.match(renderSheet(), /data-testid="pinned-list-unpin"/);
    assert.doesNotMatch(
      renderSheet({ pins: [pin({ removable: false })] }),
      /data-testid="pinned-list-unpin"/,
    );
  });

  it("boş listede tek satır metin", () => {
    const markup = renderSheet({ pins: [] });

    assert.match(markup, /data-testid="pinned-list-empty"/);
    assert.doesNotMatch(markup, /data-testid="pinned-list-row"/);
  });
});
