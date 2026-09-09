import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SharedFileDTO, SharedLinkDTO } from "@wizards/types";

import {
  formatExtensionLabel,
  formatSharedTimestamp,
  ProfileFileRow,
  ProfileLinkRow,
  resolveExtensionTint,
  toLinkDisplayUrl,
} from "@/components/messages/profile-file-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — §15.5'in dosya ve bağlantı satırları.
 *
 * Satırlar veri çekmiyor; girdileri prop. Bu yüzden testler doğrudan `renderToStaticMarkup`
 * ile koşuyor ve saat `now` prop'undan geliyor — render sırasında okunan bir saat testte
 * dondurulamazdı ve `Dün` sınırı gece yarısı kendiliğinden kayardı.
 */

const NOW = new Date("2026-08-27T12:00:00.000Z");

function file(overrides: Partial<SharedFileDTO> = {}): SharedFileDTO {
  return {
    attachmentId: "att-1",
    createdAt: "2026-08-26T14:04:00.000Z",
    extension: "pdf",
    messageId: "m-1",
    name: "surum-2.4-notlari.pdf",
    // 1,2 MB — 1.19999… MB, tam olarak tek ondalığa yuvarlanan bir değer.
    sizeBytes: 1_258_291,
    url: "https://cdn.whispr.test/att-1",
    ...overrides,
  };
}

function link(overrides: Partial<SharedLinkDTO> = {}): SharedLinkDTO {
  return {
    createdAt: "2026-08-26T14:04:00.000Z",
    host: "whispr.app",
    messageId: "m-2",
    title: "Sürüm 2.4 notları",
    url: "https://whispr.app/changelog",
    ...overrides,
  };
}

function render(node: React.ReactNode, locale: "en" | "tr" = "tr") {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale} initialMessages={getMessagesForLocale(locale)}>
      {node}
    </LocaleProvider>,
  );
}

describe("uzantı karosu (SPEC §15.5)", () => {
  it("uzantıyı büyütür ve dört karakterde keser", () => {
    assert.equal(formatExtensionLabel("pdf"), "PDF");
    assert.equal(formatExtensionLabel(".fig"), "FIG");
    assert.equal(formatExtensionLabel("sketch"), "SKET");
  });

  /**
   * Panelin geri kalanı Türkçe kuralıyla büyütüyor; uzantı **büyütmemeli**.
   * `"fig".toLocaleUpperCase("tr")` → `FİG`, ve bir dosya uzantısı Türkçe metin değil.
   */
  it("noktalı i üretmez", () => {
    assert.equal(formatExtensionLabel("fig"), "FIG");
    assert.doesNotMatch(formatExtensionLabel("fig"), /İ/);
  });

  it("bilinen uzantı sabit tint, bilinmeyen nötr", () => {
    assert.equal(resolveExtensionTint("pdf"), "danger");
    assert.equal(resolveExtensionTint("PDF"), "danger");
    assert.equal(resolveExtensionTint("xlsx"), "success");
    assert.equal(resolveExtensionTint("xyz"), "neutral");
  });
});

describe("paylaşılan zaman damgası", () => {
  const labels = { today: "Bugün", yesterday: "Dün" };

  it("dün için gün adı + saat verir", () => {
    const text = formatSharedTimestamp("2026-08-26T14:04:00.000Z", NOW, "tr", labels);

    assert.match(text, /^Dün /);
  });

  it("bugün için bugün etiketini verir", () => {
    assert.match(formatSharedTimestamp("2026-08-27T09:00:00.000Z", NOW, "tr", labels), /^Bugün /);
  });

  it("eski tarihte gün + ay, farklı yılda yıl da", () => {
    assert.match(formatSharedTimestamp("2026-08-12T09:00:00.000Z", NOW, "tr", labels), /12/);
    assert.doesNotMatch(
      formatSharedTimestamp("2026-08-12T09:00:00.000Z", NOW, "tr", labels),
      /2026/,
    );
    assert.match(formatSharedTimestamp("2025-08-12T09:00:00.000Z", NOW, "tr", labels), /2025/);
  });

  it("bozuk tarihte boş dize", () => {
    assert.equal(formatSharedTimestamp("belirsiz", NOW, "tr", labels), "");
  });
});

describe("dosya satırı", () => {
  /**
   * Boyut biçimi Ş3'ün `formatSharedFileSize` yardımcısından geliyor ve locale'e saygılı:
   * `toFixed` kullanılsaydı İngilizce nokta Türkçe arayüze gömülürdü.
   */
  it("tr locale'de virgüllü, en locale'de noktalı boyut çizer", () => {
    assert.match(
      render(<ProfileFileRow item={file()} now={NOW} onOpen={() => undefined} />),
      /1,2 MB/,
    );
    assert.match(
      render(<ProfileFileRow item={file()} now={NOW} onOpen={() => undefined} />, "en"),
      /1\.2 MB/,
    );
  });

  it("boyut ve tarihi tek satırda birleştirir", () => {
    const markup = render(<ProfileFileRow item={file()} now={NOW} onOpen={() => undefined} />);

    assert.match(markup, /1,2 MB · Dün/);
  });

  /**
   * İndirme gerçek bir `a[download]` ve **korumalı uca** bakıyor: CDN adresi çapraz
   * kaynak olduğu için `download` özniteliğini yok sayardı ve dosya sekmede açılırdı.
   */
  it("indirme bağlantısı gerçek a[download] ve adlandırılmış", () => {
    const markup = render(<ProfileFileRow item={file()} now={NOW} onOpen={() => undefined} />);

    assert.match(markup, /<a[^>]+download="surum-2\.4-notlari\.pdf"/);
    assert.match(markup, /href="\/api\/v1\/attachments\/att-1\/download"/);
    assert.match(markup, /aria-label="İndir · surum-2\.4-notlari\.pdf"/);
  });

  it("satır gövdesi gerçek button", () => {
    const markup = render(<ProfileFileRow item={file()} now={NOW} onOpen={() => undefined} />);

    assert.match(markup, /<button[^>]+data-testid="profile-file-row-open"/);
  });
});

describe("bağlantı satırı", () => {
  it("başlık varsa iki satır: başlık + adres", () => {
    const markup = render(<ProfileLinkRow item={link()} />);

    assert.match(markup, /Sürüm 2.4 notları/);
    assert.match(markup, /whispr\.app\/changelog/);
    assert.match(markup, /data-testid="profile-link-row-host"/);
  });

  /**
   * Ş3 §3: `title` markdown bağlantı etiketinden geliyor, çıplak URL'de `null` kalıyor.
   * O durumda adres tek satır olur — boş bir başlığın altında ikinci satır çizilmez.
   */
  it("başlık yoksa adres tek satır olur", () => {
    const markup = render(<ProfileLinkRow item={link({ title: null })} />);

    assert.match(markup, /data-testid="profile-link-row-title"[^>]*>whispr\.app\/changelog</);
    assert.doesNotMatch(markup, /data-testid="profile-link-row-host"/);
  });

  it("yeni sekmede ve rel korumasıyla açılır", () => {
    const markup = render(<ProfileLinkRow item={link()} />);

    assert.match(markup, /target="_blank"/);
    assert.match(markup, /rel="noopener noreferrer"/);
  });

  it("adres şemasız ve sondaki eğik çizgisiz gösterilir", () => {
    assert.equal(toLinkDisplayUrl("https://figma.com/file/kritik"), "figma.com/file/kritik");
    assert.equal(toLinkDisplayUrl("https://whispr.app/"), "whispr.app");
  });
});
