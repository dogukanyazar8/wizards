import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { DeleteAccountBlock } from "@/components/settings/risky/delete-account-block";
import { getMessagesForLocale } from "@/lib/locale";
import { matchesDeletionConfirmation } from "@/lib/settings/security-client";

/** Ş7 §6 — hesap silme: cümle ekranda Türkçe, telde sabit literal, sunucuda yine denetleniyor. */

const MESSAGES: Record<string, string> = getMessagesForLocale("tr");

const SOURCE = readFileSync(
  fileURLToPath(new URL("./delete-account-block.tsx", import.meta.url)),
  "utf8",
);

function render(): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <DeleteAccountBlock onClose={() => {}} />
    </LocaleProvider>,
  );
}

describe("DeleteAccountBlock — biçim", () => {
  it("sahiplik uyarısı, parola ve doğrulama cümlesi alanları var", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="settings-delete-account-warning"'));
    assert.ok(markup.includes('data-testid="settings-delete-account-password"'));
    assert.ok(markup.includes('data-testid="settings-delete-account-phrase"'));
  });

  it("doğrulama cümlesi SPEC metni", () => {
    assert.equal(MESSAGES["settings.block.deleteAccount.phrase"], "hesabımı kalıcı olarak sil");
    assert.ok(render().includes("hesabımı kalıcı olarak sil"));
  });

  it("`Vazgeç` ve `Hesabı kalıcı olarak sil` düğmeleri", () => {
    const markup = render();

    assert.ok(markup.includes("Vazgeç"));
    assert.ok(markup.includes("Hesabı kalıcı olarak sil"));
  });
});

describe("DeleteAccountBlock — kapılar", () => {
  it("cümle yanlışken silme düğmesi kilitli", () => {
    assert.match(render(), /settings-delete-account-submit"[^>]*disabled/u);
  });

  it("cümle karşılaştırması yerelleştirilmiş metinle yapılıyor", () => {
    assert.equal(
      matchesDeletionConfirmation("hesabımı kalıcı olarak sil", "hesabımı kalıcı olarak sil"),
      true,
    );
    assert.equal(
      matchesDeletionConfirmation("  Hesabımı Kalıcı Olarak Sil ", "hesabımı kalıcı olarak sil"),
      true,
    );
    assert.equal(matchesDeletionConfirmation("hesabımı sil", "hesabımı kalıcı olarak sil"), false);
  });

  it("tele giden literal protokolün kendisi, ekrandaki cümle değil", () => {
    assert.equal(ACCOUNT_DELETION_CONFIRMATION_PHRASE, "DELETE MY ACCOUNT");
    assert.ok(!SOURCE.includes("DELETE MY ACCOUNT"), "literal `privacy-client` içinde kalmalı");
    assert.ok(SOURCE.includes("deleteOwnAccount"));
  });

  it("reauth jetonu olmadan silme çağrılmıyor", () => {
    assert.ok(SOURCE.includes("if (pending || !reauthToken || !phraseMatches) return;"));
  });
});
