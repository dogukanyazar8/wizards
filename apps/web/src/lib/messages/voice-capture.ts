import {
  VOICE_MESSAGE_MAX_MS,
  VOICE_MESSAGE_WAVEFORM_BUCKETS,
  toVoiceWaveform,
} from "@wizards/types";

/**
 * Sesli mesaj kaydının **saf** katmanı — karar #5.
 *
 * DOM yok, `MediaRecorder` yok, zamanlayıcı yok. Bileşen bunları taşır; buradaki
 * işler ölçülebilir ve testte dondurulabilir olsun diye ayrıldı: bir kaydın
 * uzunluğunun doğru sayılıp sayılmadığı, mikrofon açmayı gerektirmeyen bir soru.
 */

/** `AnalyserNode` örneklemesi; 50ms'de bir bir örnek, saniyede 20 kova. */
export const VOICE_SAMPLE_INTERVAL_MS = 50;

/**
 * Kaydın kaç kova biriktireceği. Beş dakikalık tavanda 20/sn × 300sn = 6000
 * örnek; `toVoiceWaveform` bunu 64'e indiriyor.
 */
export const VOICE_MAX_SAMPLES = Math.ceil(VOICE_MESSAGE_MAX_MS / VOICE_SAMPLE_INTERVAL_MS);

export type VoiceCaptureGeneration = {
  acceptStream(generation: number, stream: MediaStream): boolean;
  begin(): number;
  cancel(generation: number): void;
  isCurrent(generation: number): boolean;
  mount(): void;
  unmount(): void;
};

/**
 * Monotonic ownership guard for asynchronous `getUserMedia` results.
 *
 * A late stream is not merely ignored: its tracks are stopped immediately.
 * Generation numbers never repeat, so an old recorder callback cannot acquire
 * ownership of a later session.
 */
export function createVoiceCaptureGeneration(): VoiceCaptureGeneration {
  let current = 0;
  let mounted = true;

  const isCurrent = (generation: number) => mounted && generation === current;

  return {
    acceptStream(generation, stream) {
      if (isCurrent(generation)) {
        return true;
      }

      stream.getTracks().forEach((track) => track.stop());
      return false;
    },
    begin() {
      current += 1;
      return current;
    },
    cancel(generation) {
      if (generation === current) {
        current += 1;
      }
    },
    isCurrent,
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      current += 1;
    },
  };
}

export type VoiceCaptureStreamRequest =
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly stream: MediaStream }
  | { readonly kind: "stale" };

/** Await `getUserMedia` without letting a late result reacquire ownership. */
export async function requestVoiceCaptureStream(
  lifecycle: VoiceCaptureGeneration,
  generation: number,
  getUserMedia: () => Promise<MediaStream>,
): Promise<VoiceCaptureStreamRequest> {
  try {
    const stream = await getUserMedia();
    return lifecycle.acceptStream(generation, stream)
      ? { kind: "ready", stream }
      : { kind: "stale" };
  } catch {
    return lifecycle.isCurrent(generation) ? { kind: "error" } : { kind: "stale" };
  }
}

/** Wraps browser-resource cleanup so every exit path may call it safely. */
export function createIdempotentVoiceCleanup(cleanup: () => void): () => void {
  let cleaned = false;

  return () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    cleanup();
  };
}

export type VoiceRecordingDraft<T> = {
  discard(): void;
  peek(): { readonly recording: T; readonly url: string } | null;
  send(publish: (recording: T) => void): boolean;
  stage(input: { readonly recording: T; readonly url: string }): void;
};

/**
 * Draft owns preview URL and publish boundary. Automatic/visibility stops call
 * only `stage`; `publish` is reachable solely through explicit `send`.
 */
export function createVoiceRecordingDraft<T>(
  revokeObjectUrl: (url: string) => void,
): VoiceRecordingDraft<T> {
  let current: { readonly recording: T; readonly url: string } | null = null;

  const discard = () => {
    if (!current) {
      return;
    }

    const { url } = current;
    current = null;
    revokeObjectUrl(url);
  };

  return {
    discard,
    peek: () => current,
    send(publish) {
      if (!current) {
        return false;
      }

      const { recording, url } = current;
      current = null;
      revokeObjectUrl(url);
      publish(recording);
      return true;
    },
    stage(input) {
      discard();
      current = input;
    },
  };
}

