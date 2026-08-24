import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * `usePoll`'un yarış sözleşmesi.
 *
 * Kanca durum, zamanlama ve ağ isteği taşıyor; bunları düğüm ortamında
 * canlandırmak için `fetch`, `AbortController` ve bir React ağacı birden
 * kurulması gerekirdi — ve sınanan şey o kurulumun kendisi olurdu. Sözleşmenin
 * **doğrulanabilir** kısmı burada, saf oy matematiği `message-poll.test.tsx`
 * içinde, gerçek yarış Dalga 3'ün tarayıcı testinde.
 */

const SOURCE = readFileSync(fileURLToPath(new URL("./use-poll.ts", import.meta.url)), "utf8");
const CLIENT = readFileSync(
  fileURLToPath(new URL("../lib/messages/screen-client.ts", import.meta.url)),
  "utf8",
);

describe("usePoll — yarış sözleşmesi", () => {
  /**
   * İptal edilmeseydi art arda giden istekler dönüş sırasını garanti etmez ve
   * geç dönen eski bir yanıt yeni oyu geri alabilirdi.
   */
  it("yeni istek öncekini iptal eder", () => {
    assert.match(SOURCE, /abortRef\.current\?\.abort\(\)/);
    assert.match(SOURCE, /new AbortController\(\)/);
  });

  it("iptal sinyali gerçekten isteğe geçiyor", () => {
    assert.match(SOURCE, /clearPollVote\(poll\.id, controller\.signal\)/);
    assert.match(SOURCE, /castPollVote\(poll\.id, next\.myOptionIds, controller\.signal\)/);
    // İstemci tarafı da onu `fetch`e vermeli; vermeseydi sinyal ölü kalırdı.
    assert.match(CLIENT, /signal\?: AbortSignal/);
    assert.match(CLIENT, /\.\.\.\(signal \? \{ signal \} : \{\}\)/);
  });

  /** Kesilmemiş ama geç dönen bir yanıt da elenmeli. */
  it("sıra numarası geç yanıtı eler", () => {
    assert.match(SOURCE, /requestSeqRef\.current \+= 1/);
    const guards = SOURCE.match(/seq !== requestSeqRef\.current/g) ?? [];

    assert.equal(guards.length, 2, "hem başarı hem hata yolunda guard olmalı");
  });

  /**
   * Sunucu yükü iyimser durumu bırakmasaydı, başka birinin oyuyla gelen
   * güncelleme kendi iyimser satırımızın altında kalır ve kart gerçeğe hiç
   * dönmezdi.
   */
  it("sunucudan gelen anket iyimser durumu bırakır", () => {
    // Sıfırlama **render sırasında**: efektten `setState` fazladan bir render
    // turu doğurur ve kart bir kare boyunca bayat durumu çizerdi.
    assert.match(
      SOURCE,
      /if \(poll !== serverPoll\) \{\s*setServerPoll\(poll\);\s*setOptimistic\(null\);\s*\}/,
    );
    assert.doesNotMatch(SOURCE, /useEffect\([^)]*setOptimistic\(null\)/);
  });

  it("istek başarısızsa iyimser durum geri alınır", () => {
    assert.match(SOURCE, /\.catch\(\(\) => \{[\s\S]{0,220}setOptimistic\(null\);/);
    assert.match(SOURCE, /setHasError\(true\)/);
  });

  /** Boş küme ayrı uca gider; `PUT` gövdesi "seçme" ile "sil"i ayıramazdı. */
  it("boş küme clearPollVote'a düşer", () => {
    assert.match(SOURCE, /next\.myOptionIds\.length === 0\s*\?\s*clearPollVote/);
  });

  it("unmount'ta uçuştaki istek kesilir", () => {
    assert.match(SOURCE, /\(\) => \(\) => \{\s*abortRef\.current\?\.abort\(\);\s*\},\s*\[\],/);
  });
});
