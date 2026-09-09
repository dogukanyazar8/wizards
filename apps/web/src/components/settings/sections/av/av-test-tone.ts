/**
 * `Test sesi çal` (`u2`) — çıkışın gerçekten çaldığını duyuran kısa ton.
 *
 * Bir varlık dosyası eklenmedi: 0,4 saniyelik bir sinüs için ağ üzerinden mp3 indirmek, testi
 * "ses dosyası yüklenebiliyor mu" testine çevirirdi. Ton `AudioContext` ile üretilir ve
 * mümkünse **seçili çıkış cihazına** yönlendirilir (`AudioContext.setSinkId`, Chromium 110+);
 * desteklemeyen tarayıcıda sistem varsayılanından çalar — sessiz kalmaktansa yanlış hoparlörden
 * çalması yeğ, çünkü kullanıcı sesi duyduğunda cihaz seçiminin yanlış olduğunu da anlar.
 */

export type TestTonePlayer = {
  close: () => Promise<void>;
  createGain: () => GainNode;
  createOscillator: () => OscillatorNode;
  currentTime: number;
  destination: AudioNode;
  setSinkId?: (sinkId: string) => Promise<void>;
};

export const TEST_TONE_FREQUENCY_HZ = 440;
export const TEST_TONE_DURATION_SECONDS = 0.4;
export const TEST_TONE_PEAK_GAIN = 0.12;

type AudioContextWithSink = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

function createDefaultContext(): TestTonePlayer | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  const context = new AudioContextCtor() as AudioContextWithSink;

  return {
    close: () => context.close(),
    createGain: () => context.createGain(),
    createOscillator: () => context.createOscillator(),
    get currentTime() {
      return context.currentTime;
    },
    destination: context.destination,
    ...(context.setSinkId ? { setSinkId: (sinkId: string) => context.setSinkId!(sinkId) } : {}),
  };
}

/**
 * Tonu çalar ve **her durumda** bağlamı kapatır.
 *
 * Kapatmayan bir `AudioContext` sekme kapanana kadar açık bir ses donanımı tutar; bu şeridin
 * kaynak kuralı mikrofonla sınırlı değil.
 */
export async function playTestTone(
  outputDeviceId: string,
  createContext: () => TestTonePlayer | null = createDefaultContext,
): Promise<boolean> {
  const context = createContext();

  if (!context) {
    return false;
  }

  try {
    if (context.setSinkId && outputDeviceId && outputDeviceId !== "default") {
      await context.setSinkId(outputDeviceId).catch(() => undefined);
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = TEST_TONE_FREQUENCY_HZ;
    gain.gain.value = TEST_TONE_PEAK_GAIN;

    oscillator.connect(gain);
    gain.connect(context.destination);

    const startedAt = context.currentTime;
    oscillator.start(startedAt);
    oscillator.stop(startedAt + TEST_TONE_DURATION_SECONDS);

    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve();
    });

    return true;
  } finally {
    await context.close().catch(() => undefined);
  }
}
