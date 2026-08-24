import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Bestekârın SPEC §5.6 sözleşmesi — kaynak üzerinden.
 *
 * `ChatComposer` 1800 satırlık bir bileşen ve `useUploadThing`, `useTyping`,
 * `useSocket` üçünü birden istiyor; onu render etmek üç sahte kurup asıl
 * doğrulanacak şeyi (hangi kısayol hangi işaretçiyi yazıyor) gölgeler.
 *
 * Bu yüzden sözleşme **kaynakta** okunuyor: dokuz aracın dokuzu duruyor mu, üç
 * kısayol bağlı mı, ipuçları SPEC'ten mi geliyor, ölü anket şablonu gitti mi.
 * Davranışın kendisi — imleç nereye düşüyor, seçim nasıl sarılıyor — gerçek
 * tarayıcıda `e2e/specs/message-interactions` ile koşuyor.
 */

/**
 * Şerit `composer-formatting-bar.tsx`'e çıkarıldı; sözleşme iki dosyayı birden
 * okuyor. Tek dosyaya bakan bir test, çıkarma sırasında sessizce yeşil kalırdı.
 */
const SOURCE =
  readFileSync(fileURLToPath(new URL("./message-input.tsx", import.meta.url)), "utf8") +
  readFileSync(fileURLToPath(new URL("./composer-formatting-bar.tsx", import.meta.url)), "utf8");

describe("biçimlendirme şeridi — dokuz araç", () => {
  const TOOLS = [
    "chat.input.bold",
    "chat.input.italic",
    "chat.input.underline",
    "chat.input.strikethrough",
    "chat.input.bulletedList",
    "chat.input.orderedList",
    "chat.input.quote",
    "chat.input.inlineCode",
    "chat.input.codeBlock",
  ] as const;

  it("dokuzu da çiziliyor", () => {
    for (const key of TOOLS) {
      assert.ok(SOURCE.includes(`aria-label={t("${key}")}`), key);
    }
  });

  it("her aracın ipucu SPEC'in kısayolunu taşıyor", () => {
    const HINTS = [
      "messages.composer.tool.boldHint",
      "messages.composer.tool.italicHint",
      "messages.composer.tool.underlineHint",
      "messages.composer.tool.strikethroughHint",
      "messages.composer.tool.bulletListHint",
      "messages.composer.tool.orderedListHint",
      "messages.composer.tool.quoteHint",
      "messages.composer.tool.inlineCodeHint",
      "messages.composer.tool.codeBlockHint",
    ] as const;

    for (const key of HINTS) {
      assert.ok(SOURCE.includes(key), key);
    }
  });

  it("şeridin sağında Markdown ipucu var", () => {
    assert.ok(SOURCE.includes('data-testid="message-formatting-hint"'));
    assert.ok(SOURCE.includes("messages.composer.markdownHint"));
  });

  it("şerit açıkken alanın üst köşesi düzleşiyor", () => {
    // SPEC §5.6: `Aa` açıkken bestekârın üst yarıçapı düzleşir.
    assert.ok(SOURCE.includes('formattingOpen ? "rounded-b-[1.375rem] rounded-t-none"'));
  });
});

describe("klavye kısayolları", () => {
  it("Ctrl/Cmd + B, I, U bağlı", () => {
    assert.match(SOURCE, /FORMATTING_SHORTCUTS\[event\.key\.toLowerCase\(\)\]/);
    assert.match(SOURCE, /b: \{ fallbackKey: "chat\.input\.boldFallback", marker: "\*\*" \}/);
    assert.match(SOURCE, /i: \{ fallbackKey: "chat\.input\.italicFallback", marker: "_" \}/);
    assert.match(SOURCE, /u: \{ fallbackKey: "chat\.input\.underlineFallback", marker: "\+\+" \}/);
  });

  /**
   * `AltGr` Türkçe düzende `Ctrl+Alt` olarak gelir; dışlanmasaydı `AltGr+B`
   * yazmak isteyen kullanıcıya kalın metin açılırdı.
   */
  it("AltGr dışlanıyor", () => {
    assert.match(SOURCE, /\(event\.metaKey \|\| event\.ctrlKey\) && !event\.altKey/);
  });

  it("Esc yalnız yanıt açıkken tüketiliyor", () => {
    // Boş bestekârda `Esc`'i yutmak, üstteki paneli kapatmak isteyen kullanıcının
    // tuşunu kaybetmesi olurdu.
    assert.match(SOURCE, /event\.key === "Escape" && replyTo/);
  });

  it("Enter gönderir, Shift+Enter satır açar", () => {
    assert.match(SOURCE, /event\.key === "Enter" && !event\.shiftKey/);
  });
});

describe("anket girişi (karar #1)", () => {
  it("markdown anket şablonu kaldırıldı", () => {
    // Şablon + emoji tepkisiyle oy, anonimliği ve oy taşımayı hiç veremezdi.
    assert.doesNotMatch(SOURCE, /insertPollTemplate/);
    assert.doesNotMatch(SOURCE, /chat\.input\.pollTemplate/);
  });

  it("anket düğmeleri modalı açar", () => {
    assert.ok(SOURCE.includes('data-testid="message-poll-button"'));
    assert.ok(SOURCE.includes('data-testid="message-formatting-poll-button"'));
    assert.ok(SOURCE.includes('data-testid="mobile-poll-button"'));
  });

  it("anket kapalıyken hiçbir giriş çizilmez", () => {
    // `pollEnabled` üç yerde birden koşul: bir yerde unutulan bayrak, kapalı
    // olması gereken yüzeyde açık bir düğme bırakırdı.
    const guards = SOURCE.match(/pollEnabled && onOpenPoll/g) ?? [];

    assert.equal(guards.length, 3);
  });
});

describe("sesli mesaj (karar #5)", () => {
  it("kayıt bileşeni bağlı", () => {
    assert.ok(SOURCE.includes("<VoiceRecorder"));
    assert.ok(SOURCE.includes("handleVoiceRecorded"));
  });

  it("kullanılamaz mesajı kalmadı", () => {
    assert.doesNotMatch(SOURCE, /voiceMessageUnavailable/);
  });

  it("kayıt süresi ve dalga formu ekle birlikte gönderiliyor", () => {
    // Yalnız biri gelen bir ek, oynatıcının dolduramayacağı bir çubuk çizerdi.
    assert.match(SOURCE, /duration: durationSeconds, waveform: recording\.waveform/);
  });
});

describe("Mesajlar referans bestekâr düzeni", () => {
  it("metin alanı ve masaüstü eylemleri tek yatay yüzeydedir", () => {
    assert.ok(SOURCE.includes('data-testid="message-composer-input-row"'));
  });

  it("HTML sapması gereği anket ses kaydından önce gelir", () => {
    assert.match(
      SOURCE,
      /data-testid="message-poll-button"[\s\S]*<VoiceRecorder[\s\S]*data-testid="message-send-button"/,
    );
  });
});
