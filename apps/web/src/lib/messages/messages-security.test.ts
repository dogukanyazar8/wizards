import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DM_PINNED_MESSAGE_MAX,
  GROUP_DM_MAX_PARTICIPANTS,
  POLL_MAX_OPTIONS,
  PollCreateRequestSchema,
  PollVoteRequestSchema,
  UploadedAttachmentInputSchema,
  VOICE_MESSAGE_WAVEFORM_BUCKETS,
} from "@wizards/types";

/**
 * Mesajlar paketinin güvenlik sözleşmesi — Dalga 3 §6.
 *
 * Buradaki her madde bir **sunucu tarafı** kararıdır: istemcinin bir düğmeyi
 * çizmemesi bir kontrol değildir. Tavanlar şemada, kapsam kısıtları SQL'in
 * `WHERE`'ünde ve yetki kararları servis katmanında doğrulanıyor.
 *
 * Anket servisinin kendi testleri (`lib/polls/service.test.ts`) katılımcı
 * kontrolünü ve anonim ankette kimliklerin dönmediğini gerçek çağrılarla
 * kanıtlıyor; bu dosya onları tekrarlamıyor, kapsamadıkları maddeleri kapatıyor.
 */

const SEARCH_SOURCE = readFileSync(
  fileURLToPath(new URL("./global-dm-search-service.ts", import.meta.url)),
  "utf8",
);

describe("§6.3 — global arama kapsamı", () => {
  /**
   * `INNER JOIN "DMParticipant" ... AND p."userId" = ${viewer}` sorgunun
   * **kendisidir**, sonradan uygulanan bir süzgeç değil: satır katılımcı kaydı
   * yoksa hiç üretilmiyor. Sonradan süzülen bir sorgu, bir hata durumunda
   * başkasının konuşmasını sızdırabilirdi.
   */
  it("katılımcılık `WHERE` değil `JOIN` koşuludur", () => {
    assert.match(
      SEARCH_SOURCE,
      /INNER JOIN "DMParticipant" p\s*\n\s*ON p\."conversationId" = m\."conversationId" AND p\."userId" = \$\{args\.userId\}/,
    );
  });

  /** 2c §7: katılımdan önceki mesajlar aramada da görünmez. */
  it("historyFromAt tabanı sorguda", () => {
    assert.match(
      SEARCH_SOURCE,
      /p\."historyFromAt" IS NULL OR m\."createdAt" >= p\."historyFromAt"/,
    );
  });

  /** Gizlenen konuşma ve süresi dolan mesaj da kapsam dışı. */
  it("gizlenen konuşma ve süresi dolan mesaj elenir", () => {
    assert.match(SEARCH_SOURCE, /p\."hiddenAt" IS NULL/);
    assert.match(SEARCH_SOURCE, /m\."expiresAt" IS NULL OR m\."expiresAt" >/);
  });

  /**
   * `ILIKE` deseni kaçış karakteriyle kullanılıyor: kullanıcının yazdığı `%`
   * yoksa desen bütün mesajları eşleştirirdi.
   */
  it("ILIKE deseni ESCAPE ile kullanılıyor", () => {
    assert.match(SEARCH_SOURCE, /ILIKE \$\{likePattern\} ESCAPE/);
  });
});

