import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Mention } from "@wizards/types";

import {
  MentionReplyBox,
  applyMentionReplyAcknowledgement,
  canSendMentionReply,
  clearMentionReplyDraft,
  readMentionReplyDraft,
  writeMentionReplyDraft,
} from "@/components/mentions/mention-reply-box";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { SocketContext } from "@/components/providers/socket-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — satır içi yanıt kutusu (SPEC §5.2, K10).
 *
 * Gönderim socket ACK'i taşır; taslak yalnız başarı ACK'inde silinir.
 */

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

const FAKE_SOCKET = { connected: true, emit: () => {}, off: () => {}, on: () => {} };

function render(target: Mention = mention()) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SocketContext.Provider value={FAKE_SOCKET as never}>
        <MentionReplyBox
          currentUser={{ initials: "DY", name: "Doğukan Yazar" }}
          mention={target}
          onClose={() => {}}
          onSent={() => {}}
          uploadthingEnabled
        />
      </SocketContext.Provider>
    </LocaleProvider>,
  );
}

describe("MentionReplyBox — hedef", () => {
  it("kanal bahsetmesinde kanala gönderileceğini yazar", () => {
    const markup = render();

    assert.ok(markup.includes('data-target="channel"'));
    assert.ok(markup.includes("Yanıt yaz — kanala gönderilir"));
    assert.ok(markup.includes("Selin Aksoy mesajına yanıt · Whispr Topluluğu › #tasarım-kritiği"));
  });

  it("thread kartında yanıt thread'e gider — K10", () => {
    const markup = render(
      mention({ kind: "thread", thread: { id: "p1", open: true, replyCount: 2 } }),
    );

    assert.ok(markup.includes('data-target="thread"'));
    // `renderToStaticMarkup` kesme işaretini `&#x27;` olarak kaçırır; iddia metnin kaçırılmış
    // hâline değil, kaçırma içermeyen parçasına bakar.
    assert.ok(markup.includes("Yanıt yaz — thread"));
    assert.ok(markup.includes("de yanıt ·"));
    assert.ok(!markup.includes("kanala gönderilir"));
  });

  it("DM kartında yanıt sohbete gider", () => {
    const markup = render(
      mention({
        href: "/messages/conv-1?message=m-9",
        source: { conversationId: "conv-1", title: "Zeynep Arı", type: "dm" },
      }),
    );

    assert.ok(markup.includes('data-target="dm"'));
    assert.ok(markup.includes("Yanıt yaz — sohbete gönderilir"));
  });
});

describe("MentionReplyBox — kabuk", () => {
  it("üç kısayol ipucu ve Vazgeç çizilir", () => {
    const markup = render();

    for (const label of ["Enter", "gönder", "Shift+Enter", "satır", "Esc", "kapat", "Vazgeç"]) {
      assert.ok(markup.includes(label), label);
    }
  });

  it("boş metinde gönder butonu devre dışı", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="mention-reply-send"'));
    assert.ok(markup.includes("disabled"));
  });

  it("izleyicinin baş harfleri çizilir", () => {
    assert.ok(render().includes("DY"));
  });

  it("emoji ve dosya butonları gerçek kontrollere bağlı", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="mention-reply-emoji"'));
    assert.ok(markup.includes('data-testid="mention-reply-attach"'));
    assert.ok(markup.includes('data-testid="mention-reply-file-input"'));
    assert.equal(markup.match(/disabled=""/g)?.length, 1, "yalnız boş gönderim");
  });
});

describe("MentionReplyBox — taslak", () => {
  it("kutu kapanıp açılınca metin geri gelir", () => {
    clearMentionReplyDraft("channel:mn-1");
    writeMentionReplyDraft("channel:mn-1", "yarım kalan cümle");

    assert.equal(readMentionReplyDraft("channel:mn-1"), "yarım kalan cümle");
    assert.ok(render().includes("yarım kalan cümle"));

    clearMentionReplyDraft("channel:mn-1");
    assert.equal(readMentionReplyDraft("channel:mn-1"), "");
  });

  it("yalnız boşluktan oluşan taslak tutulmaz", () => {
    writeMentionReplyDraft("channel:mn-2", "   ");
    assert.equal(readMentionReplyDraft("channel:mn-2"), "");
  });

  it("taslaklar bahsetme başına ayrı tutulur", () => {
    writeMentionReplyDraft("channel:a", "birinci");
    writeMentionReplyDraft("channel:b", "ikinci");

    assert.equal(readMentionReplyDraft("channel:a"), "birinci");
    assert.equal(readMentionReplyDraft("channel:b"), "ikinci");

    clearMentionReplyDraft("channel:a");
    clearMentionReplyDraft("channel:b");
  });
});

describe("canSendMentionReply", () => {
  it("boş ve yalnız boşluk gönderilemez", () => {
    assert.equal(canSendMentionReply(""), false);
    assert.equal(canSendMentionReply("   \n "), false);
  });

  it("gerçek metin gönderilebilir", () => {
    assert.equal(canSendMentionReply(" tamam "), true);
  });

  it("yalnız eki olan yanıt gönderilebilir", () => {
    assert.equal(canSendMentionReply("", 1), true);
  });
});

describe("applyMentionReplyAcknowledgement", () => {
  it("başarısız ACK'te taslağı korur", () => {
    writeMentionReplyDraft("channel:ack-fail", "kaybolmamalı");

    assert.equal(
      applyMentionReplyAcknowledgement("channel:ack-fail", {
        code: "RATE_LIMITED",
        message: "slow down",
        ok: false,
      }),
      false,
    );
    assert.equal(readMentionReplyDraft("channel:ack-fail"), "kaybolmamalı");
    clearMentionReplyDraft("channel:ack-fail");
  });

  it("başarı ACK'inde taslağı temizler", () => {
    writeMentionReplyDraft("channel:ack-ok", "gönderildi");

    assert.equal(
      applyMentionReplyAcknowledgement("channel:ack-ok", { messageId: "m-2", ok: true }),
      true,
    );
    assert.equal(readMentionReplyDraft("channel:ack-ok"), "");
  });
});
