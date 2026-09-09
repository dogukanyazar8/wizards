import { SERVER_METRICS } from "./metrics";

/**
 * SPEC-SUNUCU §5'in **saf** sunum kararları.
 *
 * K5: LiveKit kablolaması, katılımcı eşlemesi, cihaz seçimi ve abonelik mantığı `lib/voice/*`
 * altında ve **değişmiyor**. Bu modül yalnız o veriden ekrandaki cümleyi ve kolon sayısını
 * türetir; React yok, tarayıcı yok, bu yüzden doğrudan birim testlenebiliyor.
 */

/** §5.1 alt satırının üç biçimi. */
export type VoiceSubtitleKind = "camera" | "plain" | "screenShare";

export type VoiceSubtitleModel = {
  readonly kind: VoiceSubtitleKind;
  /** `camera` biçiminde kaç kameranın açık olduğu. */
  readonly cameraCount: number;
  /** `screenShare` biçiminde paylaşan kişinin adı. */
  readonly sharerName: string | null;
  readonly participantCount: number;
  /** Bağlı kalınan dakika; ölçülemiyorsa `null` ve süre yazılmaz. */
  readonly minutes: number | null;
};

/**
 * §5.1 — "Alt satır duruma göre" üç cümleden biri. Sıra **ekran paylaşımı > kamera > düz**:
 * biri ekranını paylaşırken kamera sayısını yazmak, odadaki en önemli olayı gizlerdi.
 */
export function selectVoiceSubtitle(input: {
  readonly cameraCount: number;
  readonly connectedAtMs: number | null;
  readonly nowMs: number;
  readonly participantCount: number;
  readonly sharerName: string | null;
}): VoiceSubtitleModel {
  const minutes =
    input.connectedAtMs === null || !Number.isFinite(input.connectedAtMs)
      ? null
      : Math.max(0, Math.floor((input.nowMs - input.connectedAtMs) / 60_000));

  const base = {
    cameraCount: input.cameraCount,
    minutes,
    participantCount: input.participantCount,
    sharerName: input.sharerName,
  } as const;

  if (input.sharerName) {
    return { ...base, kind: "screenShare" };
  }

  if (input.cameraCount > 0) {
    return { ...base, kind: "camera" };
  }

  return { ...base, kind: "plain" };
}

/**
 * §5.2 — konuşmuyorken kartın altındaki durum metni. Sıra bir **önem** sırası: hoparlörü kapalı
 * biri mikrofonunu da açsa kimseyi duymuyor demektir, o yüzden sağırlık önce gelir.
 */
export type VoiceTileStatus = "deafened" | "muted" | "listening" | "speaking";

export function selectVoiceTileStatus(participant: {
  readonly isDeafened: boolean;
  readonly isMuted: boolean;
  readonly isSpeaking: boolean;
}): VoiceTileStatus {
  if (participant.isSpeaking) {
    return "speaking";
  }

  if (participant.isDeafened) {
    return "deafened";
  }

  if (participant.isMuted) {
    return "muted";
  }

  return "listening";
}

/**
 * §5.2 — "kolon sayısı Tweaks'ten (2/3/4, varsayılan 3)".
 *
 * Ürün bir "Tweaks" yüzeyi taşımıyor; kolon sayısı katılımcı sayısından türer ve sözlüğün
 * verdiği aralığı **asla** aşmaz. Tek kişi tek kolon değil: kart `16/11` oranında ve tek
 * kolona yayılınca ekranın yarısını kaplayan bir dikdörtgen olurdu.
 */
export function selectVoiceGridColumns(participantCount: number): number {
  const { columnsMin, columnsDefault, columnsMax } = SERVER_METRICS.voiceGrid;

  if (!Number.isFinite(participantCount) || participantCount <= 0) {
    return columnsDefault;
  }

  if (participantCount <= columnsMin) {
    return columnsMin;
  }

  if (participantCount <= columnsDefault * columnsDefault) {
    return columnsDefault;
  }

  return columnsMax;
}

/**
 * §5.1 — gecikme çipinin dört çubuğundan kaçının yandığı. `latencyMs` `null` iken çip hiç
 * çizilmez (Ş4 TODO 1: odanın RTT'sini veren bir alan yok); sayı geldiğinde tek değişecek
 * yer burasıdır.
 */
export type VoiceLatencyTier = "good" | "fair" | "poor";

export function selectVoiceLatencyTier(latencyMs: number): VoiceLatencyTier {
  if (latencyMs <= 60) {
    return "good";
  }

  if (latencyMs <= 150) {
    return "fair";
  }

  return "poor";
}

/**
 * LiveKit'in `ConnectionQuality`si bir **sınıf**tır, milisaniye değil. Çipin sözcüğü ondan
 * gelir; sayısı gelmez. `unknown` iken çip hiç çizilmez — "bilinmiyor" bir kalite değil.
 */
export function selectVoiceLatencyTierFromQuality(
  quality: "excellent" | "good" | "lost" | "poor" | "unknown",
): VoiceLatencyTier | null {
  if (quality === "excellent") {
    return "good";
  }

  if (quality === "good") {
    return "fair";
  }

  if (quality === "poor" || quality === "lost") {
    return "poor";
  }

  return null;
}

export function selectVoiceLatencyBarsForTier(tier: VoiceLatencyTier): number {
  const total = SERVER_METRICS.voiceHeader.latencyBarHeights.length;

  return tier === "good" ? total : tier === "fair" ? total - 1 : 1;
}

export function selectVoiceLatencyBars(latencyMs: number): number {
  return selectVoiceLatencyBarsForTier(selectVoiceLatencyTier(latencyMs));
}

/**
 * §5.2 — konuşan katılımcıyı **öne** alır, kalan sırayı bozmaz.
 *
 * Kararlı sıralama şart: her ses seviyesi tikinde kartların yeniden dizilmesi, tıklamak
 * isteyen kullanıcının altından kartı çekerdi. Bu yüzden yalnız "sen" ve konuşanlar öne
 * çekilir, geri kalan geldiği sırada kalır.
 */
export function orderVoiceParticipants<
  T extends { readonly isLocal: boolean; readonly isSpeaking: boolean; readonly userId: string },
>(participants: readonly T[]): T[] {
  const rank = (participant: T) => (participant.isLocal ? 0 : participant.isSpeaking ? 1 : 2);

  return [...participants]
    .map((participant, index) => ({ index, participant }))
    .sort((left, right) => {
      const byRank = rank(left.participant) - rank(right.participant);

      return byRank === 0 ? left.index - right.index : byRank;
    })
    .map((entry) => entry.participant);
}
