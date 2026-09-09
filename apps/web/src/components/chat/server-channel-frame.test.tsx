import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { PinnedStrip } from "@/components/messages/pinned-strip";
import { getMessagesForLocale } from "@/lib/locale";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { toChannelPinnedMessages } from "@/lib/servers/channel-pins";
import { ServerChannelHeader } from "./server-channel-header";
import { TypingIndicator } from "./typing-indicator";

/**
 * Ş6 — metin kanalının çerçevesi (SPEC-SUNUCU §3.1, §3.2, §3.3 son maddesi, §3.4).
 *
 * Test **ölçünün kendisini** değil, ölçünün sözlükten geldiğini doğrular: beklenen değerler
 * `SERVER_METRICS`'ten okunur. Sözlük ↔ referans HTML eşitliği `lib/servers/parity.test.ts`
 * işidir; burada aranan, bileşenin kendi sayısını yazmamış olması.
 *
 * `chat-area.tsx` bütün olarak render edilemez (`useQuery` · soket · `framer-motion`), o yüzden
 * bestekârın kanal yolu **dosya sözleşmesiyle** ölçülüyor (`modal-focus-contract.test.ts` düzeni).
 */

const MESSAGES = getMessagesForLocale("tr");
const here = dirname(fileURLToPath(import.meta.url));

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

const HEADER_DEFAULTS = {
  accessCount: 24,
  categoryName: "PAYCORE",
  channelName: "surum-notlari",
  locked: false,
  membersActive: false,
  membersDisabled: false,
  notificationLevel: "all",
  onOpenMembers: () => undefined,
  onOpenNotifications: () => undefined,
  onOpenPins: () => undefined,
  onOpenSearch: () => undefined,
  pinnedCount: 2,
  pinsActive: false,
  searchActive: false,
  topic: "Sürüm notları ve build durumu",
} as const;

function renderHeader(overrides: Partial<React.ComponentProps<typeof ServerChannelHeader>> = {}) {
  return render(<ServerChannelHeader {...HEADER_DEFAULTS} {...overrides} />);
}

describe("kanal başlığı (§3.1)", () => {
  it("çerçeve ölçüsünü sözlükten alır — `14px 20px` + `border/.45`", () => {
    const { textHeader } = SERVER_METRICS;
    const html = renderHeader();

    assert.ok(
      html.includes(`padding:${pxToRem(textHeader.paddingY)} ${pxToRem(textHeader.paddingX)}`),
    );
    assert.ok(html.includes(`hsl(var(--border)/${textHeader.borderBottomAlpha})`));
  });

  it("ad, kategori çipi ve alt satırı çizer", () => {
    const html = renderHeader();

    assert.match(html, /data-testid="server-channel-title"/u);
    assert.match(html, /surum-notlari/u);
    assert.match(html, /data-testid="server-channel-category-chip"/u);
    assert.match(html, /PAYCORE/u);
    // §3.1 — `<konu> · N üye erişebilir`.
    assert.match(html, /Sürüm notları ve build durumu · 24 üye erişebilir/u);
  });

  it("erişim sayısı türetilemediğinde yalnız konuyu yazar", () => {
    const html = renderHeader({ accessCount: null });

    assert.match(html, /data-testid="server-channel-subtitle"/u);
    assert.doesNotMatch(html, /erişebilir/u);
  });

  it("bildirim çipi yalnız `mentions` ve `muted` durumlarında çizilir", () => {
    assert.doesNotMatch(renderHeader(), /data-testid="server-channel-notif-chip"/u);

    const mentions = renderHeader({ notificationLevel: "mentions" });

    assert.match(mentions, /data-testid="server-channel-notif-chip"/u);
    assert.ok(mentions.includes(MESSAGES["server.channel.header.notif.mentions"] ?? ""));

    const muted = renderHeader({ notificationLevel: "muted" });

    assert.ok(muted.includes(MESSAGES["server.channel.header.notif.muted"] ?? ""));
  });

  it("zil rengi tercihe göre üç tokendan birini alır", () => {
    assert.ok(renderHeader().includes("hsl(var(--primary))"));
    assert.ok(renderHeader({ notificationLevel: "mentions" }).includes("hsl(var(--warning))"));
    assert.ok(renderHeader({ notificationLevel: "muted" }).includes("hsl(var(--danger))"));
  });

  it("üç ikon düğmesi, ayraç ve `Üyeler` düğmesi sözlük ölçüsünde", () => {
    const { textHeader } = SERVER_METRICS;
    const html = renderHeader();

    for (const testId of [
      "server-channel-search",
      "server-channel-notifications",
      "server-channel-pins",
      "server-channel-members",
    ]) {
      assert.ok(html.includes(`data-testid="${testId}"`), testId);
    }

    assert.ok(html.includes(`width:${pxToRem(textHeader.actionSize)}`));
    assert.ok(html.includes(`height:${pxToRem(textHeader.dividerHeight)}`));
    assert.ok(html.includes(`height:${pxToRem(textHeader.membersButtonHeight)}`));
  });

  it("aktif düğme `primary/.16` zeminine geçer ve `aria-pressed` taşır", () => {
    const { textHeader } = SERVER_METRICS;
    const html = renderHeader({ searchActive: true });

    assert.ok(html.includes(`hsl(var(--primary)/${textHeader.actionActiveBackgroundAlpha})`));
    assert.match(
      html,
      /data-testid="server-channel-search"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="server-channel-search"/u,
    );
  });

  it("ikon-only üç düğmenin de erişilebilir adı var (00 §8)", () => {
    const html = renderHeader();

    assert.ok(html.includes(`aria-label="${MESSAGES["server.channel.header.search"]}"`));
    assert.ok(html.includes(`aria-label="${MESSAGES["server.channel.header.notifications"]}"`));
    assert.match(html, /aria-label="2 sabitlenen mesaj"/u);
  });

  it("kilitli kanalı ekran okuyucuya söyler, renkle değil", () => {
    const html = renderHeader({ locked: true });

    assert.match(html, /data-testid="server-channel-locked"/u);
    assert.match(html, /class="sr-only"/u);
  });

  it("hiçbir renk sabiti taşımaz", () => {
    const html = renderHeader({ notificationLevel: "muted" });

    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/u);
    assert.doesNotMatch(html, /rgba?\(/u);
  });
});

