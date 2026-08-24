import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConversationHeader } from "@/components/messages/conversation-header";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

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
