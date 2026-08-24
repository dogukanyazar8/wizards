import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Mention, MentionContext } from "@wizards/types";

import { MentionContextPanel } from "@/components/mentions/mention-context-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { mentionsQueryKeys } from "@/lib/mentions/client";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";

/**
 * Ş7 — bağlam paneli (SPEC §6).
 *
 * Panel kendi sorgusunu açıyor; testler onu bir `QueryClient` önbelleğine **hazır veri**
 * koyarak sürüyor — sahte bir `fetch` kurmak, ağın olmadığını değil ağın ne döndüğünü test
 * etmek olurdu.
 */

const { shell } = MENTIONS_METRICS;

const CONTEXT: MentionContext = {
  messages: [
    {
      authorName: "Mert Kaya",
      avatarUrl: null,
      id: "b1",
      initials: "MK",
      isMention: false,
      text: "bir önceki mesaj",
      time: "2026-08-21T06:39:00.000Z",
    },
    {
      authorName: "Selin Aksoy",
      avatarUrl: null,
      id: "m-1",
      initials: "SA",
      isMention: true,
      text: "bahsetmenin kendisi",
      time: "2026-08-21T06:41:00.000Z",
    },
    {
      authorName: "Can Öztürk",
      avatarUrl: null,
      id: "a1",
      initials: "CÖ",
      isMention: false,
      text: "sonraki mesaj",
      time: "2026-08-21T06:42:00.000Z",
    },
  ],
};

function mention(overrides: Partial<Mention> = {}): Mention {
  return {
    author: { avatarUrl: null, handle: "selin", id: "u2", initials: "SA", name: "Selin Aksoy" },
    body: "bakar mısın",
    createdAt: "2026-08-21T06:41:00.000Z",
    href: "/channels/s1/c1?message=m-1",
    id: "channel:mn-1",
    kind: "me",
    messageId: "m-1",
    permalink: "https://whispr.test/channels/s1/c1?message=m-1",
    readLater: false,
    source: {
      channelId: "c1",
      channelName: "tasarım-kritiği",
      serverId: "s1",
      serverInitial: "W",
      serverName: "Whispr Topluluğu",
      type: "channel",
    },
    stateKey: { refId: "mn-1", source: "channel" },
    tag: "@Doğukan Yazar",
    unread: true,
    ...overrides,
  };
}

function render(target: Mention | null = mention(), context: MentionContext | null = CONTEXT) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (context) {
    client.setQueryData(mentionsQueryKeys.context(target?.id ?? "channel:mn-1"), context);
  }

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <QueryClientProvider client={client}>
        <MentionContextPanel
          mention={target}
          mentionId={target?.id ?? "channel:mn-1"}
          onClose={() => {}}
          onOpen={() => {}}
          onReplyInThread={() => {}}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("MentionContextPanel — kabuk", () => {
  it("326px kolon ve başlıkta kaynak satırı", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(shell.contextPanelWidth)}`));
    assert.ok(markup.includes("Bağlam"));
    assert.ok(markup.includes("Whispr Topluluğu › #tasarım-kritiği"));
  });

  it("sütun hâlinde diyalog değildir — odak tuzağı yok", () => {
    const markup = render();

    // İlk boyada `overlay` false: sunucu çiziminde `role="dialog"` yazılmaz.
    assert.ok(!markup.includes('role="dialog"'));
    assert.ok(!markup.includes("aria-modal"));
  });

  it("kırılım CSS'te seçilir, JavaScript genişlik okumasıyla değil", () => {
    const markup = render();

    assert.ok(markup.includes("max-[68.6875rem]:fixed"));
    assert.ok(markup.includes("min-[68.75rem]:relative"));
    assert.doesNotMatch(markup, /\[[0-9]+px\]/u);
  });
});

describe("MentionContextPanel — gövde", () => {
  it("bahsetmenin kendisi vurgulu, diğer satırlar düz", () => {
    const markup = render();

    assert.equal(markup.match(/data-testid="mention-context-row"/g)?.length, 3);
    assert.equal(markup.match(/data-mention="true"/g)?.length, 1);
    assert.ok(
      markup.includes(`hsl(var(--primary)/${MENTIONS_METRICS.contextPanel.highlightSurfaceAlpha})`),
    );
    assert.ok(
      markup.includes(`hsl(var(--primary)/${MENTIONS_METRICS.contextPanel.highlightBorderAlpha})`),
    );
  });

  it("veri yokken iskelet çizilir", () => {
    const markup = render(mention(), null);

    assert.ok(markup.includes('data-testid="mention-context-skeleton"'));
    assert.ok(!markup.includes('data-testid="mention-context-row"'));
  });

  it("üç mesajın da adı ve metni çizilir", () => {
    const markup = render();

    for (const text of ["bir önceki mesaj", "bahsetmenin kendisi", "sonraki mesaj"]) {
      assert.ok(markup.includes(text), text);
    }
  });
});

describe("MentionContextPanel — altlık", () => {
  it("Kanalda aç bahsetmenin adresine gider", () => {
    const markup = render();

    assert.ok(markup.includes("Kanalda aç"));
    assert.ok(markup.includes('href="/channels/s1/c1?message=m-1"'));
  });

  it("thread'i olmayan bahsetmede Thread'de yanıtla gizlenir", () => {
    assert.ok(!render().includes('data-testid="mention-context-reply-thread"'));
  });

  it("DM bahsetmesinde de gizlenir", () => {
    const dm = mention({
      href: "/messages/conv-1?message=m-9",
      kind: "thread",
      source: { conversationId: "conv-1", title: "Zeynep Arı", type: "dm" },
      thread: { id: "p1", open: true, replyCount: 2 },
    });

    assert.ok(!render(dm).includes('data-testid="mention-context-reply-thread"'));
  });

  it("thread kartında görünür — satır içi yanıtın gerçekten thread'e gittiği tek durum", () => {
    const thread = mention({ kind: "thread", thread: { id: "p1", open: true, replyCount: 2 } });

    assert.ok(render(thread).includes('data-testid="mention-context-reply-thread"'));
  });

  it("thread içindeki bir kanal bahsetmesinde gizli kalır — buton yalan söylemez", () => {
    const inThread = mention({ thread: { id: "p1", open: true, replyCount: 2 } });

    assert.ok(!render(inThread).includes('data-testid="mention-context-reply-thread"'));
  });
});