/**
 * `AnalyserNode.getByteTimeDomainData` çıktısından RMS.
 *
 * Bayt alanı 0–255 ve sessizlik **128**'dir, sıfır değil: örnekler merkezden
 * sapmadır. Sapmayı 128'e bölmek −1..1 aralığını verir; kareler ortalaması da
 * kulağın duyduğu şiddete karşılık gelen tek sayıdır.
 */
export function computeRms(timeDomain: Uint8Array | readonly number[]): number {
  const length = timeDomain.length;

  if (length === 0) {
    return 0;
  }

  let sumOfSquares = 0;

  for (let index = 0; index < length; index += 1) {
    const centered = ((timeDomain[index] ?? 128) - 128) / 128;
    sumOfSquares += centered * centered;
  }

  return Math.sqrt(sumOfSquares / length);
}

/** Kayıt tavanına ulaşıldı mı. */
export function hasReachedRecordingLimit(elapsedMs: number): boolean {
  return elapsedMs >= VOICE_MESSAGE_MAX_MS;
}

/**
 * Kayıt sırasında çizilen canlı dalga formu.
 *
 * Bitmiş kaydın 64 kovasından farklı: burada örnekler hâlâ birikiyor ve şerit
 * **sondan** doluyor. Az örnek varken 64 kovaya germek, iki saniyelik bir kaydı
 * ekranı dolduran bir duvar gibi gösterirdi; onun yerine son `buckets` örnek
 * alınır ve baştaki boşluk sıfırla dolar.
 */
export function toLiveWaveform(
  rmsSamples: readonly number[],
  buckets: number = VOICE_MESSAGE_WAVEFORM_BUCKETS,
): number[] {
  if (buckets <= 0) {
    return [];
  }

  if (rmsSamples.length >= buckets) {
    return toVoiceWaveform(rmsSamples.slice(-buckets), buckets);
  }

  const measured = toVoiceWaveform(rmsSamples, rmsSamples.length);

  return [...Array.from({ length: buckets - measured.length }, () => 0), ...measured];
}

/** Bitmiş kaydın saklanacak dalga formu. */
export function toStoredWaveform(rmsSamples: readonly number[]): number[] {
  return toVoiceWaveform(rmsSamples);
}

/**
 * Tarayıcının gerçekten kaydedebildiği ilk tip.
 *
 * Sıra rastgele değil: `audio/webm;codecs=opus` Chrome ve Firefox'ta, `audio/mp4`
 * Safari'de çalışır ve ikisi de `messageAttachmentUploader`'ın kabul ettiği
 * listede. Hiçbiri desteklenmiyorsa `null` döner ve çağıran kayıt düğmesini hiç
 * açmaz — desteklenmeyen bir tiple `MediaRecorder` kurmak, kaydın sonunda
 * yüklenemeyen bir dosya demek.
 */
export const VOICE_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export function selectRecorderMimeType(isSupported: (mimeType: string) => boolean): string | null {
  return VOICE_RECORDER_MIME_CANDIDATES.find((candidate) => isSupported(candidate)) ?? null;
}

/**
 * Kayıt dosyasının adı.
 *
 * `MediaRecorder` bir ad vermez ve yükleyici uzantıya bakıyor; `audio/mp4`
 * `.m4a`, geri kalanı `.webm`. Zaman damgası dosyaları birbirinden ayırmak için
 * değil — kimlik zaten sunucudan geliyor — indirme klasöründe okunabilir olsun
 * diye.
 */
export function buildVoiceMessageFilename(mimeType: string, at: Date): string {
  const extension = mimeType.startsWith("audio/mp4") ? "m4a" : "webm";
  const stamp = at.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");

  return `voice-${stamp}.${extension}`;
}
