"use client";

import type { NotificationSoundKey, SoundProfile } from "@wizards/types";

import { NOTIFICATION_SOUND_ROW_KEYS } from "@/components/settings/sections/notifications/notification-prefs-bridge";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §5. `Önizle` düğmesinin çaları.
 *
 * `Önizle` **gerçekten** çalar: seçili profili ve seçili seviyeyi duyurmayan bir düğme,
 * kullanıcıya "Whispr" ile "Klasik" arasındaki farkı sormadan seçtirirdi. Ses satırı kapalıyken
 * de çalar — kullanıcı ne seçtiğini duymalı — ve bunu ayrıca **açıklamaz**: kapalı bir satırın
 * önizlemesini bir uyarıyla karşılamak, düğmeyi bozukmuş gibi gösterirdi.
 *
 * **Aynı anda tek önizleme.** Yeni istek eskisini keser; iki ses üst üste binerse kullanıcı
 * ikisini de tanıyamaz. Kesme `pause()` + `currentTime = 0` ile yapılır, öğe atılarak değil:
 * atılan bir `Audio` çalmaya devam edebilir ve elimizde onu susturacak bir referans kalmaz.
 *
 * Çalar bir sınıf ve `Audio` fabrikası dışarıdan verilebiliyor: `jsdom` olmayan bir test
 * ortamında "yenisi eskisini kesiyor mu" sorusunu ancak sahte bir öğeyle sorabiliyoruz.
 */

/** Ş9 §5 — varlık eşlemesi. Çağrı sesinin iki dosyası bu şeritte eklendi. */
export const SOUND_ASSET_SOURCES: Readonly<
  Record<NotificationSoundKey, Readonly<Record<SoundProfile, string>>>
> = {
  notification: {
    classic: "/sounds/notification.mp3",
    whispr: "/sounds/notification-whispr.mp3",
  },
  call: {
    classic: "/sounds/call.mp3",
    whispr: "/sounds/call-whispr.mp3",
  },
  join: {
    classic: "/sounds/voice-join.mp3",
    whispr: "/sounds/voice-join-whispr.mp3",
  },
  leave: {
    classic: "/sounds/voice-leave.mp3",
    whispr: "/sounds/voice-leave-whispr.mp3",
  },
};

/** Satır anahtarından varlık yolu. Bilinmeyen satır `null` döner; uydurma bir dosya çalınmaz. */
export function resolveSoundSource(rowKey: string, profile: SoundProfile): string | null {
  const soundKey = NOTIFICATION_SOUND_ROW_KEYS[rowKey];

  if (!soundKey) return null;

  return SOUND_ASSET_SOURCES[soundKey][profile] ?? null;
}

export type PreviewAudioElement = {
  currentTime: number;
  pause: () => void;
  play: () => Promise<void> | void;
  volume: number;
};

export type PreviewAudioFactory = (source: string) => PreviewAudioElement;

/** Seviye satırda 0–100; `HTMLMediaElement.volume` 0–1 ister ve aralık dışını fırlatır. */
export function toMediaVolume(level: number): number {
  if (!Number.isFinite(level)) return 0;

  return Math.min(1, Math.max(0, level / 100));
}

export class SoundPreviewPlayer {
  private current: PreviewAudioElement | null = null;

  private currentSource: string | null = null;

  constructor(private readonly createAudio: PreviewAudioFactory) {}

  /** Çalınan varlığın yolu — test ve tanılama için; üretimde kimse okumuyor. */
  get playingSource(): string | null {
    return this.currentSource;
  }

  play(source: string, level: number): void {
    this.stop();

    const audio = this.createAudio(source);
    audio.volume = toMediaVolume(level);
    this.current = audio;
    this.currentSource = source;

    // Otomatik oynatma reddi bir hata değil, tarayıcının kararı: kullanıcı sayfayla henüz
    // etkileşmediyse söz reddedilir ve bunu bir istisnaya çevirmek sekmeyi kırardı.
    void Promise.resolve(audio.play()).catch(() => {});
  }

  stop(): void {
    if (!this.current) return;

    this.current.pause();
    this.current.currentTime = 0;
    this.current = null;
    this.currentSource = null;
  }
}

function createBrowserAudio(source: string): PreviewAudioElement {
  return new Audio(source);
}

/**
 * Pencere başına tek çalar.
 *
 * Modül seviyesinde duruyor çünkü teklik bir bileşenin ömrüne bağlı olamaz: kullanıcı `Sesler`
 * sekmesinden `Genel` sekmesine geçtiğinde bileşen sökülür, ses ise çalmaya devam ederdi.
 */
export const settingsSoundPreview = new SoundPreviewPlayer((source) =>
  typeof Audio === "undefined"
    ? { currentTime: 0, pause: () => {}, play: () => {}, volume: 0 }
    : createBrowserAudio(source),
);
