import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationToast, GroupProfilePanelDTO } from "@wizards/types";

import {
  copyInviteLink,
  inviteRuleKey,
  ProfileInviteLinkCard,
  selectInviteValidity,
  selectLiveInvite,
  toInviteDisplayUrl,
} from "@/components/messages/profile-invite-link-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — §15.4'ün `DAVET BAĞLANTISI` kartı.
 *
 * Kopyalama testleri bileşeni değil `copyInviteLink`'i sürüyor: bu süitin render'ı sunucu
 * tarafı ve bir tık üretemiyor, oysa sınanması gereken şey tam olarak **reddedilen**
 * panoya ne olduğu.
 */

const NOW = new Date("2026-08-27T12:00:00.000Z");

type Invite = GroupProfilePanelDTO["invite"];

function invite(overrides: Partial<NonNullable<Invite>> = {}): NonNullable<Invite> {
  return {
    code: "s24-ekibi",
    expiresAt: "2026-09-03T12:00:00.000Z",
    url: "https://whispr.app/g/s24-ekibi",
    ...overrides,
  };
}

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

describe("davet bağlantısı türetmeleri", () => {
  /** Ş2 §5.4: DTO tam URL taşıyor; kısa biçim bir gösterim kararı. */
  it("kısa biçim şemayı düşürür, panoya giden adres tam kalır", () => {
    assert.equal(toInviteDisplayUrl("https://whispr.app/g/s24-ekibi"), "whispr.app/g/s24-ekibi");
  });

  it("süresi dolmuş davet yok sayılır", () => {
    assert.equal(selectLiveInvite(invite({ expiresAt: "2026-08-01T00:00:00.000Z" }), NOW), null);
    assert.notEqual(selectLiveInvite(invite(), NOW), null);
    assert.notEqual(selectLiveInvite(invite({ expiresAt: null }), NOW), null);
    assert.equal(selectLiveInvite(null, NOW), null);
  });

  it("kalan süre gün ve saate yuvarlanır", () => {
    assert.deepEqual(selectInviteValidity(invite(), NOW), { count: 7, kind: "days" });
    assert.deepEqual(selectInviteValidity(invite({ expiresAt: null }), NOW), { kind: "forever" });
    assert.deepEqual(selectInviteValidity(invite({ expiresAt: "2026-08-27T20:00:00.000Z" }), NOW), {
      count: 8,
      kind: "hours",
    });
  });

  /** Kural §15.5'in segmentiyle **aynı** alandan okunur; ikinci bir kaynak yok. */
  it("kural addPolicy'den okunur", () => {
    assert.equal(inviteRuleKey("ALL"), "messages.profile.invite.ruleEveryone");
    assert.equal(inviteRuleKey("ADMINS"), "messages.profile.invite.ruleAdmins");
  });
});

describe("kopyalama", () => {
  it("başarılıysa başarı toast'ı", async () => {
    const toasts: ConversationToast[] = [];
    const copied = await copyInviteLink(
      "https://whispr.app/g/s24-ekibi",
      { writeText: async () => undefined },
      (toast) => toasts.push(toast),
    );

    assert.equal(copied, true);
    assert.deepEqual(toasts, [{ kind: "inviteCopied", tone: "success" }]);
  });

  /**
   * Reddedilen pano **sessiz geçmez**. Güvenli olmayan bir köken, reddedilmiş bir izin ve
   * arka plandaki bir sekme — üçü de reddediyor ve kullanıcı yanlış şeyi yapıştırıyor.
   */
  it("reddedilirse hata toast'ı", async () => {
    const toasts: ConversationToast[] = [];
    const copied = await copyInviteLink(
      "https://whispr.app/g/s24-ekibi",
      {
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
      },
      (toast) => toasts.push(toast),
    );

    assert.equal(copied, false);
    assert.deepEqual(toasts, [{ kind: "copyFailed", tone: "danger" }]);
  });

  it("pano hiç yoksa da hata toast'ı", async () => {
    const toasts: ConversationToast[] = [];

    assert.equal(
      await copyInviteLink("https://whispr.app/g/x", undefined, (t) => toasts.push(t)),
      false,
    );
    assert.equal(toasts[0]?.tone, "danger");
    // The tone alone is not the contract: a red strip still saying "kopyalandı" would
    // be worse than no strip, so the kind has to change with it.
    assert.equal(toasts[0]?.kind, "copyFailed");
  });
});

describe("kart", () => {
  it("adresi, kopyala butonunu ve kural satırını çizer", () => {
    const markup = render(
      <ProfileInviteLinkCard addPolicy="ALL" invite={invite()} now={NOW} viewerRole="ADMIN" />,
    );

    assert.match(markup, /whispr\.app\/g\/s24-ekibi/);
    assert.match(markup, /<button[^>]+data-testid="profile-invite-copy"/);
    assert.match(markup, /aria-label="Davet bağlantısını kopyala"/);
    assert.match(markup, /7 gün geçerli · Herkes üye ekleyebilir/);
  });

  it("kural satırı addPolicy değişince değişir", () => {
    const markup = render(
      <ProfileInviteLinkCard addPolicy="ADMINS" invite={invite()} now={NOW} viewerRole="ADMIN" />,
    );

    assert.match(markup, /Yalnızca yöneticiler üye ekleyebilir/);
  });

  it("süresiz davette süre yerine Süresiz yazar", () => {
    const markup = render(
      <ProfileInviteLinkCard
        addPolicy="ALL"
        invite={invite({ expiresAt: null })}
        now={NOW}
        viewerRole="OWNER"
      />,
    );

    assert.match(markup, /Süresiz geçerli/);
  });

  /**
   * Davet yokken üyeye **bölüm hiç çizilmez**: sunucu zaten reddediyor ve oluşturma satırı
   * bırakmak kullanıcıya yapabileceği bir şey vaat ederdi.
   */
  it("davet yokken üyeye hiçbir şey çizilmez", () => {
    const markup = render(
      <ProfileInviteLinkCard
        addPolicy="ALL"
        invite={null}
        now={NOW}
        onCreate={() => undefined}
        viewerRole="MEMBER"
      />,
    );

    assert.equal(markup, "");
  });

  it("davet yokken yöneticiye oluşturma satırı çizilir", () => {
    const markup = render(
      <ProfileInviteLinkCard
        addPolicy="ALL"
        invite={null}
        now={NOW}
        onCreate={() => undefined}
        viewerRole="ADMIN"
      />,
    );

    assert.match(markup, /data-testid="profile-invite-create"/);
    assert.match(markup, /Davet bağlantısı oluştur/);
  });

  it("süresi dolmuş davet oluşturma satırına düşer", () => {
    const markup = render(
      <ProfileInviteLinkCard
        addPolicy="ALL"
        invite={invite({ expiresAt: "2026-08-01T00:00:00.000Z" })}
        now={NOW}
        onCreate={() => undefined}
        viewerRole="OWNER"
      />,
    );

    assert.doesNotMatch(markup, /data-testid="profile-invite-card"/);
    assert.match(markup, /data-testid="profile-invite-create"/);
  });
});
