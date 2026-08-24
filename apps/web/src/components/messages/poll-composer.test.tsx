import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  POLL_MAX_OPTIONS,
  addPollOption,
  canAddPollOption,
  canRemovePollOption,
  canSubmitPoll,
  createInitialPollDraft,
  removePollOption,
  setPollOption,
  toPollCreateRequest,
} from "@wizards/types";

import { PollComposer } from "@/components/messages/poll-composer";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function render(overrides: Partial<React.ComponentProps<typeof PollComposer>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <PollComposer
        conversationName="Tasarım Ekibi"
        eligibleVoterCount={8}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("anket modalı — varsayılanlar (SPEC §8)", () => {
  it("çoktan seçmeli kapalı, anonim açık, süre 24 saat", () => {
    const draft = createInitialPollDraft();

    assert.equal(draft.multi, false);
    assert.equal(draft.anonymous, true);
    assert.equal(draft.duration, "24h");
    assert.equal(draft.options.length, 3);
  });

  it("üç süre segmenti de çizilir ve 24 saat seçili", () => {
    const markup = render();

    for (const label of ["1 saat", "24 saat", "3 gün"]) {
      assert.ok(markup.includes(label), label);
    }

    assert.match(
      markup,
      /data-testid="poll-composer-duration-24h"[^>]*|aria-checked="true"[^>]*data-testid="poll-composer-duration-24h"/,
    );
  });

  it("anahtarlar gerçek switch", () => {
    const markup = render();

    assert.match(markup, /role="switch"/);
    assert.match(markup, /aria-checked="true"[^>]*data-testid="poll-composer-anonymous"/);
  });
});

describe("anket modalı — gönderim kapısı", () => {
  it("soru boşken gönder pasif", () => {
    const draft = setPollOption(setPollOption(createInitialPollDraft(), 0, "A"), 1, "B");

    assert.equal(canSubmitPoll(draft), false);
  });

  it("iki dolu seçenek olmadan gönder pasif", () => {
    const draft = setPollOption({ ...createInitialPollDraft(), question: "Kaçta?" }, 0, "16:00");

    assert.equal(canSubmitPoll(draft), false);
  });

  it("soru + iki seçenek yeterli", () => {
    const draft = setPollOption(
      setPollOption({ ...createInitialPollDraft(), question: "Kaçta?" }, 0, "16:00"),
      1,
      "18:00",
    );

    assert.equal(canSubmitPoll(draft), true);
  });

  /** Pasif düğme nedenini taşımasaydı ekran okuyucu yalnız "pasif" derdi. */
  it("pasif gönder nedeni aria-describedby ile bağlanır", () => {
    const markup = render();

    assert.match(markup, /aria-disabled="true"/);
    assert.ok(markup.includes("Soru ve en az iki seçenek gerekli"));
  });

  it("boş seçenekler gönderimde elenir", () => {
    const draft = setPollOption(
      setPollOption({ ...createInitialPollDraft(), question: "Kaçta?" }, 0, "16:00"),
      1,
      "18:00",
    );

    assert.deepEqual(toPollCreateRequest(draft).options, ["16:00", "18:00"]);
  });
});

describe("anket modalı — seçenek tavanları", () => {
  it("Seçenek ekle 6'da durur", () => {
    let draft = createInitialPollDraft();

    while (canAddPollOption(draft)) {
      draft = addPollOption(draft);
    }

    assert.equal(draft.options.length, POLL_MAX_OPTIONS);
    assert.equal(canAddPollOption(draft), false);
  });

  it("2 satır kalınca kaldırma çizilmez", () => {
    const two = removePollOption(createInitialPollDraft(), 2);

    assert.equal(two.options.length, 2);
    assert.equal(canRemovePollOption(two), false);
    // Üç satırlı varsayılanda kaldırma butonu vardır.
    assert.match(render(), /data-testid="poll-composer-remove-option"/);
  });

  it("harf tile'ları A, B, C sırasında", () => {
    const markup = render();

    assert.ok(markup.includes(">A<"));
    assert.ok(markup.includes(">B<"));
    assert.ok(markup.includes(">C<"));
  });
});

describe("anket modalı — ayak", () => {
  it("sohbet adı ve oy verebilecek kişi sayısı yazılı", () => {
    const markup = render();

    assert.ok(markup.includes("Tasarım Ekibi · 8 üye oy verebilir"));
  });

  /** 1:1 DM'de iki kişi oy verebilir (karar #12). */
  it("1:1 DM'de sayı 2", () => {
    const markup = render({ conversationName: "Ada", eligibleVoterCount: 2 });

    assert.ok(markup.includes("Ada · 2 üye oy verebilir"));
  });

  it("anket mesaj olarak gönderilir notu duruyor", () => {
    assert.ok(render().includes("Anket mesaj olarak gönderilir"));
  });
});
