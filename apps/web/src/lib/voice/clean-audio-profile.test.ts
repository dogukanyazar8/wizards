import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCleanAudioProfile,
  CLEAN_AUDIO_PROFILE_FILTERS,
  CLEAN_AUDIO_PROFILE_PRESET,
  isCleanAudioProfileActive,
  listCleanAudioProfileDrift,
} from "@/lib/voice/clean-audio-profile";

const RECOMMENDED = { ...CLEAN_AUDIO_PROFILE_PRESET };

describe("Temiz ses profili — tek ilişki tanımı", () => {
  it("beş filtreyi yönetir", () => {
    assert.equal(CLEAN_AUDIO_PROFILE_FILTERS.length, 5);
    assert.deepEqual([...CLEAN_AUDIO_PROFILE_FILTERS].sort(), [
      "autoGainControl",
      "echoCancellation",
      "krispNoiseCancellation",
      "noiseSuppression",
      "voiceIsolation",
    ]);
  });

  it("önerilen küme referansın açılış değerleri", () => {
    assert.deepEqual(CLEAN_AUDIO_PROFILE_PRESET, {
      autoGainControl: false,
      echoCancellation: true,
      krispNoiseCancellation: true,
      noiseSuppression: true,
      voiceIsolation: true,
    });
  });

  it("önerilen kümede profil açık", () => {
    assert.equal(isCleanAudioProfileActive(RECOMMENDED), true);
    assert.deepEqual(listCleanAudioProfileDrift(RECOMMENDED), []);
  });

  it("tek bir filtre değişince profil kendiliğinden kapanır", () => {
    for (const filter of CLEAN_AUDIO_PROFILE_FILTERS) {
      const drifted = { ...RECOMMENDED, [filter]: !RECOMMENDED[filter] };

      assert.equal(isCleanAudioProfileActive(drifted), false, `${filter} profili kapatmadı`);
      assert.deepEqual(listCleanAudioProfileDrift(drifted), [filter]);
    }
  });

  it("profil açılınca beş filtre önerilen kümeye eşitlenir", () => {
    const messy = {
      autoGainControl: true,
      echoCancellation: false,
      krispNoiseCancellation: false,
      noiseSuppression: false,
      voiceIsolation: false,
    };

    const applied = applyCleanAudioProfile(messy, true);

    assert.deepEqual(applied, RECOMMENDED);
    assert.equal(isCleanAudioProfileActive(applied), true);
    // Girdi kopyalanır, yerinde değiştirilmez.
    assert.equal(messy.echoCancellation, false);
  });

  it("profili kapatma isteği hiçbir filtreyi yazmaz", () => {
    const applied = applyCleanAudioProfile(RECOMMENDED, false);

    assert.deepEqual(applied, RECOMMENDED);
  });
});
