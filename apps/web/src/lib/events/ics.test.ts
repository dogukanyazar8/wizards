import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEventIcs,
  buildEventIcsFileName,
  escapeIcsText,
  foldIcsLine,
  ICS_LINE_OCTET_LIMIT,
} from "./ics";

const START = new Date("2026-09-01T15:00:00.000Z");
const NOW = new Date("2026-08-21T09:30:00.000Z");

function octets(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function baseInput() {
  return {
    description: "Kritik toplantısı; ayrıntılar için #tasarım-kritiği kanalına bak.",
    durationMinutes: 45,
    endsAt: null,
    id: "evt-1",
    location: "Whispr Topluluğu › #tasarım-kritiği",
    now: NOW,
    startsAt: START,
    title: "Tasarım Kritiği",
    url: "https://whispr.test/events?panel=evt-1",
  };
}

describe("events ics — RFC 5545 tek etkinlik dışa aktarımı", () => {
  describe("kaçış", () => {
    it("ters bölü, noktalı virgül, virgül ve satır sonunu kaçırır", () => {
      assert.equal(escapeIcsText("a\\b;c,d"), "a\\\\b\\;c\\,d");
      assert.equal(escapeIcsText("bir\niki"), "bir\\niki");
      assert.equal(escapeIcsText("bir\r\niki"), "bir\\niki");
    });

    it("ters bölüyü bir kez kaçırır — sıra önemli", () => {
      // `;` önce kaçırılsaydı, ürettiği `\` ikinci turda tekrar kaçırılırdı.
      assert.equal(escapeIcsText("\\;"), "\\\\\\;");
    });
  });

  describe("katlama", () => {
    it("75 oktetin altındaki satırı bölmez", () => {
      assert.equal(foldIcsLine("SUMMARY:kısa"), "SUMMARY:kısa");
    });

    it("her fiziksel satır 75 okteti aşmaz ve devam satırı boşlukla başlar", () => {
      const line = `SUMMARY:${"ğ".repeat(120)}`;
      const folded = foldIcsLine(line).split("\r\n");

      assert.ok(folded.length > 1, "uzun satır katlanmalı");
      for (const physical of folded) {
        assert.ok(
          octets(physical) <= ICS_LINE_OCTET_LIMIT,
          `${octets(physical)} oktet > ${ICS_LINE_OCTET_LIMIT}`,
        );
      }
      for (const continuation of folded.slice(1)) {
        assert.equal(continuation.startsWith(" "), true);
      }
    });

    it("katlamayı geri alınca özgün satır aynen çıkar (Türkçe karakter iki oktet)", () => {
      const line = `SUMMARY:${"şğüıöç".repeat(40)}`;
      const unfolded = foldIcsLine(line).split("\r\n").join("").replaceAll(/\r\n /gu, "");

      assert.equal(
        foldIcsLine(line)
          .split("\r\n")
          .map((physical, index) => (index === 0 ? physical : physical.slice(1)))
          .join(""),
        line,
      );
      assert.ok(unfolded.length > 0);
    });

    it("çok oktetli karakteri ikiye bölmez", () => {
      // `X:` + 72 ASCII = 74 oktet; sıradaki `ğ` iki oktet ve sınırı aşar, bir sonraki
      // satıra iner. Karakter sayan bir katlama burada `ğ`i ortasından bölerdi.
      const line = `X:${"a".repeat(72)}ğ${"b".repeat(10)}`;
      const folded = foldIcsLine(line).split("\r\n");

      assert.equal(octets(folded[0] ?? ""), 74);
      assert.equal(folded[0]?.endsWith("a"), true);
      assert.equal(folded[1]?.startsWith(" ğ"), true);
    });

    it("bütçeyi tam kullanır: 212 oktet 75 + 75 + 64 olur", () => {
      // `DESCRIPTION:` 12 + 200 = 212 oktet. İlk satır 75, devam satırı boşluk dâhil 75.
      const folded = foldIcsLine(`DESCRIPTION:${"x".repeat(200)}`).split("\r\n");

      assert.deepEqual(
        folded.map((line) => octets(line)),
        [75, 75, 64],
      );
    });
  });

  describe("belge", () => {
    it("CRLF satır sonu kullanır ve LF tek başına geçmez", () => {
      const document = buildEventIcs(baseInput());

      assert.equal(document.includes("\r\n"), true);
      assert.equal(document.replaceAll("\r\n", "").includes("\n"), false);
      assert.equal(document.endsWith("END:VCALENDAR\r\n"), true);
    });

    it("zarf ve VEVENT sınırlarını taşır", () => {
      const lines = buildEventIcs(baseInput()).split("\r\n");

      assert.equal(lines[0], "BEGIN:VCALENDAR");
      assert.equal(lines[1], "VERSION:2.0");
      assert.equal(lines[2], "PRODID:-//Whispr//Events//TR");
      assert.ok(lines.includes("BEGIN:VEVENT"));
      assert.ok(lines.includes("END:VEVENT"));
      assert.ok(lines.includes("UID:evt-1@whispr"));
    });

    it("DTSTART / DTEND / DTSTAMP UTC 'YYYYMMDDTHHMMSSZ' biçiminde", () => {
      const lines = buildEventIcs(baseInput()).split("\r\n");

      assert.ok(lines.includes("DTSTAMP:20260821T093000Z"));
      assert.ok(lines.includes("DTSTART:20260901T150000Z"));
      // 45 dk süre `endsAt` yokken DTEND'i üretir.
      assert.ok(lines.includes("DTEND:20260901T154500Z"));
    });

    it("endsAt verilmişse süreyi değil onu yazar", () => {
      const lines = buildEventIcs({
        ...baseInput(),
        endsAt: new Date("2026-09-01T17:30:00.000Z"),
      }).split("\r\n");

      assert.ok(lines.includes("DTEND:20260901T173000Z"));
    });

    it("ne endsAt ne durationMinutes varsa DTEND yazmaz", () => {
      const document = buildEventIcs({ ...baseInput(), durationMinutes: null, endsAt: null });

      assert.equal(document.includes("DTEND"), false);
    });

    it("SUMMARY, LOCATION, URL ve DESCRIPTION taşır; ayraçlar kaçırılır", () => {
      const document = buildEventIcs(baseInput());
      const unfolded = document
        .split("\r\n")
        .map((line, index) => (index === 0 ? line : line))
        .join("\r\n")
        .replaceAll("\r\n ", "");

      assert.ok(unfolded.includes("SUMMARY:Tasarım Kritiği"));
      assert.ok(unfolded.includes("LOCATION:Whispr Topluluğu › #tasarım-kritiği"));
      assert.ok(unfolded.includes("URL:https://whispr.test/events?panel=evt-1"));
      // `;` gövdede kaçırılmış olmalı.
      assert.ok(unfolded.includes("DESCRIPTION:Kritik toplantısı\\; ayrıntılar"));
    });

    it("boş açıklama DESCRIPTION satırı üretmez", () => {
      assert.equal(
        buildEventIcs({ ...baseInput(), description: "  " }).includes("DESCRIPTION"),
        false,
      );
    });

    it("her fiziksel satır 75 okteti aşmaz", () => {
      const document = buildEventIcs({
        ...baseInput(),
        description:
          "Ağustos ayı tasarım kritiği; ölçüler, tipografi ve şablonlar konuşulacak. ".repeat(6),
        title: "Ağustos Tasarım Kritiği — ölçü, tipografi ve şablon oturumu",
      });

      for (const line of document.split("\r\n")) {
        assert.ok(octets(line) <= ICS_LINE_OCTET_LIMIT, `${octets(line)} oktet: ${line}`);
      }
    });
  });

  describe("dosya adı", () => {
    it("Türkçe başlığı ASCII slug'a indirger", () => {
      assert.equal(buildEventIcsFileName("Tasarım Kritiği", "evt-1"), "tasarim-kritigi.ics");
    });

    it("slug boşalırsa etkinlik kimliğine düşer", () => {
      assert.equal(buildEventIcsFileName("···", "evt-1"), "evt-1.ics");
    });

    it("uzun başlığı kısaltır", () => {
      const name = buildEventIcsFileName("a".repeat(200), "evt-1");
      assert.ok(name.length <= 64, name);
      assert.ok(name.endsWith(".ics"));
    });
  });
});
