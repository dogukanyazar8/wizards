import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectQuickStart, type ConversationRowDTO } from "@wizards/types";

import { MessagesEmptyState } from "@/components/messages/messages-empty-state";
import { NewMessagePickerContent } from "@/components/messages/new-message-picker";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function row(overrides: Partial<ConversationRowDTO> = {}): ConversationRowDTO {
  return {
    id: "conversation-1",
    initials: "AD",
    kind: "dm",
    name: "Ada",
    pinned: false,
    presence: "online",
    preview: { authorPrefix: null, text: "Merhaba" },
    tileColor: null,
    timeLabel: "14:32",
    unreadCount: 0,
    ...overrides,
  };
}

function wrap(node: React.ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

function renderEmpty(overrides: Partial<React.ComponentProps<typeof MessagesEmptyState>> = {}) {
  return wrap(
    <MessagesEmptyState
      conversations={[
        row(),
        row({
          id: "conversation-2",
          initials: "TE",
          kind: "group",
          name: "Tasarım",
          tileColor: "info",
        }),
        row({ id: "conversation-3", initials: "BK", name: "Berk" }),
        row({ id: "conversation-4", initials: "CE", name: "Ceren" }),
      ]}
      onNewGroup={() => undefined}
      onNewMessage={() => undefined}
      onOpenConversation={() => undefined}
      {...overrides}
    />,
  );
}

describe("boş durum (SPEC §9)", () => {
  it("başlık, açıklama ve iki buton", () => {
    const markup = renderEmpty();

    assert.ok(markup.includes("Kiminle konuşalım?"));
    assert.ok(markup.includes("250"));
    assert.match(markup, /lucide-message-circle/);
    assert.match(markup, /data-testid="messages-empty-new-message"[\s\S]*lucide-plus/);
    assert.match(markup, /data-testid="messages-empty-new-group"[\s\S]*lucide-user-plus/);
    assert.doesNotMatch(markup, /lucide-message-square-plus/);
    assert.match(markup, /data-testid="messages-empty-new-message"/);
    assert.match(markup, /data-testid="messages-empty-new-group"/);
  });

  it("üç hızlı başla çipi çizer", () => {
    const chips = renderEmpty().match(/data-testid="messages-empty-quick-chip"/g) ?? [];

    assert.equal(chips.length, 3);
  });

  /**
   * Boş bir etiketin altında hiçbir şey olmaması, kullanıcıya bir şeyin
   * yüklenmediğini düşündürürdü.
   */
  it("sohbet yokken çip şeridi ve etiket hiç çizilmez", () => {
    const markup = renderEmpty({ conversations: [] });

    assert.doesNotMatch(markup, /data-testid="messages-empty-quick-start"/);
    assert.doesNotMatch(markup, /Hızlı başla/);
  });

  it("üçten az sohbette kısmi liste", () => {
    const chips =
      renderEmpty({ conversations: [row()] }).match(/data-testid="messages-empty-quick-chip"/g) ??
      [];

    assert.equal(chips.length, 1);
  });

  /**
   * `info` ve `accent`in `globals.css`'te token'ı yok; renk adını doğrudan CSS'e
   * yazmak hiçbir şey çizmemek olurdu.
   */
  it("grup tile'ı gerçek bir renk alır", () => {
    const markup = renderEmpty();

    assert.ok(markup.includes("hsl(199 89% 48%)"));
    assert.doesNotMatch(markup, /background:info/);
  });
});

describe("selectQuickStart (karar #12)", () => {
  it("sabitlenenler öne gelir", () => {
    const picked = selectQuickStart(
      [row({ id: "a" }), row({ id: "b", pinned: true }), row({ id: "c" })],
      3,
    );

    assert.deepEqual(
      picked.map((entry) => entry.id),
      ["b", "a", "c"],
    );
  });

  it("aynı sohbeti iki kez vermez", () => {
    const picked = selectQuickStart([row({ id: "a", pinned: true }), row({ id: "a" })], 3);

    assert.deepEqual(
      picked.map((entry) => entry.id),
      ["a"],
    );
  });
});

describe("yeni mesaj seçici (SPEC §10)", () => {
  const friends = [
    {
      avatarUrl: null,
      displayName: "Ada Lovelace",
      id: "user-1",
      name: "Ada Lovelace",
      username: "ada",
    },
    {
      avatarUrl: null,
      displayName: "Berk",
      id: "user-2",
      name: "Berk",
      username: "berk",
    },
  ];

  it("arkadaşları tek seçimli satırlar olarak çizer", () => {
    const markup = wrap(
      <NewMessagePickerContent
        friends={friends}
        onNewGroup={() => undefined}
        onSelect={() => undefined}
      />,
    );
    const rows = markup.match(/data-testid="new-message-picker-row"/g) ?? [];

    assert.equal(rows.length, 2);
    // Çoklu seçim yüzeyleri yok: çip de onay kutusu da çizilmez.
    assert.doesNotMatch(markup, /type="checkbox"/);
  });

  it("ayakta grup modalına geçiş bağlantısı var", () => {
    const markup = wrap(
      <NewMessagePickerContent
        friends={friends}
        onNewGroup={() => undefined}
        onSelect={() => undefined}
      />,
    );

    assert.match(markup, /data-testid="new-message-picker-new-group"/);
    assert.ok(markup.includes("Yeni grup sohbeti"));
  });
});
