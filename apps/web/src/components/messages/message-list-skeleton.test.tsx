import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MESSAGE_LIST_SKELETON_ROWS,
  MessageListSkeleton,
} from "@/components/messages/message-list-skeleton";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * SPEC-MESAJLAR §10 — yükleme iskeleti.
 *
 * İskeletin işi "bir şey oluyor" demek değil, **yer tutmak**: satır sayısı ve
 * ölçüler gerçek listenin ölçüleriyle aynı olmazsa mesajlar gelince yerleşim
 * zıplar ve yükleme durumu sorunu çözmek yerine görünür kılar.
 */

describe("mesaj listesi iskeleti", () => {
  it("altı satır çizer", () => {
    const markup = renderToStaticMarkup(<MessageListSkeleton />);
    const rows = markup.match(/data-testid="message-list-skeleton-row"/g) ?? [];

    assert.equal(MESSAGE_LIST_SKELETON_ROWS, 6);
    assert.equal(rows.length, 6);
  });

  /**
   * Ölçüler tokenden geliyor: iskelet kendi sayılarını taşısaydı gerçek satır
   * ölçüsü değiştiğinde sessizce yalancı olurdu.
   */
  it("avatar ve satır boşluğu gerçek satırın ölçüsünü kullanır", () => {
    const markup = renderToStaticMarkup(<MessageListSkeleton />);

    assert.ok(markup.includes(`gap:${pxToRem(MESSAGES_METRICS.messageList.rowGap)}`));
    assert.ok(markup.includes(`height:${pxToRem(MESSAGES_METRICS.messageList.avatarSize)}`));
    assert.ok(
      markup.includes(`padding-left:${pxToRem(MESSAGES_METRICS.messageList.rowPaddingX)}`),
      "yatay padding gerçek satırla aynı olmalı",
    );
  });

  /** Dekoratif kutular ekran okuyucuya okunmaz; durumu `sr-only` bölge söyler. */
  it("ekran okuyucudan gizlidir", () => {
    assert.match(renderToStaticMarkup(<MessageListSkeleton />), /aria-hidden="true"/);
  });

  /** Hareket azaltma tercihinde nabız durur. */
  it("prefers-reduced-motion altında animasyon kapanır", () => {
    assert.match(renderToStaticMarkup(<MessageListSkeleton />), /motion-reduce:animate-none/);
  });
});