describe("sabitlenen mesaj çubuğu (§3.2)", () => {
  const pins = toChannelPinnedMessages(
    [
      {
        attachments: [],
        author: { displayName: "Doğukan Yazar", id: "u1", username: "dogukan" },
        channelId: "c1",
        content: "Sürüm 2.4 notları",
        createdAt: "2026-08-20T09:00:00.000Z",
        deletedAt: null,
        id: "m1",
        pinnedAt: "2026-08-20T09:05:00.000Z",
        reactions: [],
        type: "DEFAULT",
      },
      {
        attachments: [],
        author: { displayName: "Selin Aksoy", id: "u2", username: "selin" },
        channelId: "c1",
        content: "",
        createdAt: "2026-08-21T09:00:00.000Z",
        deletedAt: null,
        id: "m2",
        pinnedAt: "2026-08-21T09:05:00.000Z",
        reactions: [],
        type: "DEFAULT",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    { attachmentOnlyLabel: "Ek", canModerate: true },
  );

  it("en yeni sabiti başa alır ve ek-only gövdeye etiket yazar", () => {
    assert.equal(pins[0]?.messageId, "m2");
    assert.equal(pins[0]?.excerpt, "Ek");
    assert.equal(pins[1]?.excerpt, "Sürüm 2.4 notları");
  });

  it("sunucu varyantı §3.2 ölçüsünde ve warning raptiyeli", () => {
    const { pinnedBar } = SERVER_METRICS;
    const html = render(
      <PinnedStrip
        dismissedId={null}
        onDismiss={() => undefined}
        onSeeAll={() => undefined}
        pins={pins}
        variant="server"
      />,
    );

    assert.match(html, /data-variant="server"/u);
    assert.ok(
      html.includes(`padding:${pxToRem(pinnedBar.paddingY)} ${pxToRem(pinnedBar.paddingX)}`),
    );
    assert.ok(html.includes(`hsl(var(--surface-secondary)/${pinnedBar.backgroundAlpha})`));
    assert.ok(html.includes("hsl(var(--warning))"));
    // §3.2 dört parça: raptiye · sayı · özet · `Tümünü gör`. Kapatma düğmesi DM'e ait.
    assert.doesNotMatch(html, /data-testid="pinned-strip-dismiss"/u);
    assert.match(html, /data-testid="pinned-strip-see-all"/u);
  });

  it("DM varyantı değişmedi — kapatma düğmesi ve primary raptiye yerinde", () => {
    const html = render(
      <PinnedStrip
        dismissedId={null}
        onDismiss={() => undefined}
        onSeeAll={() => undefined}
        pins={pins}
      />,
    );

    assert.match(html, /data-variant="dm"/u);
    assert.match(html, /data-testid="pinned-strip-dismiss"/u);
    assert.ok(html.includes("hsl(var(--primary))"));
  });

  it("sabitlenen yoksa çubuk çizilmez", () => {
    const html = render(
      <PinnedStrip
        dismissedId={null}
        onDismiss={() => undefined}
        onSeeAll={() => undefined}
        pins={[]}
        variant="server"
      />,
    );

    assert.equal(html, "");
  });
});

describe("`yazıyor` göstergesi (§3.3)", () => {
  it("üç noktayı metnin **soluna** koyar ve opaklıkla kademelendirir", () => {
    const { typing } = SERVER_METRICS;
    const html = render(<TypingIndicator mode="channel" typingUsers={["Doğukan"]} />);

    const dotsIndex = html.indexOf(`width:${pxToRem(typing.dotSize)}`);
    const textIndex = html.indexOf("yazıyor");

    assert.ok(dotsIndex > -1 && textIndex > -1);
    assert.ok(dotsIndex < textIndex, "noktalar metnin solunda olmalı");

    for (const alpha of typing.dotAlphas) {
      assert.ok(html.includes(`hsl(var(--primary)/${alpha})`), String(alpha));
    }
  });

  it("animasyon yok — azaltılmış harekette kapatılacak bir şey kalmıyor", () => {
    const html = render(<TypingIndicator mode="channel" typingUsers={["Doğukan"]} />);

    assert.doesNotMatch(html, /animate-bounce|animation:/u);
  });

  it("boşken satır yerini korur", () => {
    const html = render(<TypingIndicator mode="channel" typingUsers={[]} />);

    assert.match(html, /data-testid="typing-indicator-empty"/u);
    assert.match(html, /aria-hidden="true"/u);
  });

  it("yatay boşluk varyanttan gelir; iki paket kendi satırıyla hizalanır", () => {
    const { typing } = SERVER_METRICS;
    const channel = render(<TypingIndicator mode="channel" typingUsers={["Doğukan"]} />);
    const dm = render(<TypingIndicator mode="dm" typingUsers={["Doğukan"]} />);

    assert.ok(channel.includes(pxToRem(typing.paddingX)));
    assert.ok(!dm.includes(`${pxToRem(typing.paddingY)} ${pxToRem(typing.paddingX)}`));
  });
});

describe("bestekâr (§3.4) — dosya sözleşmesi", () => {
  const source = readFileSync(join(here, "message-input.tsx"), "utf8");

  it("kanal yolu tek satırlık düzeni kullanır", () => {
    assert.match(source, /const serverComposer = mode === "channel" && !isThreadComposer;/u);
    assert.match(
      source,
      /const referenceComposer = \(mode === "dm" \|\| serverComposer\) && !isThreadComposer;/u,
    );
  });

  it("ölçüleri sözlükten okur, kendi sayısını yazmaz", () => {
    for (const call of [
      "serverComposerOuterStyle(serverComposer)",
      "serverComposerBoxStyle(serverComposer)",
      "messageSendButtonStyle()",
    ]) {
      assert.ok(source.includes(call), call);
    }

    assert.match(source, /serverComposerMetrics\.attachSize/u);
    assert.match(source, /serverComposerMetrics\.actionSize/u);
    assert.match(source, /serverComposerMetrics\.gifButtonHeight/u);
  });

  it("sunucu anahtarı kapalıyken düğme **hiç çizilmez** (Ş6 §4)", () => {
    assert.match(source, /\{serverComposer && !allowFileUploads \? null : \(/u);
    assert.match(source, /\{serverComposer && !allowGifs \? null : \(/u);
  });

  it("placeholder kanal adını `#` ile yazar", () => {
    assert.match(
      source,
      /t\("server\.channel\.composer\.placeholder", \{ channel: conversationName \}\)/u,
    );
  });
});

describe("`chat-area` başlığı Ş6'ya devretti", () => {
  const source = readFileSync(join(here, "chat-area.tsx"), "utf8");

  it("başlığı `ServerChannelHeader` çiziyor", () => {
    assert.match(source, /<ServerChannelHeader/u);
  });

  it("eski satır içi bildirim açılırı silindi (Ş9 §5.2)", () => {
    assert.equal(source.includes("channel-notification-settings-menu"), false);
    assert.equal(source.includes("showNotificationMenu"), false);
    assert.match(source, /openChannelNotificationsModal\(conversationId, channelTitle\)/u);
  });

  it("kanal sabitleri çubuğa bağlandı", () => {
    assert.match(source, /variant="server"/u);
    assert.match(source, /toChannelPinnedMessages\(/u);
  });
});
