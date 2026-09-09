import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationToast } from "@wizards/types";

import { copyInviteLinkToClipboard, InviteLinkBox } from "@/components/messages/invite-link-box";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş10 — §16'nın `BAĞLANTIYLA DAVET` kutusu.
 *
 * Kopyalama mantığı bileşenden ayrı, saf bir fonksiyonda: sunucu tarafı render bir tık
 * üretemez, oysa sınanması gereken şey tam olarak panonun **reddettiği** yol.
 */

const NOW = new Date("2026-08-27T12:00:00.000Z");
const LIVE = {
  code: "s24-ekibi",
  expiresAt: "2026-09-03T12:00:00.000Z",
  url: "https://whispr.app/g/s24-ekibi",
};

function render(props: Partial<React.ComponentProps<typeof InviteLinkBox>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <InviteLinkBox canManage expiry="7d" invite={LIVE} now={NOW} {...props} />
    </LocaleProvider>,
  );
}

describe("davet kutusu — bağlantı alanı", () => {
  it("mono alan şemasız biçimi çizer, kopyalanan tam URL kalır", () => {
    const markup = render();

    assert.match(markup, /data-testid="invite-link-url"/);
    assert.match(markup, /whispr\.app\/g\/s24-ekibi/);
    assert.doesNotMatch(markup, /https:\/\/whispr\.app/);
  });

  it("kopyala butonu ve başlık basılır", () => {
    const markup = render();

    assert.match(markup, /data-testid="invite-link-copy"/);
    assert.match(markup, /Kopyala/);
    assert.match(markup, /Bağlantıyla davet/i);
  });

  it("süresi dolmuş davet, davet yok sayılır", () => {
    const markup = render({
      invite: { ...LIVE, expiresAt: "2026-08-01T00:00:00.000Z" },
      onCreate: () => undefined,
    });

    assert.doesNotMatch(markup, /data-testid="invite-link-url"/);
    assert.match(markup, /data-testid="invite-link-create"/);
  });
});

describe("davet kutusu — süre segmenti", () => {
  it("üç segment gerçek radiogroup", () => {
    const markup = render();

    assert.match(markup, /role="radiogroup"/);
    assert.equal(markup.split('role="radio"').length - 1, 3);
    assert.match(markup, /7 gün/);
    assert.match(markup, /1 gün/);
    assert.match(markup, /Süresiz/);
  });

  it("seçili segment primary zemin ve aria-checked taşır", () => {
    const markup = render({ expiry: "1d" });

    assert.match(markup, /aria-checked="true"[^>]*data-testid="invite-expiry-1d"/);
    assert.match(markup, /background:hsl\(var\(--primary\)\)/);
  });

  it("yalnız seçili segment sekme turunda durur", () => {
    const markup = render({ expiry: "never" });
    const stops = markup.match(/tabindex="0"/g) ?? [];

    assert.equal(stops.length, 1);
  });

  it("yazma yetkisi olmayan viewer segmenti hiç görmez", () => {
    const markup = render({ canManage: false });

    assert.doesNotMatch(markup, /data-testid="invite-expiry-segment"/);
    // Bağlantının kendisi kalır: yönetici açtıysa her üye kopyalayabilir.
    assert.match(markup, /data-testid="invite-link-url"/);
  });

  it("bağlantısı ve yetkisi olmayan viewer için kutu hiç çizilmez", () => {
    assert.equal(render({ canManage: false, invite: null }), "");
  });

  it("yazma sürerken segment ikinci tıklamayı almaz", () => {
    assert.match(render({ pending: true }), /data-testid="invite-expiry-7d"[^>]*disabled/);
  });
});

describe("kopyalama toast'ı", () => {
  it("başarıda inviteCopied basar", async () => {
    const toasts: ConversationToast[] = [];
    const copied = await copyInviteLinkToClipboard(
      LIVE.url,
      { writeText: async () => undefined },
      (toast) => toasts.push(toast),
    );

    assert.equal(copied, true);
    assert.deepEqual(toasts, [{ kind: "inviteCopied", tone: "success" }]);
  });

  it("pano reddederse copyFailed + danger basar", async () => {
    const toasts: ConversationToast[] = [];
    const copied = await copyInviteLinkToClipboard(
      LIVE.url,
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

  it("pano hiç yoksa da sessiz kalmaz", async () => {
    const toasts: ConversationToast[] = [];

    await copyInviteLinkToClipboard(LIVE.url, undefined, (toast) => toasts.push(toast));

    assert.deepEqual(toasts, [{ kind: "copyFailed", tone: "danger" }]);
  });

  it("hata kipinin iki sözlükte de karşılığı var", () => {
    for (const locale of ["tr", "en"] as const) {
      const messages = getMessagesForLocale(locale);

      assert.ok("messages.toast.copyFailed" in messages, locale);
      assert.ok("messages.toast.actionFailed" in messages, locale);
    }
  });
});
