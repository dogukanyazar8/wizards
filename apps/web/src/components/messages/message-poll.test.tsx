import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyPollVote, selectPollPercentages, type PollDTO } from "@wizards/types";

import { MessagePoll } from "@/components/messages/message-poll";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function makePoll(overrides: Partial<PollDTO> = {}): PollDTO {
  return {
    anonymous: false,
    canSeeVoters: true,
    closesAt: "2026-08-21T12:00:00.000Z",
    id: "poll-1",
    multi: false,
    myOptionIds: [],
    options: [
      { id: "option-a", label: "16:00", position: 0, votes: 1 },
      { id: "option-b", label: "18:00", position: 1, votes: 3 },
      { id: "option-c", label: "20:00", position: 2, votes: 1 },
    ],
    question: "Kaçta buluşalım?",
    totalVoters: 5,
    ...overrides,
  };
}

function render(overrides: Partial<React.ComponentProps<typeof MessagePoll>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MessagePoll
        closesInLabel="24 saat"
        now={NOW}
        onOpenVoters={() => undefined}
        onToggleOption={() => undefined}
        poll={makePoll()}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("anket kartı — yüzdeler", () => {
  /** En büyük kalan yöntemi; bağımsız yuvarlama 100'ü aşardı ve çubuk taşardı. */
  it("{1,3,1} oyunu 20/60/20 yapar ve 100'ü geçmez", () => {
    const percentages = selectPollPercentages(makePoll());

    assert.deepEqual(percentages, { "option-a": 20, "option-b": 60, "option-c": 20 });
    assert.equal(
      Object.values(percentages).reduce((sum, value) => sum + value, 0),
      100,
    );
  });

  it("oy yokken hepsi sıfır", () => {
    const empty = makePoll({
      options: [
        { id: "option-a", label: "A", position: 0, votes: 0 },
        { id: "option-b", label: "B", position: 1, votes: 0 },
      ],
      totalVoters: 0,
    });

    assert.deepEqual(selectPollPercentages(empty), { "option-a": 0, "option-b": 0 });
  });
});

describe("anket kartı — oy davranışı", () => {
  /** Tek seçimlide oy taşınır: eskisinden düşer, yenisine eklenir. */
  it("tek seçimlide oy taşınır", () => {
    const voted = applyPollVote(makePoll({ myOptionIds: ["option-a"] }), "option-b");

    assert.deepEqual(voted.myOptionIds, ["option-b"]);
    assert.equal(voted.options[0]?.votes, 0);
    assert.equal(voted.options[1]?.votes, 4);
    // Aynı kişi hâlâ tek oy sayılır.
    assert.equal(voted.totalVoters, 5);
  });

  it("aynı seçeneğe ikinci tıklama oyu geri çeker", () => {
    const withdrawn = applyPollVote(makePoll({ myOptionIds: ["option-a"] }), "option-a");

    assert.deepEqual(withdrawn.myOptionIds, []);
    assert.equal(withdrawn.totalVoters, 4);
  });

  it("çoktan seçmelide iki seçenek birlikte işaretli kalır", () => {
    const poll = makePoll({ multi: true, myOptionIds: ["option-a"] });
    const both = applyPollVote(poll, "option-b");

    assert.deepEqual(both.myOptionIds, ["option-a", "option-b"]);
    assert.equal(both.totalVoters, 5);
  });
});

describe("anket kartı — çizim", () => {
  it("soru, tür etiketi ve oy sayacı görünür", () => {
    const markup = render();

    assert.ok(markup.includes("Kaçta buluşalım?"));
    assert.ok(markup.includes("Anket · çoktan seçmeli değil"));
    assert.ok(markup.includes("5 kişi oy verdi"));
  });

  it("tek seçimlide radiogroup, çoktan seçmelide group + checkbox", () => {
    assert.match(render(), /role="radiogroup"/);
    assert.match(render(), /role="radio"/);

    const multi = render({ poll: makePoll({ multi: true }) });

    assert.match(multi, /role="group"/);
    assert.match(multi, /role="checkbox"/);
  });

  /** Yüzdeyi yalnız renkle anlatan bir yüzey kalmaz. */
  it("her seçeneğin aria-label'ı etiket + yüzde + oy taşır", () => {
    const markup = render();

    assert.ok(markup.includes("18:00 · %60 · 3 oy"));
  });

  /** karar #11: bayrak sunucudan; istemci `!anonymous` diye türetmez. */
  it("canSeeVoters false iken Oy verenleri gör çizilmez", () => {
    assert.match(render(), /data-testid="poll-see-voters"/);
    assert.doesNotMatch(
      render({ poll: makePoll({ anonymous: true, canSeeVoters: false }) }),
      /data-testid="poll-see-voters"/,
    );
  });

  it("kapanmış ankette seçenekler tıklanamaz ve ayak kapandı der", () => {
    const markup = render({ poll: makePoll({ closesAt: "2026-08-19T12:00:00.000Z" }) });

    assert.match(markup, /disabled=""/);
    assert.ok(markup.includes("kapandı"));
  });

  it("hata metni rol alert ile çizilir", () => {
    const markup = render({ errorText: "Oy kaydedilemedi" });

    assert.match(markup, /data-testid="poll-error"/);
    assert.match(markup, /role="alert"/);
  });

  it("dolgu genişliği yüzdeyle aynı", () => {
    const markup = render();

    assert.ok(markup.includes("width:60%"));
  });
});