describe("§6.6 — sesli mesaj yükü sunucuda doğrulanır", () => {
  // Şema yalnız yükleme kimliğini ve ölçüleri taşıyor; dosya bilgisi claim
  // yolunda ayrıca doğrulanıyor.
  const base = { id: "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f" };

  it("64 kovalık dalga formu kabul edilir", () => {
    const waveform = Array.from({ length: VOICE_MESSAGE_WAVEFORM_BUCKETS }, () => 5);

    assert.equal(UploadedAttachmentInputSchema.safeParse({ ...base, waveform }).success, true);
  });

  /** Tavan şemada: istemcinin 64'te durması bir kontrol değildir. */
  it("65 elemanlı dizi reddedilir", () => {
    const waveform = Array.from({ length: VOICE_MESSAGE_WAVEFORM_BUCKETS + 1 }, () => 5);

    assert.equal(UploadedAttachmentInputSchema.safeParse({ ...base, waveform }).success, false);
  });

  /**
   * Genel `duration` tavanı bir saat (aynı alan videoyu da taşıyor); dalga formu
   * taşıyan ek **sesli mesajdır** ve tavanı beş dakikadır. Kaydedicinin kendi
   * kendini durdurması bir kontrol değil — istek elle de yazılabilir.
   */
  it("beş dakikayı aşan sesli mesaj reddedilir", () => {
    const waveform = [5, 5, 5];

    assert.equal(
      UploadedAttachmentInputSchema.safeParse({ ...base, duration: 300, waveform }).success,
      true,
    );
    assert.equal(
      UploadedAttachmentInputSchema.safeParse({ ...base, duration: 301, waveform }).success,
      false,
    );
  });

  /** Dalga formu yoksa ek video olabilir; oradaki tavan bir saat. */
  it("dalga formu olmayan ekte bir saatlik tavan sürer", () => {
    assert.equal(UploadedAttachmentInputSchema.safeParse({ ...base, duration: 900 }).success, true);
  });

  it("negatif genlik reddedilir", () => {
    assert.equal(
      UploadedAttachmentInputSchema.safeParse({ ...base, waveform: [-1] }).success,
      false,
    );
  });
});

describe("§6.7 — tavanlar sunucuda zorlanır", () => {
  it("anket en çok altı seçenek", () => {
    const options = Array.from({ length: POLL_MAX_OPTIONS + 1 }, (_value, index) => `S${index}`);

    assert.equal(
      PollCreateRequestSchema.safeParse({
        anonymous: true,
        conversationId: "c1",
        duration: "24h",
        multi: false,
        options,
        question: "Kaçta?",
      }).success,
      false,
    );
  });

  it("anket oyu seçenek tavanını aşamaz", () => {
    const optionIds = Array.from({ length: POLL_MAX_OPTIONS + 1 }, (_v, i) => `o${i}`);

    assert.equal(PollVoteRequestSchema.safeParse({ optionIds }).success, false);
  });

  /** Sabit ve üye tavanları tek yerde tanımlı; iki kopya iki tavan demek olurdu. */
  it("sabit ve üye tavanları paylaşılan sabitlerden gelir", () => {
    assert.equal(DM_PINNED_MESSAGE_MAX, 50);
    assert.equal(GROUP_DM_MAX_PARTICIPANTS, 250);

    const pinsService = readFileSync(
      fileURLToPath(new URL("../dm/pins-service.ts", import.meta.url)),
      "utf8",
    );

    assert.match(pinsService, /DM_PINNED_MESSAGE_MAX/);
    assert.doesNotMatch(pinsService, /\b50\b/);
  });
});

describe("§6 — iletme yolu", () => {
  const forwardSource = readFileSync(
    fileURLToPath(new URL("../dm/forward-service.ts", import.meta.url)),
    "utf8",
  );

  /**
   * Kaynak konuşmanın üyeliği yoksa **404**: 403 "var ama senin değil" demek
   * olurdu ve bir kimliğin gerçek olduğunu doğrulardı.
   */
  it("yetkisiz kaynakta varlık sızmaz", () => {
    assert.match(forwardSource, /"Message not found", 404, "NOT_FOUND"/);
    assert.doesNotMatch(forwardSource, /ApiError\([^)]*403/);
  });

  it("kaynak da geçmiş penceresi ve süre süzgecinden geçer", () => {
    assert.match(forwardSource, /toHistoryWindowFilter\(membership\.historyFromAt, null\)/);
    assert.match(forwardSource, /toUnexpiredFilter\(deps\.now\(\)\)/);
  });
});

describe("§6 — davet edilebilir sunucu ucu", () => {
  const invitableSource = readFileSync(
    fileURLToPath(new URL("../workspace/invitable-servers-service.ts", import.meta.url)),
    "utf8",
  );

  /** Yetki `resolveServerPermissions` ile çözülüyor; istemci tahmini yok. */
  it("izin sunucuda çözülür", () => {
    assert.match(invitableSource, /resolveServerPermissions\(/);
    assert.match(invitableSource, /hasPermission\(permissions, INVITE_PERMISSION\)/);
  });

  it("yasaklı olunan sunucu listede olamaz", () => {
    assert.match(invitableSource, /server: \{ bans: \{ none: \{ userId \} \} \}/);
  });
});
