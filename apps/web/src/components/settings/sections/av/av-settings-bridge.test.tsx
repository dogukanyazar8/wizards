import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyAvSettingsPatch,
  readAvSettingsValues,
  resolveAudioProcessingStateKey,
  type AvVoiceSnapshot,
  type AvVoiceWriter,
} from "@/components/settings/sections/av/av-settings-bridge";
import { SETTINGS_DIRTY_PROFILE_KEYS } from "@/lib/settings/metrics";
import { findSettingsTab } from "@/lib/settings/tree";
import { isDirtyProfileKey } from "@/lib/settings/use-setting-value";
import {
  CLEAN_AUDIO_PROFILE_PRESET,
  isCleanAudioProfileActive,
} from "@/lib/voice/clean-audio-profile";

/** Ş8 §A — cihaz durumu ↔ satır değerleri eşlemesi. */

const srcRoot = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));

function snapshot(overrides: Partial<AvVoiceSnapshot> = {}): AvVoiceSnapshot {
  return {
    audioPreferences: {
      autoGainControl: false,
      echoCancellation: true,
      enhancedNoiseFilterMode: "layered",
      inputDeviceId: "default",
      krispNoiseCancellation: true,
      noiseSuppression: true,
      outputDeviceId: "default",
      voiceIsolation: true,
    },
    cameraPreferences: {
      backgroundBlur: false,
      deviceId: "default",
      mirrorPreview: true,
      rotation: 0,
    },
    pushToTalkHangoverMs: 200,
    masterOutputVolume: 78,
    screenShareAllowSourceSwitch: true,
    screenShareAudioEnabled: true,
    screenShareExcludeSelfWindow: true,
    screenShareQuality: "h1080fps60",
    screenShareVolume: 60,
    selfMonitorEnabled: false,
    voiceInputMode: "voice-activity",
    ...overrides,
  };
}

function recorder() {
  const calls: Array<[string, unknown, unknown]> = [];

  const writer: AvVoiceWriter = {
    setAudioPreference: (key, value) => calls.push(["setAudioPreference", key, value]),
    setCameraPreference: (key, value) => calls.push(["setCameraPreference", key, value]),
    setPushToTalkHangoverMs: (value) => calls.push(["setPushToTalkHangoverMs", value, null]),
    setScreenShareAudioEnabled: (value) => calls.push(["setScreenShareAudioEnabled", value, null]),
    setScreenShareQuality: async (value) => {
      calls.push(["setScreenShareQuality", value, null]);
    },
    setScreenShareVolume: (value) => calls.push(["setScreenShareVolume", value, null]),
    setMasterOutputVolume: (value) => calls.push(["setMasterOutputVolume", value, null]),
    setScreenShareAllowSourceSwitch: (value) =>
      calls.push(["setScreenShareAllowSourceSwitch", value, null]),
    setScreenShareExcludeSelfWindow: (value) =>
      calls.push(["setScreenShareExcludeSelfWindow", value, null]),
    setSelfMonitorEnabled: (value) => calls.push(["setSelfMonitorEnabled", value, null]),
    setVoiceInputMode: (value) => calls.push(["setVoiceInputMode", value, null]),
  };

  return { calls, writer };
}

describe("AV köprüsü — okuma", () => {
  it("cihaz durumundan satır değerlerine", () => {
    const values = readAvSettingsValues(snapshot());

    assert.equal(values.p1, true, "önerilen kümede profil açık olmalı");
    assert.equal(values.i5, 0);
    assert.equal(values.i6, 200);
    assert.equal(values.e1, 1, "1080p60 ikinci seçenek");
    assert.equal(values.e3, 60);
    assert.equal(values.p7, 0, "katmanlı ilk seçenek");
  });

  it("bir filtre sapınca profil kapanıyor (kendiliğinden)", () => {
    const drifted = snapshot({
      audioPreferences: {
        ...snapshot().audioPreferences,
        noiseSuppression: false,
      },
    });

    assert.equal(readAvSettingsValues(drifted).p1, false);
    assert.equal(isCleanAudioProfileActive(drifted.audioPreferences), false);
  });
});

