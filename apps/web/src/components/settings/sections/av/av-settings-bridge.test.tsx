import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyAvSettingsPatch,
  readAvSettingsValues,
  SCREEN_SHARE_4K_OPTION_INDEX,
  SCREEN_SHARE_FRAME_RATE_ROW_ORDER,
  SCREEN_SHARE_MODE_ROW_ORDER,
  SCREEN_SHARE_RESOLUTION_ROW_ORDER,
  type AvVoiceSnapshot,
  type AvVoiceWriter,
} from "@/components/settings/sections/av/av-settings-bridge";
import { SETTINGS_DIRTY_PROFILE_KEYS } from "@/lib/settings/metrics";
import { findSettingsTab } from "@/lib/settings/tree";
import { isDirtyProfileKey } from "@/lib/settings/use-setting-value";
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
      quality: "h1080",
      frameRate: 30,
    },
    pushToTalkHangoverMs: 200,
    masterOutputVolume: 78,
    screenShareAllowSourceSwitch: true,
    screenShareAudioEnabled: true,
    screenShareExcludeSelfWindow: true,
    screenShare4kAllowed: false,
    screenShareContentMode: "text",
    screenShareFrameRate: 60,
    screenShareResolution: "h1080",
    screenShareVolume: 60,
    voiceInputMode: "voice-activity",
    ...overrides,
  };
}

function recorder() {
  const calls: Array<[string, unknown, unknown]> = [];

  const writer: AvVoiceWriter = {
    setAudioPreferences: (value) => calls.push(["setAudioPreferences", value, null]),
    setAudioPreference: (key, value) => calls.push(["setAudioPreference", key, value]),
    setCameraPreference: (key, value) => calls.push(["setCameraPreference", key, value]),
    setPushToTalkHangoverMs: (value) => calls.push(["setPushToTalkHangoverMs", value, null]),
    setScreenShareAudioEnabled: (value) => calls.push(["setScreenShareAudioEnabled", value, null]),
    setScreenShareContentMode: (value) => calls.push(["setScreenShareContentMode", value, null]),
    setScreenShareFrameRate: (value) => calls.push(["setScreenShareFrameRate", value, null]),
    setScreenShareResolution: (value) => calls.push(["setScreenShareResolution", value, null]),
    setScreenShareVolume: (value) => calls.push(["setScreenShareVolume", value, null]),
    setMasterOutputVolume: (value) => calls.push(["setMasterOutputVolume", value, null]),
    setScreenShareAllowSourceSwitch: (value) =>
      calls.push(["setScreenShareAllowSourceSwitch", value, null]),
    setScreenShareExcludeSelfWindow: (value) =>
      calls.push(["setScreenShareExcludeSelfWindow", value, null]),
    setVoiceInputMode: (value) => calls.push(["setVoiceInputMode", value, null]),
  };

  return { calls, writer };
}

describe("AV köprüsü — okuma", () => {
  it("Krisp ve ses giriş değerlerini mevcut tercihlerden okur", () => {
    const values = readAvSettingsValues(snapshot());
    assert.equal(values.p7, 0);
    assert.equal(values.i5, 0);
    assert.equal(values.i6, 200);
    assert.equal(values.e1, 1);
    assert.equal(values.i4, undefined, "mikrofon önizlemesi kalıcı tercih değildir");
  });
});

