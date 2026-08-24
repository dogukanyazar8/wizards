import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Mention, MentionKind } from "@wizards/types";

import { MentionCard, formatMentionCardTime } from "@/components/mentions/mention-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import type { MentionCardProps } from "@/lib/mentions/contracts";

/**
 * Ş6 — kartın çizim sözleşmesi (SPEC §5).
 *
 * Kart saf: bütün eylemler prop. Testler eylemlerin **çağrıldığını** değil (statik çizimde
 * tıklama yok), doğru butonların doğru etiketle ve doğru durumda çizildiğini doğruluyor;
 * çağrı yolları `mentions-page.test.tsx` tarafında bağlı.
 */

const NOW = new Date("2026-08-21T09:00:00.000Z");
const ISTANBUL = "Europe/Istanbul";

function mention(overrides: Partial<Mention> = {}): Mention {
  return {
    author: { avatarUrl: null, handle: "selin", id: "u2", initials: "SA", name: "Selin Aksoy" },
    body: "kart yoğunluğu kararını bugünkü kritiğe alalım mı?",
    createdAt: "2026-08-21T06:41:00.000Z",
    href: "/channels/s1/c1?message=m1",
    id: "channel:mn-1",
    kind: "me",
    messageId: "m1",
    permalink: "https://whispr.test/channels/s1/c1?message=m1",
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

const noop = () => {};

function props(overrides: Partial<MentionCardProps> = {}): MentionCardProps {
  return {
    active: false,
    contextOpen: false,
    menuDirection: "down",
    menuOpen: false,
    mention: mention(),
    onContext: noop,
    onMenuAction: noop,
    onMenuToggle: noop,
    onOpen: noop,
    onReply: noop,
    onToggleRead: noop,
    replyOpen: false,
    ...overrides,
  };
}

function render(cardProps: MentionCardProps = props()) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MentionCard {...cardProps} />
    </LocaleProvider>,
  );
}

describe("MentionCard — okunma durumu", () => {
  it("okunmamış kart birincil kenarı ve sol şeridi taşır", () => {
    const markup = render(props({ mention: mention({ unread: true }) }));

    assert.ok(markup.includes('data-unread="true"'));
    assert.ok(markup.includes('data-testid="mention-card-stripe"'));
    assert.ok(markup.includes("hsl(var(--primary)/0.32)"));
    assert.ok(markup.includes("okunmamış bahsetme"));
  });

  it("okunmuş kartta şerit yok ve zemin soluk", () => {
    const markup = render(props({ mention: mention({ unread: false }) }));

    assert.ok(!markup.includes('data-testid="mention-card-stripe"'));
    assert.ok(markup.includes("hsl(var(--surface-card)/0.45)"));
    assert.ok(markup.includes("hsl(var(--border)/0.5)"));
  });

  it("eylem etiketi okunma durumundan türer", () => {
    assert.ok(render(props({ mention: mention({ unread: true }) })).includes("Okundu işaretle"));
    assert.ok(render(props({ mention: mention({ unread: false }) })).includes("Okunmadı işaretle"));
  });

  it("klavye imleci halkayla gösterilir, zemin değişmez — iki ayrı bilgi", () => {
    const markup = render(props({ active: true }));

    assert.ok(markup.includes('data-active="true"'));
    assert.ok(markup.includes("ring-[hsl(var(--ring))]"));
    assert.ok(markup.includes("hsl(var(--surface-card))"));
  });
});

describe("MentionCard — dört tür", () => {
  const cases: ReadonlyArray<{ kind: MentionKind; label: string; tone: string }> = [
    { kind: "me", label: "Bana özel", tone: "--primary" },
    { kind: "role", label: "Rol", tone: "--info" },
    { kind: "everyone", label: "@herkes", tone: "--warning" },
    { kind: "thread", label: "Thread", tone: "--success" },
  ];

  for (const item of cases) {
    it(`${item.kind} pili ${item.label} etiketini ${item.tone} tonuyla çizer`, () => {
      const markup = render(props({ mention: mention({ kind: item.kind }) }));

      assert.ok(markup.includes(`data-kind="${item.kind}"`));
      assert.ok(markup.includes(item.label));
      assert.ok(markup.includes(`hsl(var(${item.tone})/0.14)`));
    });
  }

  it("rol pili ham renk değil --info token'ını kullanır", () => {
    const markup = render(props({ mention: mention({ kind: "role" }) }));

    assert.ok(!markup.includes("hsl(199"));
  });
});

