import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { VoiceRecorder } from "@/components/chat/voice-recorder";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import {
  createIdempotentVoiceCleanup,
  createVoiceCaptureGeneration,
  createVoiceRecordingDraft,
  requestVoiceCaptureStream,
} from "@/lib/messages/voice-capture";

/**
 * `MediaRecorder`, `getUserMedia` ve `AudioContext` bu koşuda **yok**: node
 * ortamında hiçbiri tanımlı değil ve sahtelerini kurmak, kaydın kendisini değil
 * sahteyi test etmek olurdu.
 *
 * Bu dosya bileşenin **boşta** hâlini kilitliyor: düğme çizilir, etiketi taşır,
 * kapalıyken pasiftir ve kayıt yokken hiçbir kaynak açılmamıştır. Kaydın kendisi
 * — izin reddi, beş dakika tavanı, `Esc` ile atma, unmount temizliği — gerçek
 * tarayıcı gerektirir ve `messages-voice.spec.ts` (Dalga 3) ile koşulacak.
 *
 * Ölçülebilir olanın hepsi `lib/messages/voice-capture.ts` içinde saf ve testli:
 * RMS, tavan, canlı/saklanan dalga formu, kayıt tipi seçimi, dosya adı.
 */
function render(overrides: Partial<React.ComponentProps<typeof VoiceRecorder>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <VoiceRecorder onRecorded={() => undefined} {...overrides} />
    </LocaleProvider>,
  );
}

describe("sesli mesaj kaydı — boşta", () => {
  it("kayıt düğmesini çizer", () => {
    const markup = render();

    assert.match(markup, /data-testid="voice-recorder-start"/);
    assert.match(markup, /aria-label="Ses kaydı"/);
  });

  it("kayıt şeridi kayıt başlamadan çizilmez", () => {
    const markup = render();

    assert.doesNotMatch(markup, /data-testid="voice-recorder-active"/);
    assert.doesNotMatch(markup, /data-testid="voice-recorder-send"/);
    assert.doesNotMatch(markup, /data-testid="voice-recorder-cancel"/);
  });

  it("kapalıyken düğme pasiftir", () => {
    assert.match(render({ disabled: true }), /disabled=""/);
  });

  /**
   * Bu düğme uzun süre "henüz kullanılabilir değil" diyordu. Artık öyle bir
   * metin **yok**: düğme ya çalışır ya kapalıdır.
   */
  it("artık kullanılamaz mesajı taşımaz", () => {
    assert.doesNotMatch(render(), /henüz kullanılabilir değil/);
  });
});

describe("sesli mesaj lifecycle", () => {
  function streamWithStops(stops: string[], label: string): MediaStream {
    return {
      getTracks: () => [{ stop: () => stops.push(label) }],
    } as unknown as MediaStream;
  }

  it("unmount sonrası çözülen getUserMedia stream'ini hemen durdurur", async () => {
    const stops: string[] = [];
    const lifecycle = createVoiceCaptureGeneration();
    const generation = lifecycle.begin();
    let resolveStream!: (stream: MediaStream) => void;
    const pending = requestVoiceCaptureStream(
      lifecycle,
      generation,
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );

    lifecycle.unmount();
    resolveStream(streamWithStops(stops, "late"));

    assert.deepEqual(await pending, { kind: "stale" });
    assert.deepEqual(stops, ["late"]);
  });

  it("request çözülmeden iptal edilen generation'ı yeniden başlatmaz", async () => {
    const stops: string[] = [];
    const lifecycle = createVoiceCaptureGeneration();
    const generation = lifecycle.begin();
    let resolveStream!: (stream: MediaStream) => void;
    const pending = requestVoiceCaptureStream(
      lifecycle,
      generation,
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );

    lifecycle.cancel(generation);
    resolveStream(streamWithStops(stops, "cancelled"));

    assert.deepEqual(await pending, { kind: "stale" });
    assert.deepEqual(stops, ["cancelled"]);
  });

  it("izin reddini yalnız current generation için güvenli hata yapar", async () => {
    const lifecycle = createVoiceCaptureGeneration();
    const generation = lifecycle.begin();

    const result = await requestVoiceCaptureStream(lifecycle, generation, async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });

    assert.deepEqual(result, { kind: "error" });
    assert.equal(lifecycle.isCurrent(generation), true);
  });

  it("hızlı start-stop-start sırasında eski generation yeni session'ı etkileyemez", () => {
    const stops: string[] = [];
    const lifecycle = createVoiceCaptureGeneration();
    const first = lifecycle.begin();
    lifecycle.cancel(first);
    const second = lifecycle.begin();

    assert.equal(lifecycle.acceptStream(first, streamWithStops(stops, "first")), false);
    assert.equal(lifecycle.acceptStream(second, streamWithStops(stops, "second")), true);
    assert.deepEqual(stops, ["first"]);
    assert.equal(lifecycle.isCurrent(second), true);
  });

  it("stream/timer/listener/object URL cleanup'ını idempotent çalıştırır", () => {
    const calls: string[] = [];
    const cleanup = createIdempotentVoiceCleanup(() => {
      calls.push("recorder");
      calls.push("stream");
      calls.push("timer");
      calls.push("listener");
      calls.push("object-url");
    });

    cleanup();
    cleanup();

    assert.deepEqual(calls, ["recorder", "stream", "timer", "listener", "object-url"]);
  });

  it("maksimum süre stop'u draft üretir; otomatik publish etmez", () => {
    const sent: string[] = [];
    const revoked: string[] = [];
    const draft = createVoiceRecordingDraft<string>((url) => revoked.push(url));

    draft.stage({ recording: "auto-stopped", url: "blob:auto" });

    assert.deepEqual(sent, []);
    assert.deepEqual(draft.peek(), { recording: "auto-stopped", url: "blob:auto" });
    assert.deepEqual(revoked, []);
  });

  it("yalnız explicit send draft'ı publish eder ve object URL'yi kapatır", () => {
    const sent: string[] = [];
    const revoked: string[] = [];
    const draft = createVoiceRecordingDraft<string>((url) => revoked.push(url));
    draft.stage({ recording: "ready", url: "blob:ready" });

    assert.equal(
      draft.send((recording) => sent.push(recording)),
      true,
    );
    assert.equal(
      draft.send((recording) => sent.push(recording)),
      false,
    );

    assert.deepEqual(sent, ["ready"]);
    assert.deepEqual(revoked, ["blob:ready"]);
    assert.equal(draft.peek(), null);
  });
});
