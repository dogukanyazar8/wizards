import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  playTestTone,
  TEST_TONE_DURATION_SECONDS,
  TEST_TONE_FREQUENCY_HZ,
  type TestTonePlayer,
} from "@/components/settings/sections/av/av-test-tone";

/** Ş8 §A.2 — `u2`, `Test sesi çal`. */

function fakePlayer(options: { withSink?: boolean } = {}) {
  const events: string[] = [];
  let ended: (() => void) | null = null;

  const oscillator = {
    connect: () => events.push("oscillator.connect"),
    frequency: { value: 0 },
    onended: null as null | (() => void),
    start: (at: number) => events.push(`start:${at}`),
    stop: (at: number) => {
      events.push(`stop:${at}`);
      ended = () => oscillator.onended?.();
      queueMicrotask(() => ended?.());
    },
  };

  const player: TestTonePlayer = {
    close: async () => {
      events.push("close");
    },
    createGain: () => ({ connect: () => events.push("gain.connect"), gain: { value: 0 } }) as never,
    createOscillator: () => oscillator as never,
    currentTime: 0,
    destination: {} as never,
    ...(options.withSink
      ? {
          setSinkId: async (sinkId: string) => {
            events.push(`sink:${sinkId}`);
          },
        }
      : {}),
  };

  return { events, oscillator, player };
}

describe("playTestTone", () => {
  it("tonu çalıyor ve bağlamı her durumda kapatıyor", async () => {
    const { events, oscillator, player } = fakePlayer();

    assert.equal(await playTestTone("default", () => player), true);

    assert.equal(oscillator.frequency.value, TEST_TONE_FREQUENCY_HZ);
    assert.ok(events.includes(`stop:${TEST_TONE_DURATION_SECONDS}`));
    assert.equal(events.at(-1), "close", "AudioContext açık kaldı");
  });

  it("seçili çıkışa yönlendiriyor", async () => {
    const { events, player } = fakePlayer({ withSink: true });

    await playTestTone("speaker-2", () => player);

    assert.ok(events.includes("sink:speaker-2"));
  });

  it("varsayılan çıkış için yönlendirme denemesi yok", async () => {
    const { events, player } = fakePlayer({ withSink: true });

    await playTestTone("default", () => player);

    assert.ok(!events.some((event) => event.startsWith("sink:")));
  });

  it("AudioContext yoksa sessizce `false`", async () => {
    assert.equal(await playTestTone("default", () => null), false);
  });
});
