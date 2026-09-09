import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  SharedFileDTO,
  SharedLinkDTO,
  SharedMediaItemDTO,
  SharedMediaKind,
  SharedMediaPage,
} from "@wizards/types";

import {
  MEDIA_AUTO_FILL_PAGE_MAX,
  ProfileTabMedia,
  shouldAutoFillMediaGrid,
} from "@/components/messages/profile-tab-media";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { dmSharedMediaQueryKeys } from "@/lib/dm/shared-media-client";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — §15.5 `Medya` sekmesi.
 *
 * Üç bölüm, üç `useInfiniteQuery`, tek uç. Testler üç anahtarı ayrı ayrı besliyor: biri
 * beslenip diğeri boş bırakıldığında bölümlerin birbirini **beklemediği** ancak böyle
 * görülür.
 */

const CONVERSATION_ID = "conv-1";
const NOW = new Date("2026-08-27T12:00:00.000Z");

function mediaItem(index: number, overrides: Partial<SharedMediaItemDTO> = {}): SharedMediaItemDTO {
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

function fileItem(overrides: Partial<SharedFileDTO> = {}): SharedFileDTO {
  return {
    attachmentId: "file-1",
    createdAt: "2026-08-26T14:04:00.000Z",
    extension: "pdf",
    messageId: "m-90",
    name: "surum-2.4-notlari.pdf",
    sizeBytes: 1_258_291,
    url: "https://cdn.whispr.test/file-1",
    ...overrides,
  };
}

function linkItem(overrides: Partial<SharedLinkDTO> = {}): SharedLinkDTO {
  return {
    createdAt: "2026-08-26T14:04:00.000Z",
    host: "whispr.app",
    messageId: "m-91",
    title: "Sürüm 2.4 notları",
    url: "https://whispr.app/changelog",
    ...overrides,
  };
}

function seed(client: QueryClient, kind: SharedMediaKind, page: Partial<SharedMediaPage> = {}) {
  const resolved: SharedMediaPage = {
    items: [],
    kind,
    nextCursor: null,
    total: 0,
    ...page,
  };

  client.setQueryData([...dmSharedMediaQueryKeys.page(CONVERSATION_ID, kind)], {
    pageParams: [null],
    pages: [resolved],
  });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <ProfileTabMedia
          conversationId={CONVERSATION_ID}
          now={NOW}
          onOpenMessage={() => undefined}
          variant="group"
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("ızgara kendini doldurma kararı", () => {
  /**
   * Ş3 §7.4: bir sayfa sıfır öğe **ve** dolu bir imleçle dönebilir. Izgara altı karo
   * istiyor; "kısa sayfa = liste bitti" demek `+16` borçluyken iki karo çizmek olurdu.
   */
  it("kısa sayfa ve dolu imleçte bir sayfa daha ister", () => {
    assert.equal(
      shouldAutoFillMediaGrid({ hasNextPage: true, isFetching: false, loaded: 2, pagesLoaded: 1 }),
      true,
    );
  });

  it("altı karo dolduğunda durur", () => {
    assert.equal(
      shouldAutoFillMediaGrid({ hasNextPage: true, isFetching: false, loaded: 6, pagesLoaded: 1 }),
      false,
    );
  });

  it("imleç bittiğinde ve istek uçarken istemez", () => {
    assert.equal(
      shouldAutoFillMediaGrid({ hasNextPage: false, isFetching: false, loaded: 0, pagesLoaded: 1 }),
      false,
    );
    assert.equal(
      shouldAutoFillMediaGrid({ hasNextPage: true, isFetching: true, loaded: 0, pagesLoaded: 1 }),
      false,
    );
  });

  /** Tavan olmasa, geçmişi temizlenmiş bir sohbet altı kare için başına kadar sayfalardı. */
  it("sayfa tavanında durur", () => {
    assert.equal(
      shouldAutoFillMediaGrid({
        hasNextPage: true,
        isFetching: false,
        loaded: 0,
        pagesLoaded: MEDIA_AUTO_FILL_PAGE_MAX,
      }),
      false,
    );
  });
});

describe("sekme gövdesi", () => {
  it("üç sorguyu paralel kurar", () => {
    const client = newClient();

    render(client);

    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey.join("/"))
      .sort();

    assert.deepEqual(keys, [
      dmSharedMediaQueryKeys.page(CONVERSATION_ID, "file").join("/"),
      dmSharedMediaQueryKeys.page(CONVERSATION_ID, "link").join("/"),
      dmSharedMediaQueryKeys.page(CONVERSATION_ID, "media").join("/"),
    ]);
  });

  it("sayaç uçtaki total'dan gelir, sayfa uzunluğundan değil", () => {
    const client = newClient();
    seed(client, "media", { items: [mediaItem(1), mediaItem(2)], total: 18 });
    seed(client, "file");
    seed(client, "link");

    const markup = render(client);

    assert.match(markup, />18</);
    assert.match(markup, /\+16/);
  });

  it("dosya ve bağlantı satırlarını çizer", () => {
    const client = newClient();
    seed(client, "media");
    seed(client, "file", { items: [fileItem()], total: 1 });
    seed(client, "link", { items: [linkItem()], total: 1 });

    const markup = render(client);

    assert.match(markup, /data-testid="profile-file-row"/);
    assert.match(markup, /data-testid="profile-link-row"/);
    assert.match(markup, /1,2 MB/);
  });

  it("üç bölüm de boşken tek satırlık boş hâlini gösterir", () => {
    const client = newClient();
    seed(client, "media");
    seed(client, "file");
    seed(client, "link");

    const markup = render(client);

    assert.match(markup, /data-testid="profile-media-empty"/);
    assert.match(markup, /data-testid="profile-files-empty"/);
    assert.match(markup, /data-testid="profile-links-empty"/);
    assert.match(markup, /Paylaşılan medya yok/);
  });

  /**
   * Boş sayfa liste sonu değil: yalnız kod bloğu içinde URL taşıyan bir gövde sayfa
   * filtresini geçip hiç öğe üretmiyor (Ş3 §3). O sayfada "bağlantı yok" yazmak yalan.
   */
  it("boş ama imleçli sayfada boş hâl değil Daha fazla çizilir", () => {
    const client = newClient();
    seed(client, "media");
    seed(client, "file");
    seed(client, "link", { items: [], nextCursor: "cursor-2", total: 4 });

    const markup = render(client);

    assert.doesNotMatch(markup, /data-testid="profile-links-empty"/);
    assert.match(markup, /data-testid="profile-links-more"/);
  });

  it("her bölüm kendi iskeletini gösterir, birbirini beklemez", () => {
    const client = newClient();
    seed(client, "media", { items: [mediaItem(1)], total: 1 });

    const markup = render(client);

    // Medya geldi, diğer ikisi hâlâ uçuyor: ızgara çizilmiş, iki liste iskelette.
    assert.match(markup, /data-testid="profile-media-grid"/);
    assert.doesNotMatch(markup, /data-testid="profile-media-grid-skeleton"/);
    assert.equal(markup.match(/data-testid="profile-file-skeleton"/g)?.length, 2);
  });
});
