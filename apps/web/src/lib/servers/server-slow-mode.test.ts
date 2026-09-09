import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CHANNEL_SLOW_MODE_DELAYS } from "@wizards/types";

import {
  isSupportedSlowMode,
  resolveEffectiveSlowMode,
  resolveSlowModeSource,
} from "./server-slow-mode";

describe("etkin yavaş mod — SPEC §8.3", () => {
  it("iki süre birlikte tanımlıysa uzun olanı uygular", () => {
    assert.equal(resolveEffectiveSlowMode(300, 30), 300);
    assert.equal(resolveEffectiveSlowMode(30, 300), 300);
  });

  it("yalnız biri tanımlıysa onu uygular", () => {
    assert.equal(resolveEffectiveSlowMode(0, 60), 60);
    assert.equal(resolveEffectiveSlowMode(60, 0), 60);
  });

  it("ikisi de kapalıysa kapalı kalır", () => {
    assert.equal(resolveEffectiveSlowMode(0, 0), 0);
  });

  it("bozuk değeri bekleme süresine dönüştürmez", () => {
    // `Math.max(NaN, 5)` `NaN` döner; o `NaN` bir geri sayıma girerse bestekar sessizce kilitlenir.
    assert.equal(resolveEffectiveSlowMode(Number.NaN, 5), 5);
    assert.equal(resolveEffectiveSlowMode(-30, 0), 0);
    assert.equal(resolveEffectiveSlowMode(Number.POSITIVE_INFINITY, 10), 10);
  });

  it("sonucu her zaman iki girdiden birine eşitler", () => {
    for (const server of CHANNEL_SLOW_MODE_DELAYS) {
      for (const channel of CHANNEL_SLOW_MODE_DELAYS) {
        const effective = resolveEffectiveSlowMode(server, channel);

        assert.ok(effective === server || effective === channel);
        assert.equal(isSupportedSlowMode(effective), true);
      }
    }
  });
});

describe("etkin sürenin kaynağı", () => {
  it("uzun olan sunucu ayarıysa `server` der", () => {
    assert.equal(resolveSlowModeSource(300, 30), "server");
  });

  it("uzun olan kanal ayarıysa `channel` der", () => {
    assert.equal(resolveSlowModeSource(30, 300), "channel");
  });

  it("eşitlikte kanalı gösterir", () => {
    // Kullanıcı kanal penceresinde duruyor; kendi ayarını "sunucudan geliyor" diye okumamalı.
    assert.equal(resolveSlowModeSource(60, 60), "channel");
  });

  it("ikisi de kapalıyken kaynak yoktur", () => {
    assert.equal(resolveSlowModeSource(0, 0), "none");
  });
});

describe("desteklenen değer kümesi", () => {
  it("kanal çip grubunun on iki seçeneğini kabul eder", () => {
    assert.equal(CHANNEL_SLOW_MODE_DELAYS.length, 12);

    for (const delay of CHANNEL_SLOW_MODE_DELAYS) {
      assert.equal(isSupportedSlowMode(delay), true);
    }
  });

  it("çip grubunda karşılığı olmayan süreyi reddeder", () => {
    assert.equal(isSupportedSlowMode(45), false);
    assert.equal(isSupportedSlowMode(7_200), false);
  });
});
