import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { shouldWatchPublicEvents } from "@/lib/events/realtime";

/**
 * Kancanın kendisi React efekti; yamanın **mantığı** `lib/events/realtime.test.ts` içinde
 * gerçek bir `QueryClient` ile koşuyor. Burada kalan sözleşme abonelik yaşam döngüsü: hangi
 * olaylar bağlanıyor, hangileri sökülüyor ve herkese açık odaya ne zaman girilip çıkılıyor.
 */
/** Yorumlar soyulur: bir kuralı anlatan yorum, o kuralı çiğneyen kod sanılmamalı. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

const SOURCE = stripComments(
  readFileSync(fileURLToPath(new URL("./use-events-realtime.ts", import.meta.url)), "utf8"),
);

const SOCKET_EVENTS = [
  "event:created",
  "event:updated",
  "event:rsvp",
  "event:live:started",
  "event:live:ended",
] as const;

describe("useEventsRealtime — herkese açık oda", () => {
  it("yalnız `/events` rotasında açılır", () => {
    assert.equal(shouldWatchPublicEvents("/events"), true);
    assert.equal(shouldWatchPublicEvents("/events/e-1"), true);
  });

  it("başka rotada açılmaz — her kullanıcıyı kalıcı olarak bağlamak gereksiz", () => {
    assert.equal(shouldWatchPublicEvents("/home"), false);
    assert.equal(shouldWatchPublicEvents("/messages"), false);
    assert.equal(shouldWatchPublicEvents("/eventsomething"), false);
    assert.equal(shouldWatchPublicEvents(null), false);
  });

  it("rotadan çıkınca kapanır (efekt temizliği `unwatch` yayıyor)", () => {
    assert.match(SOURCE, /socket\.emit\("events:public:watch"\)/u);
    assert.match(SOURCE, /return\s*\(\)\s*=>\s*\{[^}]*socket\.emit\("events:public:unwatch"\)/su);
  });
});

describe("useEventsRealtime — abonelik", () => {
  for (const name of SOCKET_EVENTS) {
    it(`\`${name}\` bağlanıyor ve sökülüyor`, () => {
      assert.match(SOURCE, new RegExp(`socket\\.on\\("${name}"`, "u"));
      assert.match(SOURCE, new RegExp(`socket\\.off\\("${name}"`, "u"));
    });
  }

  it("yama mantığı kancada değil, saf uygulayıcıda", () => {
    assert.match(SOURCE, /createEventsRealtimeHandlers/u);
    // Kanca kendi `setQueryData`sını yazmaz; yazsaydı yama React'siz test edilemezdi.
    assert.doesNotMatch(SOURCE, /setQueriesData|setQueryData/u);
  });

  it("liste yeniden çekilmez — kancada liste anahtarı geçersiz kılınmıyor", () => {
    assert.doesNotMatch(SOURCE, /invalidateQueries/u);
  });
});
