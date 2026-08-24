import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

/**
 * `forwardDirectMessage` `requireDMParticipant` ve `sendDirectMessage` üzerinden
 * gerçek servis katmanına bağlı; ikisini birden sahtelemek testin kendisini
 * kuruluma çevirirdi. Burada **karar sırası** kaynağa karşı doğrulanıyor:
 * yetkisiz kaynak 404 verir, metinsiz mesaj özel bir kodla reddedilir ve iletme
 * hedef kapısını kendi yazmaz.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  fileURLToPath(new URL("./forward-service.ts", import.meta.url)),
  "utf8",
);

describe("iletme sözleşmesi", () => {
  /**
   * 403 "var ama senin değil" demek olurdu ve bir kimliğin gerçek olduğunu
   * doğrulardı; kaynak yetkisi 404 ile kapanıyor.
   */
  it("yetkisiz kaynakta 404", () => {
    assert.match(SOURCE, /requireDMParticipant\(input\.userId, source\.conversationId\)/);
    const notFound = SOURCE.match(/"Message not found", 404, "NOT_FOUND"/g) ?? [];

    assert.ok(notFound.length >= 3, `beklenen en az 3, bulunan ${notFound.length}`);
    // Kaynak yolunda `ApiError(..., 403, ...)` **atılmıyor**; 403 yalnız
    // yorumda geçiyor ve düz arama kendi açıklamasını ihlal sanardı.
    assert.doesNotMatch(SOURCE, /ApiError\([^)]*403/);
  });

  /** Pencere dışındaki bir mesajı iletmek 2c §7'nin etrafından dolaşmak olurdu. */
  it("geçmiş penceresi ve süre kaynağa da uygulanır", () => {
    assert.match(SOURCE, /toHistoryWindowFilter\(membership\.historyFromAt, null\)/);
    assert.match(SOURCE, /toUnexpiredFilter\(deps\.now\(\)\)/);
  });

  it("hedef kapısı sendDirectMessage'da, ikinci kapı yazılmıyor", () => {
    assert.match(SOURCE, /return sendDirectMessage\(\{/);
    // Hedef katılımcılığını burada ayrıca sorgulamıyoruz.
    const participantChecks = SOURCE.match(/requireDMParticipant\(/g) ?? [];

    assert.equal(participantChecks.length, 1);
  });

  /**
   * Ek taşımak depolama sahipliğini çoğaltmak demek; metni olmayan mesaj
   * **nedeni söylenerek** reddediliyor, sessizce boş bir mesaj gönderilmiyor.
   */
  it("metinsiz mesaj özel kodla reddedilir", () => {
    assert.match(SOURCE, /FORWARD_REQUIRES_TEXT/);
    assert.match(SOURCE, /attachments: \[\]/);
  });

  it("ApiError kullanılabiliyor", () => {
    assert.equal(new ApiError("x", 404, "NOT_FOUND").status, 404);
  });
});
