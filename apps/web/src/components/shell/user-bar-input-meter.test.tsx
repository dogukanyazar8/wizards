import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { UserBarInputMeter } from "@/components/shell/user-bar-input-meter";
import { MicLevelSession, type CapturedAudioStream } from "@/hooks/use-mic-level";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";

/** Ş12 §4 — giriş seviyesi ölçeri. */

const TR = getMessagesForLocale("tr");

function render() {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <UserBarInputMeter deviceId="default" />
    </LocaleProvider>,
  );
}

describe("UserBarInputMeter", () => {
  const markup = render();

  it("segment sayısı ölçü sözlüğünden geliyor", () => {
    const segments = markup.match(/data-mic-segment=/g) ?? [];

    assert.equal(SETTINGS_METRICS.userMenu.meter.segmentCount, 14);
    assert.equal(segments.length, SETTINGS_METRICS.userMenu.meter.segmentCount);
  });

  it("referans etiketi ve düğmesi birebir", () => {
    assert.ok(markup.includes("Giriş seviyesi"));
    assert.ok(markup.includes("Test et"));
  });

  it("ölçer `aria-hidden`, erişilebilir karşılığı `aria-live` durum metni", () => {
    assert.ok(markup.includes('aria-hidden="true"'));
    assert.ok(markup.includes('aria-live="polite"'));
    assert.ok(markup.includes("Mikrofon testi kapalı"));
  });

  it("token dışı renk yok", () => {
    assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b/iu);
    assert.doesNotMatch(markup, /rgba?\(/u);
  });
});

describe("`Test et` kapanınca stream durur", () => {
  it("stop() track'leri kapatır — kaynak sızıntısı yasak", async () => {
    const stopped: string[] = [];
    const stream: CapturedAudioStream = {
      getTracks: () => [{ stop: () => stopped.push("track") }],
    };
    const session = new MicLevelSession({
      capture: async () => stream,
      createMonitor: () => ({ dispose: () => stopped.push("monitor"), readLevel: () => 0.5 }),
      scheduler: { clearTimer: () => undefined, setTimer: () => 1 },
    });

    await session.start("default");
    assert.equal(session.isRunning(), true);

    session.stop();

    assert.deepEqual(stopped, ["monitor", "track"]);
    assert.equal(session.isRunning(), false);
  });
});