describe("AV köprüsü — yazma", () => {
  it("cihaz seçimi de kayıt durumunu izleyen köprüden geçer", () => {
    const { calls, writer } = recorder();
    applyAvSettingsPatch({ i1: "mic", u1: "headphones" }, snapshot(), writer);
    assert.deepEqual(calls, [
      ["setAudioPreference", "inputDeviceId", "mic"],
      ["setAudioPreference", "outputDeviceId", "headphones"],
    ]);
  });
  it("gürültü seçimini tek güncellemede uygular; yankı ve kazancı değiştirmez", () => {
    const { calls, writer } = recorder();
    applyAvSettingsPatch({ p7: 0 }, snapshot(), writer);
    assert.deepEqual(calls, [
      [
        "setAudioPreferences",
        {
          krispNoiseCancellation: true,
          enhancedNoiseFilterMode: "krisp_only",
          noiseSuppression: true,
          voiceIsolation: true,
        },
        null,
      ],
    ]);
  });

  it("her satır kendi cihaz alanına gidiyor", () => {
    const { calls, writer } = recorder();

    applyAvSettingsPatch(
      { e1: 2, e2: false, e3: 25, i5: 1, i6: 900, k3: true, p4: false, p5: true },
      snapshot(),
      writer,
    );

    assert.deepEqual(calls, [
      ["setScreenShareResolution", "h1440", null],
      ["setScreenShareAudioEnabled", false, null],
      ["setScreenShareVolume", 25, null],
      ["setVoiceInputMode", "push-to-talk", null],
      // 900 ms store'un üst sınırına (750) kırpılır.
      ["setPushToTalkHangoverMs", 750, null],
      ["setCameraPreference", "backgroundBlur", true],
      ["setAudioPreference", "echoCancellation", false],
      ["setAudioPreference", "autoGainControl", true],
    ]);
  });

  it("F2 — dört cihaz tercihi persist store adapterine yazılıyor", () => {
    const { calls, writer } = recorder();

    applyAvSettingsPatch({ e4: false, e5: false, u3: 80 }, snapshot(), writer);

    assert.deepEqual(calls, [
      ["setScreenShareExcludeSelfWindow", false, null],
      ["setScreenShareAllowSourceSwitch", false, null],
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

/** Ekran paylaşımı Ş0.1 — K4 üç eksen (`e1` / `e8` / `e9`), K2 4K kapısı, K20 varsayılanları. */
describe("AV köprüsü — ekran paylaşımı eksenleri", () => {
  it("segment sırası ağaçtaki seçenek sırasıyla birebir", () => {
    const tab = findSettingsTab("av", "screen-share");
    assert.ok(tab);
    const rows = new Map(tab.groups.flatMap((group) => group.rows).map((row) => [row.key, row]));

    assert.deepEqual([...SCREEN_SHARE_RESOLUTION_ROW_ORDER], ["h720", "h1080", "h1440", "h2160"]);
    assert.equal(rows.get("e1")?.options?.length, SCREEN_SHARE_RESOLUTION_ROW_ORDER.length);
    assert.deepEqual([...SCREEN_SHARE_FRAME_RATE_ROW_ORDER], [15, 30, 60]);
    assert.equal(rows.get("e8")?.options?.length, SCREEN_SHARE_FRAME_RATE_ROW_ORDER.length);
    assert.deepEqual([...SCREEN_SHARE_MODE_ROW_ORDER], ["text", "motion"]);
    assert.equal(rows.get("e9")?.options?.length, SCREEN_SHARE_MODE_ROW_ORDER.length);

    // Ağaç varsayılanı store varsayılanıyla aynı: 1080p (dizin 1), 60 fps (dizin 2), text (0).
    assert.equal(rows.get("e1")?.defaultValue, 1);
    assert.equal(rows.get("e8")?.defaultValue, 2);
    assert.equal(rows.get("e9")?.defaultValue, 0);
    // K20 — `e2` kapalı, `e3` %100.
    assert.equal(rows.get("e2")?.defaultValue, false);
    assert.equal(rows.get("e3")?.defaultValue, 100);
    // K2 — 4K seçeneği kapı anahtarını taşır.
    assert.equal(SCREEN_SHARE_4K_OPTION_INDEX, 3);
    assert.deepEqual(rows.get("e1")?.optionGateKeys, { 3: "settings.option.e1.4.disabled" });
  });

  it("üç ekseni store'dan dizine çevirir", () => {
    const values = readAvSettingsValues(
      snapshot({ screenShareContentMode: "motion", screenShareFrameRate: 15 }),
    );

    assert.equal(values.e1, 1);
    assert.equal(values.e8, 0);
    assert.equal(values.e9, 1);
    assert.equal(readAvSettingsValues(snapshot({ screenShareResolution: "h2160" })).e1, 3);
  });

  it("her eksen kendi setter'ına gidiyor", () => {
    const { calls, writer } = recorder();

    applyAvSettingsPatch({ e1: 0, e8: 1, e9: 1 }, snapshot(), writer);

    assert.deepEqual(calls, [
      ["setScreenShareResolution", "h720", null],
      ["setScreenShareFrameRate", 30, null],
      ["setScreenShareContentMode", "motion", null],
    ]);
  });

  it("K2 — 4K yalnız probe izin verince yazılır; aksi halde yama düşer, sessizce kırpılmaz", () => {
    const { calls, writer } = recorder();

    assert.throws(
      () => applyAvSettingsPatch({ e1: 3 }, snapshot({ screenShare4kAllowed: false }), writer),
      /SETTINGS_WRITE_INVALID:e1/,
    );
    assert.deepEqual(calls, []);

    applyAvSettingsPatch({ e1: 3 }, snapshot({ screenShare4kAllowed: true }), writer);
    assert.deepEqual(calls, [["setScreenShareResolution", "h2160", null]]);
  });

  it("dizin dışı seçenek yazılmaz", () => {
    const { calls, writer } = recorder();

    for (const patch of [{ e1: 4 }, { e8: 3 }, { e9: 2 }, { e1: -1 }]) {
      assert.throws(
        () => applyAvSettingsPatch(patch, snapshot(), writer),
        /SETTINGS_WRITE_INVALID/,
      );
    }
    assert.deepEqual(calls, []);
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

    assert.deepEqual(processingRows, ["p7", "p4", "p5"]);

    for (const key of processingRows) {
      assert.equal(isDirtyProfileKey(key), false, `${key} kirli bayrağı kuruyor`);
    }

    // Kirli liste yalnız Hesabım › Profil alanlarını sayar.
    assert.deepEqual(
      [...SETTINGS_DIRTY_PROFILE_KEYS],
      ["pn", "pu", "pbio", "pp", "ps", "pe", "px"],
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