describe("AV köprüsü — yazma", () => {
  it("`p1` açılınca beş filtre önerilen kümeye eşitleniyor", () => {
    const { calls, writer } = recorder();
    const messy = snapshot({
      audioPreferences: {
        ...snapshot().audioPreferences,
        autoGainControl: true,
        krispNoiseCancellation: false,
        noiseSuppression: false,
      },
    });

    applyAvSettingsPatch({ p1: true }, messy, writer);

    assert.equal(calls.length, 5);

    for (const [name, key, value] of calls) {
      assert.equal(name, "setAudioPreference");
      assert.equal(
        value,
        CLEAN_AUDIO_PROFILE_PRESET[key as keyof typeof CLEAN_AUDIO_PROFILE_PRESET],
      );
    }
  });

  it("`p1` kapatma isteği hiçbir filtre yazmıyor — kapanış filtreye dokunmakla olur", () => {
    const { calls, writer } = recorder();

    applyAvSettingsPatch({ p1: false }, snapshot(), writer);

    assert.deepEqual(calls, []);
  });

  it("her satır kendi cihaz alanına gidiyor", () => {
    const { calls, writer } = recorder();

    applyAvSettingsPatch(
      { e1: 2, e2: false, e3: 25, i5: 1, i6: 900, k3: true, p3: false, p7: 1 },
      snapshot(),
      writer,
    );

    assert.deepEqual(calls, [
      ["setScreenShareQuality", "h1440fps60", null],
      ["setScreenShareAudioEnabled", false, null],
      ["setScreenShareVolume", 25, null],
      ["setVoiceInputMode", "push-to-talk", null],
      // 900 ms store'un üst sınırına (750) kırpılır.
      ["setPushToTalkHangoverMs", 750, null],
      ["setCameraPreference", "backgroundBlur", true],
      ["setAudioPreference", "voiceIsolation", false],
      ["setAudioPreference", "enhancedNoiseFilterMode", "krisp_only"],
    ]);
  });

  it("F2 — dört cihaz tercihi persist store adapterine yazılıyor", () => {
    const { calls, writer } = recorder();

    applyAvSettingsPatch({ e4: false, e5: false, i4: true, u3: 80 }, snapshot(), writer);

    assert.deepEqual(calls, [
      ["setScreenShareExcludeSelfWindow", false, null],
      ["setScreenShareAllowSourceSwitch", false, null],
      ["setSelfMonitorEnabled", true, null],
      ["setMasterOutputVolume", 80, null],
    ]);
  });

  it("F2 — bilinmeyen anahtar sessizce yutulmuyor, düşüyor", () => {
    const { writer } = recorder();

    // Sessiz `break` kutuya "yazdım" derdi ve gösterge `Kaydedildi` çizerdi (tuzak #14).
    assert.throws(
      () => applyAvSettingsPatch({ zz9: true }, snapshot(), writer),
      /SETTINGS_WRITE_UNSUPPORTED:zz9/,
    );
  });
});

describe("Ses işleme durumu", () => {
  it("durum satırı gerçek filtre kararından türüyor", () => {
    assert.equal(resolveAudioProcessingStateKey(snapshot()), "settings.block.audio.state.layered");

    assert.equal(
      resolveAudioProcessingStateKey(
        snapshot({
          audioPreferences: {
            ...snapshot().audioPreferences,
            enhancedNoiseFilterMode: "krisp_only",
          },
        }),
      ),
      "settings.block.audio.state.krisp",
    );

    assert.equal(
      resolveAudioProcessingStateKey(
        snapshot({
          audioPreferences: {
            ...snapshot().audioPreferences,
            krispNoiseCancellation: false,
          },
        }),
      ),
      "settings.block.audio.state.browser",
    );

    assert.equal(
      resolveAudioProcessingStateKey(
        snapshot({
          audioPreferences: {
            ...snapshot().audioPreferences,
            krispNoiseCancellation: false,
            noiseSuppression: false,
            voiceIsolation: false,
          },
        }),
      ),
      "settings.block.audio.state.off",
    );
  });
});

describe("SPEC_DEVIATIONS #5 — ses işleme satırları kirli bayrağı kurmaz", () => {
  it("`p1`…`p9` profil alanı değil", () => {
    const audioTab = findSettingsTab("av", "audio");
    assert.ok(audioTab);

    const processingRows = audioTab.groups
      .flatMap((group) => group.rows)
      .map((row) => row.key)
      .filter((key) => /^p\d$/u.test(key));

    assert.deepEqual(processingRows, ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p9"]);

    for (const key of processingRows) {
      assert.equal(isDirtyProfileKey(key), false, `${key} kirli bayrağı kuruyor`);
    }

    // Kirli liste yalnız Hesabım › Profil alanlarını sayar.
    assert.deepEqual(
      [...SETTINGS_DIRTY_PROFILE_KEYS],
      ["pn", "pu", "pz", "pbio", "pp", "ps", "pe", "px"],
    );
  });
});

describe("K13 — üç tercih paneli silindi", () => {
  const deleted = [
    "components/voice/voice-preferences-panel.tsx",
    "components/voice/camera-preferences-panel.tsx",
    "components/voice/screen-share-preferences-panel.tsx",
  ];

  it("dosyalar yok", () => {
    for (const relative of deleted) {
      assert.equal(existsSync(join(srcRoot, relative)), false, relative);
    }
  });

  it("hiçbir yerden import edilmiyor", () => {
    const offenders: string[] = [];

    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);

        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }

        if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
        if (path === fileURLToPath(import.meta.url)) continue;

        const source = readFileSync(path, "utf8");

        for (const name of [
          "voice-preferences-panel",
          "camera-preferences-panel",
          "screen-share-preferences-panel",
        ]) {
          if (source.includes(`@/components/voice/${name}`)) {
            offenders.push(`${path} -> ${name}`);
          }
        }
      }
    };

    walk(srcRoot);

    assert.deepEqual(offenders, []);
  });
});
