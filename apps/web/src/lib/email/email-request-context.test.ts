import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_EMAIL_TIME_ZONE,
  formatEmailRequestTime,
  resolveEmailDeviceLine,
  resolveEmailRequestContext,
} from "@/lib/email/email-request-context";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** SPEC §5 örneği: `27 Ağustos 2026, 14:32 (GMT+3)`. */
const AUGUST = new Date(Date.UTC(2026, 7, 27, 11, 32));
const JANUARY = new Date(Date.UTC(2026, 0, 15, 11, 32));

function headers(entries: Record<string, string>) {
  return new Headers(entries);
}

describe("e-posta istek bağlamı — cihaz satırı", () => {
  it("tarayıcı, işletim sistemi, şehir ve ülkeyi SPEC sırasıyla birleştirir", () => {
    const line = resolveEmailDeviceLine(
      headers({
        "user-agent": CHROME_MAC,
        "x-vercel-ip-city": "%C4%B0stanbul",
        "x-vercel-ip-country": "tr",
      }),
    );

    assert.equal(line, "Chrome · macOS · İstanbul, TR");
  });

  it("şehir başlığı yoksa yalnız ülke yazılır", () => {
    const line = resolveEmailDeviceLine(
      headers({ "user-agent": CHROME_MAC, "x-vercel-ip-country": "TR" }),
    );

    assert.equal(line, "Chrome · macOS · TR");
  });

  it("konum hiç çözülemezse satır tarayıcı ve işletim sistemiyle kalır", () => {
    assert.equal(resolveEmailDeviceLine(headers({ "user-agent": CHROME_MAC })), "Chrome · macOS");
  });

  it("hiçbir parça çözülemezse satır null olur", () => {
    assert.equal(resolveEmailDeviceLine(headers({})), null);
    assert.equal(resolveEmailDeviceLine(headers({ "user-agent": "" })), null);
  });

  it("başlık verilmediğinde cihaz satırı üretilmez", () => {
    assert.equal(resolveEmailDeviceLine(null), null);
    assert.equal(resolveEmailDeviceLine(undefined), null);
  });

  it("CloudFront ve Cloudflare şehir başlıkları da okunur", () => {
    assert.equal(
      resolveEmailDeviceLine(
        headers({ "user-agent": CHROME_MAC, "cloudfront-viewer-city": "Ankara" }),
      ),
      "Chrome · macOS · Ankara",
    );
    /* HTTP başlığı ByteString taşır; Türkçe şehir adı ancak yüzde kodlu gelebilir. */
    assert.equal(
      resolveEmailDeviceLine(headers({ "user-agent": CHROME_MAC, "cf-ipcity": "%C4%B0zmir" })),
      "Chrome · macOS · İzmir",
    );
  });

  it("bozuk yüzde kodlaması şehir yokmuş gibi ele alınır", () => {
    assert.equal(
      resolveEmailDeviceLine(headers({ "user-agent": CHROME_MAC, "x-vercel-ip-city": "%E0%A4%A" })),
      "Chrome · macOS",
    );
  });

  it("şehir adındaki boşluk ve tire korunur", () => {
    assert.equal(
      resolveEmailDeviceLine(
        headers({ "user-agent": CHROME_MAC, "x-vercel-ip-city": "Sankt-Peterburg" }),
      ),
      "Chrome · macOS · Sankt-Peterburg",
    );
  });

  it("düz nesne başlıkları da kabul edilir", () => {
    assert.equal(
      resolveEmailDeviceLine({ "user-agent": CHROME_MAC, "x-vercel-ip-country": "TR" }),
      "Chrome · macOS · TR",
    );
  });
});

describe("e-posta istek bağlamı — istek zamanı", () => {
  it("SPEC örneğini birebir üretir", () => {
    assert.equal(
      formatEmailRequestTime({ locale: "tr", now: AUGUST, timeZone: "Europe/Istanbul" }),
      "27 Ağustos 2026, 14:32 (GMT+3)",
    );
  });

  it("İngilizce sürüm de 24 saat ve aynı sırayı kullanır (E4)", () => {
    assert.equal(
      formatEmailRequestTime({ locale: "en", now: AUGUST, timeZone: "Europe/Istanbul" }),
      "27 August 2026, 14:32 (GMT+3)",
    );
  });

  it("saat dilimi yoksa Europe/Istanbul'a düşer", () => {
    assert.equal(DEFAULT_EMAIL_TIME_ZONE, "Europe/Istanbul");
    assert.equal(
      formatEmailRequestTime({ locale: "tr", now: AUGUST, timeZone: null }),
      formatEmailRequestTime({ locale: "tr", now: AUGUST, timeZone: "Europe/Istanbul" }),
    );
    assert.equal(
      formatEmailRequestTime({ locale: "tr", now: AUGUST, timeZone: "   " }),
      "27 Ağustos 2026, 14:32 (GMT+3)",
    );
  });

  it("geçersiz saat dilimi dizesi akışı kesmez, varsayılana düşer", () => {
    assert.equal(
      formatEmailRequestTime({ locale: "tr", now: AUGUST, timeZone: "Mars/Olympus" }),
      "27 Ağustos 2026, 14:32 (GMT+3)",
    );
  });

  it("kullanıcının saat dilimi kullanılır ve yaz saati kendiliğinden doğrudur", () => {
    assert.equal(
      formatEmailRequestTime({ locale: "tr", now: AUGUST, timeZone: "Europe/Berlin" }),
      "27 Ağustos 2026, 13:32 (GMT+2)",
    );
    assert.equal(
      formatEmailRequestTime({ locale: "tr", now: JANUARY, timeZone: "Europe/Berlin" }),
      "15 Ocak 2026, 12:32 (GMT+1)",
    );
    assert.equal(
      formatEmailRequestTime({ locale: "en", now: AUGUST, timeZone: "America/New_York" }),
      "27 August 2026, 07:32 (GMT-4)",
    );
  });
});

describe("e-posta istek bağlamı — birleşim", () => {
  it("başlıksız çağrıda zaman üretilir, cihaz satırı üretilmez", () => {
    const context = resolveEmailRequestContext({ locale: "tr", now: AUGUST });

    assert.equal(context.deviceLine, null);
    assert.equal(context.requestedAtLabel, "27 Ağustos 2026, 14:32 (GMT+3)");
  });

  it("tam bağlam iki satırı da doldurur", () => {
    const context = resolveEmailRequestContext({
      headers: headers({
        "user-agent": CHROME_MAC,
        "x-vercel-ip-city": "%C4%B0stanbul",
        "x-vercel-ip-country": "TR",
      }),
      locale: "tr",
      now: AUGUST,
      timeZone: "Europe/Istanbul",
    });

    assert.deepEqual(context, {
      deviceLine: "Chrome · macOS · İstanbul, TR",
      requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)",
    });
  });
});
