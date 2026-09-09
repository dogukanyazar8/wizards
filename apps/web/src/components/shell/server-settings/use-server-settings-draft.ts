"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import type { ServerIconTone, WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";

import { serverProfileQueryKeys } from "@/lib/servers/client";
import {
  applyServerVisibilityPatch,
  diffServerSettings,
  stripAdminOwnedFields,
} from "@/lib/servers/server-settings-model";
import { isServerAbbreviation } from "@/lib/servers/server-icon-presentation";
import { updateServerRequest, workspaceQueryKeys } from "@/lib/workspace/client";

/**
 * SPEC-SUNUCU §8'in başlık çubuğunda `Kaydet` düğmesi **yok**; sağda yalnız success noktalı
 * `Değişiklikler kaydedildi` göstergesi var. Yani bölümler kendiliğinden kaydeder.
 *
 * İki farklı kaydetme ritmi var ve ikisi de zorunlu:
 *
 * - **Anlık** — anahtar, çip, swatch. Kullanıcı tek bir karar verdi ve sonucu görmek istiyor.
 * - **Gecikmeli** — ad, kısaltma, açıklama. Her tuş vuruşunda `PATCH` atmak `authorizationRevision`'ı
 *   şişirir ve Ş1'in izin önbelleğini her harfte düşürürdü. `blur` gecikmeyi **boşa çıkarır**:
 *   alandan çıkan kullanıcı beklemez.
 *
 * Gösterge sahte değil: `saving` gerçekten uçan bir isteği, `saved` gerçekten dönen bir yanıtı,
 * `error` gerçekten başarısız bir yazmayı gösterir. Sabit süreli bir "kaydedildi" animasyonu
 * kaydedilmemiş bir alan için de yeşil yanardı.
 */

const AUTOSAVE_DEBOUNCE_MS = 700;
/** Yanıt döndükten sonra göstergenin ekranda kaldığı süre; sonra sessizleşir. */
const SAVED_INDICATOR_MS = 2400;

export type ServerSettingsDraft = {
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
  deletedMessageNoticeMinutes: number;
  description: string;
  discoverable: boolean;
  iconColor: ServerIconTone | null;
  iconUrl: string | null;
  isPublic: boolean;
  messageCharacterLimit: number;
  name: string;
  shortName: string;
  slowModeDelay: number;
  tags: string[];
};

export type ServerSettingsSaveState = "error" | "idle" | "saved" | "saving";

export type ServerSettingsDraftApi = {
  draft: ServerSettingsDraft;
  /** Alandan çıkıldığında bekleyen yazmayı hemen gönderir. */
  flush: () => void;
  /** Anahtar · çip · swatch: hemen yazar. */
  patch: (fields: Partial<ServerSettingsDraft>) => void;
  /** Metin alanları: `AUTOSAVE_DEBOUNCE_MS` sonra ya da `flush()` ile yazar. */
  patchDeferred: (fields: Partial<ServerSettingsDraft>) => void;
  saveState: ServerSettingsSaveState;
};

function toDraft(detail: WorkspaceServerDetail): ServerSettingsDraft {
  return {
    allowFileUploads: detail.server.allowFileUploads,
    allowGifs: detail.server.allowGifs,
    allowMemberAdds: detail.server.allowMemberAdds,
    deletedMessageNoticeMinutes: detail.server.deletedMessageNoticeMinutes,
    description: detail.server.description ?? "",
    discoverable: detail.server.discoverable,
    iconColor: detail.server.iconColor,
    iconUrl: detail.server.iconUrl,
    isPublic: detail.server.isPublic,
    messageCharacterLimit: detail.server.messageCharacterLimit,
    name: detail.server.name,
    shortName: detail.server.shortName ?? "",
    slowModeDelay: detail.server.slowModeDelay,
    tags: [...detail.server.tags],
  };
}

/**
 * `PATCH` gövdesi. `description`/`shortName` boş dizgeden `null`'a çevrilir — sözleşme
 * (`optionalTrimmedString`) boş dizgeyi zaten `null`'a indiriyor, ama karşılaştırmanın
 * **iki tarafı** aynı biçimde olmasa "boş açıklama" her turda değişmiş sayılırdı.
 */
function toRequestBody(patch: Partial<ServerSettingsDraft>) {
  const body: Record<string, unknown> = { ...patch };

  if ("description" in patch) {
    body.description = patch.description?.trim() ? patch.description : null;
  }

  if ("shortName" in patch) {
    body.shortName = patch.shortName?.trim().toLocaleUpperCase("tr-TR");
  }

  return body;
}

