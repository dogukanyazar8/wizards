import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationToastKindSchema, type ConversationToast } from "@wizards/types";

import { ConversationToastStrip, resolveToastCopy } from "@/components/messages/conversation-toast";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

const { toast: toastMetrics } = MESSAGES_METRICS;

function render(toast: ConversationToast | null) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ConversationToastStrip onDismiss={() => undefined} toast={toast} />
    </LocaleProvider>,
  );
}

describe("toast şeridi — kabuk (SPEC §17)", () => {
  it("kayıt yoksa hiç çizilmez", () => {
    assert.equal(render(null), "");
  });

  it('`role="status"` ve `aria-live="polite"` taşır', () => {
    const markup = render({ kind: "archived", tone: "success" });

    assert.match(markup, /role="status"/);
    assert.match(markup, /aria-live="polite"/);
    assert.ok(markup.includes("Sohbet arşive taşındı"));
  });

  it("kapat düğmesi ikon-only değil: adı var", () => {
    const markup = render({ kind: "archived", tone: "success" });

    assert.ok(markup.includes('aria-label="Bildirimi kapat"'));
    assert.ok(markup.includes('data-testid="conversation-toast-close"'));
  });

  it("ölçüler sözlükten gelir", () => {
    const markup = render({ kind: "archived", tone: "success" });

    assert.ok(
      markup.includes(
        `padding:${pxToRem(toastMetrics.paddingY)} ${pxToRem(toastMetrics.paddingX)}`,
      ),
    );
    assert.ok(markup.includes(`font-size:${pxToRem(toastMetrics.fontSize)}`));
  });

  /** Sunucuda çizilen şerit **görünür** olmalı; giriş yalnız kayar, solmaz. */
  it("opaklıkla değil, kaymayla girer", () => {
    const markup = render({ kind: "archived", tone: "success" });

    assert.ok(!markup.includes("opacity:0"));
    assert.ok(markup.includes("translateY"));
  });

  it("başarı yeşil, hata kırmızı tonda", () => {
    assert.ok(render({ kind: "archived", tone: "success" }).includes("hsl(var(--success)/0.12)"));
    assert.ok(render({ kind: "actionFailed", tone: "danger" }).includes("hsl(var(--danger)/0.12)"));
  });
});

describe("toast metinleri", () => {
  it("her kip bir sözlük anahtarı bulur", () => {
    const dictionary = getMessagesForLocale("tr");

    for (const kind of ConversationToastKindSchema.options) {
      const copy = resolveToastCopy({ kind, tone: "success" });

      assert.ok(dictionary[copy.key], kind);
    }
  });

  /** Karar K15: `Süresiz` toast'ı SPEC'in listesinde yok, HTML'de var. */
  it("`Süresiz` HTML'in cümlesini basar", () => {
    assert.ok(
      render({ kind: "mutedForever", tone: "success" }).includes("Sohbet süresiz sessize alındı"),
    );
  });

  /**
   * `{duration}` parametresi bir süre **kaydı** taşır; cümleyi kuran yer onu çevirir.
   * Kaydı gönderen tarafın sözlüğe erişmesi gerekseydi aynı cümle iki yerde kurulurdu.
   */
  it("süre kaydı yerelleşerek cümleye girer", () => {
    const markup = render({ kind: "mutedFor", params: { duration: "8h" }, tone: "success" });

    assert.ok(markup.includes("8 saat boyunca sessize alındı"));
    assert.ok(!markup.includes("{duration}"));
    assert.ok(!markup.includes("8h boyunca"));
  });

  it("çoğul ekleme kendi cümlesini alır", () => {
    assert.equal(
      resolveToastCopy({ kind: "membersAdded", params: { count: 2, name: "Can" }, tone: "success" })
        .key,
      "messages.toast.membersAddedMany",
    );
    assert.equal(
      resolveToastCopy({ kind: "membersAdded", params: { name: "Can" }, tone: "success" }).key,
      "messages.toast.membersAdded",
    );
  });
});

describe("danger tonu — kırmızı bir başarı cümlesi basılmaz", () => {
  /**
   * Ş7 kopyalama reddedilince hâlâ `{ kind: "inviteCopied", tone: "danger" }` gönderiyor.
   * Şerit bunu tolere eder: kırmızı bir `Davet bağlantısı kopyalandı` doğrudan yalan olurdu.
   */
  it("danger `inviteCopied` kopyalama hatasına döner", () => {
    const copy = resolveToastCopy({ kind: "inviteCopied", tone: "danger" });

    assert.equal(copy.key, "messages.toast.copyFailed");
    assert.equal(copy.tone, "danger");

    const markup = render({ kind: "inviteCopied", tone: "danger" });

    assert.ok(!markup.includes("Davet bağlantısı kopyalandı"));
    assert.ok(markup.includes("Bağlantı kopyalanamadı"));
  });

  /** Ş8'in `dangerToast` / `notifyFailureToast` yolları da başarı kipleri gönderiyor. */
  it("başka her danger kip genel hata cümlesine döner", () => {
    for (const kind of ["mutedForever", "muteCleared", "userBlocked", "historyCleared"] as const) {
      assert.equal(
        resolveToastCopy({ kind, tone: "danger" }).key,
        "messages.toast.actionFailed",
        kind,
      );
    }

    const markup = render({ kind: "userBlocked", params: { name: "Selin" }, tone: "danger" });

    assert.ok(markup.includes("İşlem tamamlanamadı"));
    assert.ok(!markup.includes("Selin"));
  });

  it("hata kipleri danger tonunda kendi cümlelerini korur", () => {
    assert.equal(
      resolveToastCopy({ kind: "copyFailed", tone: "danger" }).key,
      "messages.toast.copyFailed",
    );
    assert.equal(
      resolveToastCopy({ kind: "actionFailed", tone: "danger" }).key,
      "messages.toast.actionFailed",
    );
  });

  it("başarı tonu hiç dokunulmadan geçer", () => {
    const copy = resolveToastCopy({ kind: "inviteCopied", tone: "success" });

    assert.equal(copy.key, "messages.toast.inviteCopied");
    assert.equal(copy.tone, "success");
  });
});
