"use client";

import React, { useMemo } from "react";

import { useVoiceParticipants } from "@/components/providers/voice-context";
import { ChannelItem } from "@/components/shell/channel-item";

/**
 * Canlı ses etkinliğini **yalnız ihtiyacı olan satıra** bağlayan ara katman.
 *
 * `useVoiceParticipants` her ses seviyesi güncellemesinde (≈100 ms) yeniden render tetikler.
 * Bu kancayı `ChannelSidebar`'ın gövdesinde çağırmak, 2000 satırlık kabuğu ve **bütün** kanal
 * listesini saniyede on kez yeniden çizmek olurdu. Kanca bu yüzden burada, yalnız ses kanalı
 * satırının sardığı bileşende yaşıyor: metin kanalları abone değil.
 *
 * Kümeler **imzadan** üretiliyor. `participants` her tikte yeni bir dizi; ondan doğrudan
 * `new Set(...)` kurmak her tikte yeni bir referans demekti ve `React.memo` sarılı satırı
 * anlamsızlaştırırdı. İmza (sıralı kimlik listesi) yalnız gerçekten konuşan/susan değişince
 * değişir; küme de yalnız o zaman yeniden kurulur.
 */

export type VoiceActivitySets = {
  /** Yerel katılımcının anlık ses seviyesi (0–1); bağlı ses şeridinin göstergesi. */
  localLevel: number;
  mutedUserIds: ReadonlySet<string>;
  speakingUserIds: ReadonlySet<string>;
};

export function useVoiceActivitySets(): VoiceActivitySets {
  const { participants } = useVoiceParticipants();

  const speakingSignature = participants
    .filter((participant) => participant.isSpeaking)
    .map((participant) => participant.userId)
    .sort()
    .join(",");
  const mutedSignature = participants
    .filter((participant) => participant.isMuted || participant.isDeafened)
    .map((participant) => participant.userId)
    .sort()
    .join(",");
  const localLevel = participants.find((participant) => participant.isLocal)?.audioLevel ?? 0;

  const speakingUserIds = useMemo(
    () => new Set(speakingSignature === "" ? [] : speakingSignature.split(",")),
    [speakingSignature],
  );
  const mutedUserIds = useMemo(
    () => new Set(mutedSignature === "" ? [] : mutedSignature.split(",")),
    [mutedSignature],
  );

  return { localLevel, mutedUserIds, speakingUserIds };
}

type VoiceChannelItemProps = Omit<
  React.ComponentProps<typeof ChannelItem>,
  "mutedUserIds" | "speakingUserIds"
>;

/** Ses kanalı satırı — konuşma halkasını ve susturulmuş ikonunu canlı odadan alır. */
export function VoiceChannelItem(props: VoiceChannelItemProps) {
  const { mutedUserIds, speakingUserIds } = useVoiceActivitySets();

  return <ChannelItem {...props} mutedUserIds={mutedUserIds} speakingUserIds={speakingUserIds} />;
}