export function useServerSettingsDraft(detail: WorkspaceServerDetail): ServerSettingsDraftApi {
  const queryClient = useQueryClient();
  const router = useRouter();
  const serverId = detail.server.id;
  const serverType = detail.server.type;

  const saved = useMemo(() => toDraft(detail), [detail]);
  const [draft, setDraft] = useState<ServerSettingsDraft>(saved);
  const [saveState, setSaveState] = useState<ServerSettingsSaveState>("idle");

  const savedRef = useRef(saved);
  const pendingRef = useRef<Partial<ServerSettingsDraft>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Taslak yalnız **ilk** kurulumda `detail`'den okunur; sonraki yanıtlar onu ezmez. Kullanıcı
   * yanıt uçarken yazmaya devam etmiş olabilir ve sunucunun onayladığı değeri geri yazmak
   * imleci ve son harfleri düşürürdü.
   *
   * Sunucu değişince taslağın sıfırlanmasını **kabuk** üstlenir: `ServerSettingsOverlay`
   * içeriği `key={detail.server.id}` ile çiziyor, yani başka bir sunucu bu ağacı yeniden
   * mount ediyor. Aynı işi bir de burada bir efektle yapmak, aynı sıfırlamanın iki sahibi
   * demekti.
   */
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (indicatorRef.current) {
        clearTimeout(indicatorRef.current);
      }
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: async (patch: Partial<ServerSettingsDraft>) => {
      return updateServerRequest(serverId, toRequestBody(patch));
    },
    onError: () => {
      setSaveState("error");
    },
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: (result) => {
      const updated = result?.detail;

      if (updated) {
        queryClient.setQueryData<WorkspaceServerDetail>(
          workspaceQueryKeys.server(serverId),
          updated,
        );
        queryClient.setQueryData<WorkspaceServerSummary[] | undefined>(
          workspaceQueryKeys.servers,
          (current) =>
            current?.map((server) =>
              server.id === serverId ? { ...server, ...summaryFields(updated) } : server,
            ),
        );
      }

      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: serverProfileQueryKeys.profile(serverId) });
      router.refresh();

      setSaveState("saved");

      if (indicatorRef.current) {
        clearTimeout(indicatorRef.current);
      }

      indicatorRef.current = setTimeout(() => setSaveState("idle"), SAVED_INDICATOR_MS);
    },
  });

  const { mutate } = mutation;

  const send = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const pending = pendingRef.current;
    pendingRef.current = {};

    const changed = diffServerSettings(
      savedRef.current as unknown as Record<string, unknown>,
      { ...savedRef.current, ...pending } as unknown as Record<string, unknown>,
    ) as Partial<ServerSettingsDraft>;

    const body = stripAdminOwnedFields(
      changed as Record<string, unknown>,
      serverType,
    ) as Partial<ServerSettingsDraft>;

    if (typeof body.shortName === "string" && !isServerAbbreviation(body.shortName)) {
      delete body.shortName;
    }

    if (Object.keys(body).length === 0) {
      return;
    }

    mutate(body);
  }, [mutate, serverType]);

  const stage = useCallback((fields: Partial<ServerSettingsDraft>) => {
    /**
     * 00 §6'nın kapısı **tek** yerde: taslak da gövde de aynı çıktıdan kurulur. Ayrı
     * hesaplansaydı `Herkese açık` kapandığında ekranda sönen `Keşfet'te listele`
     * veritabanında açık kalırdı.
     */
    let next = fields;

    if ("discoverable" in fields || "isPublic" in fields) {
      const base = { ...savedRef.current, ...pendingRef.current };
      next = { ...fields, ...applyServerVisibilityPatch(base, fields) };
    }

    pendingRef.current = { ...pendingRef.current, ...next };
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  const patch = useCallback(
    (fields: Partial<ServerSettingsDraft>) => {
      stage(fields);
      send();
    },
    [send, stage],
  );

  const patchDeferred = useCallback(
    (fields: Partial<ServerSettingsDraft>) => {
      stage(fields);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(send, AUTOSAVE_DEBOUNCE_MS);
    },
    [send, stage],
  );

  const flush = useCallback(() => {
    if (Object.keys(pendingRef.current).length === 0) {
      return;
    }

    send();
  }, [send]);

  return { draft, flush, patch, patchDeferred, saveState };
}

function summaryFields(detail: WorkspaceServerDetail): Partial<WorkspaceServerSummary> {
  return {
    allowFileUploads: detail.server.allowFileUploads,
    allowGifs: detail.server.allowGifs,
    allowMemberAdds: detail.server.allowMemberAdds,
    deletedMessageNoticeMinutes: detail.server.deletedMessageNoticeMinutes,
    iconColor: detail.server.iconColor,
    iconUrl: detail.server.iconUrl,
    messageCharacterLimit: detail.server.messageCharacterLimit,
    name: detail.server.name,
    shortName: detail.server.shortName,
    slowModeDelay: detail.server.slowModeDelay,
  };
}
