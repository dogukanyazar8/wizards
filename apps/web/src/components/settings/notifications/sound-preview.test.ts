import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NOTIFICATION_SOUND_KEYS } from "@wizards/types";

import {
  SOUND_ASSET_SOURCES,
  SoundPreviewPlayer,
  resolveSoundSource,
  toMediaVolume,
  type PreviewAudioElement,
} from "./sound-preview";

/**
 * Ş9 §5 — `Önizle`.
 *
 * Dört satırın dördü de çalmalı, aynı anda yalnız biri çalmalı ve varlıklar **gerçekten**
 * durmalı: eksik bir dosya tarayıcıda sessiz bir hata olur ve kullanıcı düğmeyi bozuk sanır.
 */

type FakeAudio = PreviewAudioElement & {
  readonly source: string;
  paused: boolean;
  plays: number;
  resets: number;
};

function createRecorder() {
  const created: FakeAudio[] = [];

  const player = new SoundPreviewPlayer((source) => {
    const audio: FakeAudio = {
      currentTime: 12,
      pause: () => {
        audio.paused = true;
      },
      paused: false,
      play: () => {
        audio.plays += 1;
      },
      plays: 0,
      resets: 0,
      source,
      volume: 0,
    };

    created.push(audio);

    return audio;
  });

  return { created, player };
}

describe("ses önizlemesi — varlık eşlemesi", () => {
  it("dört satırın iki profili de bir dosyaya bağlanıyor", () => {
    assert.deepEqual(Object.keys(SOUND_ASSET_SOURCES).sort(), [...NOTIFICATION_SOUND_KEYS].sort());

    for (const key of NOTIFICATION_SOUND_KEYS) {
      assert.match(SOUND_ASSET_SOURCES[key].whispr, /^\/sounds\/.+-whispr\.mp3$/u);
      assert.match(SOUND_ASSET_SOURCES[key].classic, /^\/sounds\/.+\.mp3$/u);
    }
  });

  it("sekiz varlığın sekizi de `public/sounds` altında duruyor", () => {
    for (const key of NOTIFICATION_SOUND_KEYS) {
      for (const profile of ["classic", "whispr"] as const) {
        const relative = SOUND_ASSET_SOURCES[key][profile].replace(/^\//u, "");
        const path = fileURLToPath(new URL(`../../../../public/${relative}`, import.meta.url));

        assert.ok(existsSync(path), `${relative} yok`);
      }
    }
  });

  it("çağrı sesinin iki dosyası bu şeritte eklendi", () => {
    assert.equal(SOUND_ASSET_SOURCES.call.classic, "/sounds/call.mp3");
    assert.equal(SOUND_ASSET_SOURCES.call.whispr, "/sounds/call-whispr.mp3");
  });

  it("satır anahtarından yol çözülüyor; bilinmeyen satır `null`", () => {
    assert.equal(resolveSoundSource("ns2", "whispr"), "/sounds/call-whispr.mp3");
    assert.equal(resolveSoundSource("ns4", "classic"), "/sounds/voice-leave.mp3");
    assert.equal(resolveSoundSource("np4", "whispr"), null);
  });
});

describe("ses önizlemesi — seviye", () => {
  it("0–100 aralığı 0–1'e iniyor", () => {
    assert.equal(toMediaVolume(0), 0);
    assert.equal(toMediaVolume(60), 0.6);
    assert.equal(toMediaVolume(100), 1);
  });

  it("aralık dışı değer kırpılıyor — `HTMLMediaElement` fırlatmamalı", () => {
    assert.equal(toMediaVolume(-20), 0);
    assert.equal(toMediaVolume(400), 1);
    assert.equal(toMediaVolume(Number.NaN), 0);
  });
});

describe("ses önizlemesi — aynı anda tek çalma", () => {
  it("seçili profili ve seviyeyi çalıyor", () => {
    const { created, player } = createRecorder();

    player.play("/sounds/call-whispr.mp3", 40);

    assert.equal(created.length, 1);
    assert.equal(created[0]?.source, "/sounds/call-whispr.mp3");
    assert.equal(created[0]?.volume, 0.4);
    assert.equal(created[0]?.plays, 1);
    assert.equal(player.playingSource, "/sounds/call-whispr.mp3");
  });

  it("yeni önizleme eskisini kesiyor ve başa sarıyor", () => {
    const { created, player } = createRecorder();

    player.play("/sounds/notification.mp3", 100);
    player.play("/sounds/call.mp3", 50);

    assert.equal(created.length, 2);
    assert.equal(created[0]?.paused, true);
    assert.equal(created[0]?.currentTime, 0);
    assert.equal(created[1]?.paused, false);
    assert.equal(player.playingSource, "/sounds/call.mp3");
  });

  it("`stop` çalanı susturuyor", () => {
    const { created, player } = createRecorder();

    player.play("/sounds/voice-join.mp3", 30);
    player.stop();

    assert.equal(created[0]?.paused, true);
    assert.equal(player.playingSource, null);
  });

  it("otomatik oynatma reddi sekmeyi kırmıyor", () => {
    const player = new SoundPreviewPlayer(() => ({
      currentTime: 0,
      pause: () => {},
      play: () => Promise.reject(new Error("NotAllowedError")),
      volume: 0,
    }));

    assert.doesNotThrow(() => player.play("/sounds/call.mp3", 60));
  });
});
