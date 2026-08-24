import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interpolateMessage, resolveMessageTemplate } from "./core";

const DICTIONARY = {
  "home.awaiting.new": "{count} new",
  "home.subline.mentions": "{count} mentions",
  "home.subline.mentions_one": "{count} mention",
  "home.upNext.attendees": "{count} people attending",
  "home.upNext.attendees_one": "{count} person attending",
  "home.upNext.minutesLeft": "{minutes} min left",
  "voice.bar.participants": "{count} participants",
};

describe("resolveMessageTemplate — çoğul seçimi", () => {
  it("count 1 iken tekil biçimi seçer", () => {
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.subline.mentions", { count: 1 }),
      "{count} mention",
    );
  });

  it("count 1 değilken taban anahtarı kullanır", () => {
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.subline.mentions", { count: 0 }),
      "{count} mentions",
    );
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.subline.mentions", { count: 4 }),
      "{count} mentions",
    );
  });

  it("tekil biçimi olmayan anahtarda taban anahtarda kalır", () => {
    // Mevcut sözlüğün 40+ sayaç anahtarı bu daldadır: çoğul çifti yazılmamıştır ve
    // count=1'de de taban metni döner. Yeni mekanizma onları bozmaz.
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "voice.bar.participants", { count: 1 }),
      "{count} participants",
    );
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.awaiting.new", { count: 1 }),
      "{count} new",
    );
  });

  it("count verilmediğinde çoğul dalına hiç girmez", () => {
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.subline.mentions", undefined),
      "{count} mentions",
    );
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.subline.mentions", { minutes: 1 }),
      "{count} mentions",
    );
  });

  it("count sayı değilse çoğul seçmez", () => {
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.subline.mentions", { count: "1" }),
      "{count} mentions",
    );
  });

  it("bilinmeyen anahtarda anahtarın kendisini döner", () => {
    assert.equal(resolveMessageTemplate(DICTIONARY, "home.missing", { count: 1 }), "home.missing");
  });

  it("çoğul çifti olmayan sözlükte tekil ek asla uydurulmaz", () => {
    // `_one` yalnız sözlükte varsa okunur; yoksa `home.upNext.minutesLeft_one` diye
    // bir anahtar ARANIR ama bulunamaz ve taban metin döner.
    assert.equal(
      resolveMessageTemplate(DICTIONARY, "home.upNext.minutesLeft", { count: 1, minutes: 1 }),
      "{minutes} min left",
    );
  });
});

describe("interpolateMessage", () => {
  it("token yerine değeri koyar", () => {
    assert.equal(interpolateMessage("{count} mention", { count: 1 }), "1 mention");
  });

  it("karşılığı olmayan token'ı olduğu gibi bırakır", () => {
    assert.equal(interpolateMessage("{count} mention", {}), "{count} mention");
  });

  it("değer yokken şablonu döner", () => {
    assert.equal(interpolateMessage("Ana Sayfa"), "Ana Sayfa");
  });
});
