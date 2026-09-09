import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSplashState, getSplashStep, isSplashComplete } from "@wizards/types";

import { darkTheme, lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import {
  advanceMobileSplashStep,
  getMobileSplashStateVisual,
  MOBILE_SPLASH_STATE_COPY,
  MOBILE_SPLASH_STEP_COPY,
  MOBILE_SPLASH_TIP_COPY,
  pickMobileSplashTipKey,
  toMobileSplashRuntime,
  type MobileSplashSignals,
} from "../src/app/screens/splash/mobile-splash-model";

/**
 * SPEC-SPLASH mobil modelinin denetimi.
 *
 * Ekran dosyası karar vermediği için burada ölçülen şey açılışın **tamamı**: hangi
 * sinyal hangi adımı açar, hangi durum kazanır, hangi ton hangi temada okunur.
 */

function signals(overrides: Partial<MobileSplashSignals> = {}): MobileSplashSignals {
  return {
    authStatus: "signed-in",
    bootstrapSettled: true,
    elapsedMs: 0,
    networkStatus: "online",
    realtimeStatus: "connected",
    sessionExpired: false,
    update: null,
    workspaceLoaded: true,
    ...overrides,
  };
}

describe("toMobileSplashRuntime", () => {
  it("oturum kontrolü bitene kadar ikinci adımda kalır", () => {
    const runtime = toMobileSplashRuntime(
      signals({ authStatus: "checking", bootstrapSettled: false }),
    );

    assert.equal(runtime.sessionHydrated, false);
    assert.equal(getSplashStep(runtime), "connecting");
  });

  it("bootstrap yanıtlanınca birinci adımı geçer", () => {
    const runtime = toMobileSplashRuntime(
      signals({ authStatus: "checking", bootstrapSettled: true }),
    );

    assert.equal(runtime.bootstrapRequestSettled, true);
    assert.equal(getSplashStep(runtime), "session");
  });

  it("oturumsuz kullanıcıyı sunucu listesinde bekletmez", () => {
    const runtime = toMobileSplashRuntime(
      signals({ authStatus: "signed-out", workspaceLoaded: false }),
    );

    assert.equal(runtime.workspaceLoaded, true);
    assert.equal(getSplashStep(runtime), "almostReady");
  });

  it("soket bağlanmadan da 20 sn sonra açılır", () => {
    const withoutSocket = signals({ realtimeStatus: "connecting" });

    assert.equal(isSplashComplete(toMobileSplashRuntime(withoutSocket)), false);
    assert.equal(
      isSplashComplete(toMobileSplashRuntime({ ...withoutSocket, elapsedMs: 20_000 })),
      true,
    );
  });

  it("bilinmeyen ağ durumunu çevrimiçi sayar, çevrimdışını saymaz", () => {
    assert.equal(toMobileSplashRuntime(signals({ networkStatus: "unknown" })).online, true);
    assert.equal(toMobileSplashRuntime(signals({ networkStatus: "offline" })).online, false);
  });

  it("durum önceliği web ile aynı motordan gelir", () => {
    assert.equal(getSplashState(toMobileSplashRuntime(signals())), "loading");
    assert.equal(getSplashState(toMobileSplashRuntime(signals({ elapsedMs: 10_000 }))), "slow");
    assert.equal(
      getSplashState(
        toMobileSplashRuntime(signals({ elapsedMs: 10_000, networkStatus: "offline" })),
      ),
      "offline",
    );
    assert.equal(
      getSplashState(
        toMobileSplashRuntime(signals({ networkStatus: "offline", sessionExpired: true })),
      ),
      "sessionExpired",
    );
  });
});

describe("advanceMobileSplashStep", () => {
  it("geri saymaz", () => {
    assert.equal(advanceMobileSplashStep("servers", "connecting"), "servers");
    assert.equal(advanceMobileSplashStep("session", "almostReady"), "almostReady");
  });
});

describe("getMobileSplashStateVisual", () => {
  it("metin tonunu zemin tonuyla karıştırmaz", () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const state of ["slow", "offline", "updating", "sessionExpired"] as const) {
        const visual = getMobileSplashStateVisual(theme, state);

        assert.notEqual(visual.tone, visual.tile, `${state} tonu zeminle aynı olmamalı`);
        assert.match(visual.tone, /^#|^rgb/, state);
        assert.match(visual.tile, /^#|^rgb/, state);
        assert.ok(visual.washOpacity > 0 && visual.washOpacity < 1, state);
      }
    }
  });

  it("iki temada da farklı değerler verir", () => {
    const light = getMobileSplashStateVisual(lightTheme, "offline");
    const dark = getMobileSplashStateVisual(darkTheme, "offline");

    assert.notEqual(light.tile, dark.tile);
  });
});

describe("mobil kopya anahtarları", () => {
  it("her adım ve her ipucu sözlükte var", () => {
    for (const key of Object.values(MOBILE_SPLASH_STEP_COPY)) {
      assert.equal(typeof mobileCopy.tr[key], "string", key);
      assert.equal(typeof mobileCopy.en[key], "string", key);
    }

    for (const key of MOBILE_SPLASH_TIP_COPY) {
      assert.equal(typeof mobileCopy.tr[key], "string", key);
    }
  });

  it("dört durumun metinleri sözlükte var", () => {
    for (const [state, keys] of Object.entries(MOBILE_SPLASH_STATE_COPY)) {
      for (const key of Object.values(keys)) {
        assert.equal(typeof mobileCopy.tr[key], "string", `${state}.${key}`);
        assert.equal(typeof mobileCopy.en[key], "string", `${state}.${key}`);
      }
    }
  });

  it("adım metinleri devir paketiyle birebir", () => {
    assert.equal(mobileCopy.tr[MOBILE_SPLASH_STEP_COPY.connecting], "Bağlanıyor");
    assert.equal(mobileCopy.tr[MOBILE_SPLASH_STEP_COPY.session], "Oturum doğrulanıyor");
    assert.equal(mobileCopy.tr[MOBILE_SPLASH_STEP_COPY.servers], "Sunucular yükleniyor");
    assert.equal(mobileCopy.tr[MOBILE_SPLASH_STEP_COPY.almostReady], "Neredeyse hazır");
  });
});

describe("pickMobileSplashTipKey", () => {
  it("dört ipucunu da seçebilir", () => {
    const picked = new Set([0, 0.3, 0.6, 0.9].map(pickMobileSplashTipKey));

    assert.equal(picked.size, MOBILE_SPLASH_TIP_COPY.length);
  });
});
