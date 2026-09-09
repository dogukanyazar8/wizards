import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConversationHeader } from "@/components/messages/conversation-header";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

function render(overrides: Partial<React.ComponentProps<typeof ConversationHeader>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ConversationHeader
        name="Ada Lovelace"
        onOpenSearch={() => undefined}
        onOpenPins={() => undefined}
        onStartVideoCall={() => undefined}
        onStartVoiceCall={() => undefined}
        status="ONLINE"
        username="ada"
        variant="dm"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("sohbet başlığı — 1:1 (SPEC §5.1)", () => {
  it("ad, kullanıcı adı çipi ve presence noktası çizer", () => {
    const markup = render();

    assert.match(markup, /data-testid="conversation-header-title"/);
    assert.ok(markup.includes("Ada Lovelace"));
    assert.match(markup, /data-testid="conversation-header-handle"/);
    assert.ok(markup.includes("@ada"));
    assert.match(markup, /data-testid="conversation-header-presence"/);
  });

  /**
   * Alt satır Ana Sayfa'nın türetimini kullanıyor: aynı kişi iki ekranda farklı
   * durum cümlesi görseydi biri yanlış olurdu.
   */
  it("sesli odadaki kişide oda cümlesini gösterir", () => {
    const markup = render({
      voiceRoom: { channelName: "Tasarım Kritiği", serverName: "Whispr" },
    });

    assert.ok(markup.includes("Tasarım Kritiği"));
  });

  it("grup yüzeyleri 1:1'de çizilmez", () => {
    const markup = render();

    assert.doesNotMatch(markup, /data-testid="conversation-header-group-tile"/);
    assert.doesNotMatch(markup, /data-testid="conversation-header-member-stack"/);
    assert.doesNotMatch(markup, /data-testid="conversation-header-pinned-chip"/);
  });
});

describe("sohbet başlığı — grup (SPEC §5.1)", () => {
  const members = Array.from({ length: 6 }, (_value, index) => ({
    avatarUrl: null,
    displayName: `Üye ${index + 1}`,
    userId: `user-${index + 1}`,
    username: `uye${index + 1}`,
  }));

  it("renkli tile ve üye/çevrimiçi sayacı çizer", () => {
    const markup = render({
      memberCount: 8,
      name: "Tasarım Ekibi",
      onlineCount: 3,
      previewMembers: members,
      variant: "group",
    });

    assert.match(markup, /data-testid="conversation-header-group-tile"/);
    assert.ok(markup.includes("8 üye"));
    assert.ok(markup.includes("3 çevrimiçi"));
  });

  /**
   * 250 üyeli grupta roster çekilmez: yığın üç avatar çizer ve fazlalık
   * `memberCount`'tan türer, taşınan kayıt sayısından değil.
   */
  it("250 üyeli grupta 3 avatar + 247 çipi", () => {
    const markup = render({
      memberCount: 250,
      name: "Topluluk",
      previewMembers: members.slice(0, 4),
      variant: "group",
    });

    const avatars = markup.match(/data-testid="conversation-header-member-stack"/g) ?? [];

    assert.equal(avatars.length, 1);
    assert.ok(markup.includes("+247"));
  });

  /** Konuşma sabiti (`DMParticipant.pinnedAt`), mesaj sabiti değil. */
  it("Sabitlendi çipi yalnız konuşma sabitliyken", () => {
    assert.doesNotMatch(
      render({ name: "Ekip", variant: "group" }),
      /data-testid="conversation-header-pinned-chip"/,
    );
    assert.match(
      render({ name: "Ekip", pinned: true, variant: "group" }),
      /data-testid="conversation-header-pinned-chip"/,
    );
  });
});

describe("sohbet başlığı — ikon şeridi", () => {
  it("beş eylemi de çizer", () => {
    const markup = render();

    for (const id of [
      "conversation-header-voice-call",
      "conversation-header-video-call",
      "conversation-header-pins",
      "conversation-header-search",
      "conversation-header-more",
    ]) {
      assert.ok(markup.includes(`data-testid="${id}"`), id);
    }
  });

  /**
   * Vurgu yalnız renk olsaydı ekran okuyucu kullanıcısı hangi panelin açık
   * olduğunu hiç öğrenemezdi; `aria-pressed` onu söyler.
   */
  it("açık panelin ikonu aria-pressed taşır", () => {
    const markup = render({ openPanel: "search" });

    assert.match(
      markup,
      /aria-pressed="true"[^>]*data-testid="conversation-header-search"|data-testid="conversation-header-search"[^>]*aria-pressed="true"/,
    );
  });

  it("çağrı altyapısı yokken çağrı butonları pasif, gizli değil", () => {
    const markup = render({ callDisabled: true });

    assert.match(markup, /data-testid="conversation-header-voice-call"/);
    assert.match(markup, /disabled=""/);
  });
});

describe("sohbet başlığı — sessiz pill'i (SPEC §17)", () => {
  const NOW = new Date("2026-08-27T12:00:00.000Z");

  function until(minutes: number): string {
    return new Date(NOW.getTime() + minutes * 60_000).toISOString();
  }

  it("sessiz değilken pill yok", () => {
    assert.ok(!render({ now: NOW }).includes('data-testid="conversation-header-mute-pill"'));
  });

  it("süreli sessizlikte `{süre} sessiz` yazar", () => {
    const markup = render({ muted: true, mutedUntil: until(480), now: NOW });

    assert.ok(markup.includes('data-testid="conversation-header-mute-pill"'));
    assert.ok(markup.includes("8 saat sessiz"));
  });

  it("`Süresiz` sessizlikte yalnız `Sessiz` yazar", () => {
    const markup = render({ muted: true, mutedUntil: null, now: NOW });

    assert.ok(markup.includes('data-testid="conversation-header-mute-pill"'));
    assert.ok(!markup.includes("sessiz"));
    assert.ok(markup.includes(">Sessiz<"));
  });

  /**
   * Süresi dolmuş bir sessizlik bildirimleri artık tutmuyor; pill dursaydı başlık
   * bildirim yolunun tersini söylerdi. Karar `isMuteActive`in, başlığın değil.
   */
  it("süresi dolmuşta pill görünmez", () => {
    const markup = render({ muted: true, mutedUntil: until(-1), now: NOW });

    assert.ok(!markup.includes('data-testid="conversation-header-mute-pill"'));
  });

  /** Etiket hem hâli hem eylemi söyler; ikisinden biri eksikse pill yarım anlatır. */
  it("gerçek buton ve etiketi hem süreyi hem eylemi söyler", () => {
    const markup = render({ muted: true, mutedUntil: until(60), now: NOW });

    assert.ok(markup.includes('aria-label="1 saat sessiz · Sessize almayı kaldır"'));
    assert.ok(markup.includes('type="button"'));
  });

  it("warning tonunu ve §17 ölçüsünü taşır", () => {
    const markup = render({ muted: true, mutedUntil: null, now: NOW });

    assert.ok(markup.includes("hsl(var(--warning)/0.14)"));
    assert.ok(markup.includes(`height:${pxToRem(MESSAGES_METRICS.moreMenu.mutePillHeight)}`));
  });
});

describe("sohbet başlığı — menü yuvası (SPEC §17)", () => {
  it("menü verilmezse yalnız tetikleyici çizilir", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="conversation-header-more"'));
    assert.ok(!markup.includes("menü gövdesi"));
  });

  /** Menü tetikleyicisinin **yanında** doğar: §17 onu `top:41; right:0` ile bağlıyor. */
  it("menü yuvası tetikleyiciyle aynı sarmalayıcıda", () => {
    const markup = render({
      moreMenu: <div data-testid="more-menu-body">menü gövdesi</div>,
      moreOpen: true,
    });

    const trigger = markup.indexOf('data-testid="conversation-header-more"');
    const body = markup.indexOf('data-testid="more-menu-body"');

    assert.notEqual(trigger, -1);
    assert.notEqual(body, -1);
    assert.ok(trigger < body);
    assert.ok(markup.includes('aria-expanded="true"'));
    assert.ok(markup.includes('aria-haspopup="menu"'));
  });

  it('menü kapalıyken tetikleyici `aria-expanded="false"` taşır', () => {
    assert.ok(render().includes('aria-expanded="false"'));
  });
});