describe("MentionCard — anatomi", () => {
  it("kaynak satırı sunucu ve kanal adını tek satırda taşır", () => {
    const markup = render();

    assert.ok(markup.includes("Whispr Topluluğu › #tasarım-kritiği"));
    assert.ok(markup.includes("truncate"));
    assert.ok(markup.includes('data-type="channel"'));
  });

  it("DM kartında kaynak yuvarlak tile ve Direkt mesajlar başlığı", () => {
    const markup = render(
      props({
        mention: mention({
          source: { conversationId: "conv-1", title: "Zeynep Arı", type: "dm" },
        }),
      }),
    );

    assert.ok(markup.includes("Direkt mesajlar › Zeynep Arı"));
    assert.ok(markup.includes('data-type="dm"'));
  });

  it("takı gövdenin başında ayrı bir çip; gövdede ikinci kez yazılmaz", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="mention-card-tag"'));
    // Takı **bir kez** çizilir. Gövde sunucudan takı çıkarılmış geliyor (Ş3 `toMentionBody`);
    // istemcinin onu ikinci kez yazması aynı şeyi iki kere söylemek olurdu.
    assert.equal(markup.split("@Doğukan Yazar").length - 1, 1);
  });

  it("kitlesel takıyı istemcinin dilinde gösterir", () => {
    const markup = render(props({ mention: mention({ kind: "everyone", tag: "@everyone" }) }));

    assert.ok(markup.includes("@herkes"));
    assert.ok(!markup.includes("@everyone"));
  });

  it("alıntı bloğu yalnız alıntı varken çıkar ve tek satır kalır", () => {
    assert.ok(!render().includes('data-testid="mention-card-quote"'));

    const markup = render(
      props({
        mention: mention({ quote: { authorName: "Mert Kaya", text: "bunu mu diyorsun" } }),
      }),
    );

    assert.ok(markup.includes("Mert Kaya"));
    assert.ok(markup.includes("bunu mu diyorsun"));
    assert.ok(markup.includes("whitespace-nowrap"));
  });

  it("thread satırı açık ve kapalı thread'i ayırır", () => {
    const open = render(
      props({ mention: mention({ thread: { id: "p1", open: true, replyCount: 3 } }) }),
    );
    const closed = render(
      props({ mention: mention({ thread: { id: "p1", open: false, replyCount: 3 } }) }),
    );

    assert.ok(open.includes("3 yanıt · thread hâlâ açık"));
    assert.ok(closed.includes("3 yanıt · thread kapandı"));
  });

  it("thread satırı olmayan kartta hiç çizilmez", () => {
    assert.ok(!render().includes('data-testid="mention-card-thread"'));
  });
});

describe("MentionCard — eylemler ve menü düğmesi", () => {
  it("üç eylem butonu da gerçek button", () => {
    const markup = render();

    for (const id of ["mention-card-reply", "mention-card-context", "mention-card-toggle-read"]) {
      assert.ok(markup.includes(`data-testid="${id}"`), id);
      assert.ok(markup.includes('type="button"'));
    }
  });

  it("açık yanıt ve panel butonları basılı durumu taşır", () => {
    const markup = render(props({ contextOpen: true, replyOpen: true }));

    assert.equal(markup.match(/aria-pressed="true"/g)?.length, 2);
    assert.ok(markup.includes("hsl(var(--primary)/0.45)"));
  });

  it("⋯ butonu menü sözleşmesini taşır ve yoğunluk değişkeniyle solur", () => {
    const markup = render();

    assert.ok(markup.includes('aria-haspopup="menu"'));
    assert.ok(markup.includes('aria-expanded="false"'));
    assert.ok(markup.includes("Daha fazla"));
    assert.ok(markup.includes("calc(var(--act) + var(--hov))"));
    // Klavyeyle odaklanınca görünür olmalı; aksi halde `⋯` görünmez bir hedef olur.
    assert.ok(markup.includes("focus-visible:opacity-100"));
  });

  it("menü açıkken --act 1 olur ve aria-expanded döner", () => {
    const markup = render(props({ menuOpen: true }));

    assert.ok(markup.includes("--act:1"));
    assert.ok(markup.includes('aria-expanded="true"'));
  });

  it("yanıt yuvası yalnız yanıt açıkken çizilir", () => {
    const slot = <p>yanıt kutusu</p>;

    assert.ok(!render(props({ replySlot: slot })).includes("yanıt kutusu"));
    assert.ok(render(props({ replyOpen: true, replySlot: slot })).includes("yanıt kutusu"));
  });
});

describe("formatMentionCardTime", () => {
  const format = (createdAt: string) =>
    formatMentionCardTime({
      createdAt,
      formatDate: () => "12 Ağu",
      formatTime: () => "21:30",
      locale: "tr",
      now: NOW,
      timeZone: ISTANBUL,
      yesterdayLabel: "Dün",
    });

  it("bugünkü bahsetme yalnız saat gösterir", () => {
    assert.equal(format("2026-08-21T06:41:00.000Z"), "21:30");
  });

  it("dünkü bahsetme Dün ön ekini alır", () => {
    assert.equal(format("2026-08-20T18:30:00.000Z"), "Dün 21:30");
  });

  it("bu haftaki bahsetme gün adını alır", () => {
    assert.equal(format("2026-08-17T08:20:00.000Z"), "Pazartesi 21:30");
  });

  it("AUTO tercihini sistem saat dilimine çözerek bu hafta etiketini çökmeden üretir", () => {
    const label = formatMentionCardTime({
      createdAt: "2026-08-17T12:00:00.000Z",
      formatDate: () => "12 Ağu",
      formatTime: () => "21:30",
      locale: "tr",
      now: new Date("2026-08-21T12:00:00.000Z"),
      timeZone: "AUTO",
      yesterdayLabel: "Dün",
    });

    assert.match(label, /^\S+ 21:30$/u);
  });

  it("daha eski bahsetme tarihi alır", () => {
    assert.equal(format("2026-07-12T08:20:00.000Z"), "12 Ağu 21:30");
  });

  it("saat biçimi hesap tercihinden gelir — kart kendi Intl çağrısını yazmaz", () => {
    const twelveHour = formatMentionCardTime({
      createdAt: "2026-08-21T06:41:00.000Z",
      formatDate: () => "12 Ağu",
      formatTime: () => "9:41 PM",
      locale: "en",
      now: NOW,
      timeZone: ISTANBUL,
      yesterdayLabel: "Yesterday",
    });

    assert.equal(twelveHour, "9:41 PM");
  });
});
