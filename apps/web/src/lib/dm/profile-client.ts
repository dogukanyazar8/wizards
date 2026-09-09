"use client";

import {
  BADGE_QUERY_STALE_TIME_MS,
  UserProfilePanelDTOSchema,
  type UserProfilePanelDTO,
} from "@wizards/types";
import { DMClientError } from "@/lib/dm/client";

/**
 * SPEC §15 profil panelinin istemci köprüsü.
 *
 * Ayrı dosya, `client.ts`'in içi değil: bu turda üç şerit birden DM istemcisine
 * ekleme yapıyor ve paralel koşuda tek dosya çakışırdı. Sorgu anahtarı yine de
 * `["dm", …]` kökünün altında duruyor — `dmQueryKeys.root` ile yapılan toplu
 * geçersizleştirme paneli de kapsasın diye.
 */
export const dmProfileQueryKeys = {
  profile: (conversationId: string) => ["dm", "profile", conversationId] as const,
};

/**
 * Panelin en yavaş bölümü rozet ızgarası ve rozetler dakikalık bir olgu değil;
 * tazelik penceresi rozet sorgularının kendi penceresiyle **aynı** tutuldu, yoksa
 * aynı rozet iki yüzeyde iki farklı anda tazelenirdi.
 */
export const DM_PROFILE_PANEL_STALE_TIME_MS = BADGE_QUERY_STALE_TIME_MS;

export function dmProfilePanelPath(conversationId: string): string {
  return `/api/v1/dm/${encodeURIComponent(conversationId)}/profile`;
}

export async function fetchDmProfilePanel(
  conversationId: string,
  init: RequestInit = {},
): Promise<UserProfilePanelDTO> {
  const response = await fetch(dmProfilePanelPath(conversationId), init);
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new DMClientError(payload?.error ?? "Request failed", response.status, payload?.code);
  }

  return UserProfilePanelDTOSchema.parse(payload);
}

/**
 * React Query seçeneği olarak hazır demet. Sorgu **tembel**: `enabled` panelin
 * açık olduğu ana bağlanır (Ş5 bağlayacak), yoksa her sohbet açılışında
 * çizilmeyen bir panelin verisi çekilirdi.
 */
export function dmProfilePanelQueryOptions(conversationId: string, enabled: boolean) {
  return {
    enabled: enabled && conversationId.length > 0,
    queryFn: () => fetchDmProfilePanel(conversationId),
    queryKey: dmProfileQueryKeys.profile(conversationId),
    staleTime: DM_PROFILE_PANEL_STALE_TIME_MS,
  };
}
