"use client";

import { useCallback, useEffect } from "react";

import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import { selectRightPanelOpen, selectServerShellLayout } from "@/lib/servers/shell-layout";
import { useAppStore } from "@/lib/store";

export type RightPanelVisibility = {
  /** Panel şu anda ekranda mı? */
  readonly isOpen: boolean;
  /** `<rightPanelOverlayBelow`: panel akıştan çıkıp içeriğin üstüne biner (SPEC-SUNUCU §11). */
  readonly isOverlay: boolean;
  /** Açıklığı **doğru** bayrak üzerinden değiştirir; hangisi olduğunu çağıran bilmez. */
  readonly setOpen: (open: boolean) => void;
};

/**
 * Sağ panelin açıklığını okuyan/yazan tek yer — SPEC-SUNUCU §11.
 *
 * Panelin iki kipi var ve **iki ayrı açıklığı**:
 *
 * - Kolon kipinde açıklık kullanıcının kalıcı tercihidir (`memberPanelCollapsed`).
 * - Katman kipinde panel içeriğin üstüne bindiği için aynı tercihi uygulamak, 1280 px'lik bir
 *   pencerede besteciyi ve mesaj metnini kalıcı olarak örtüyordu. Katman kipi bu yüzden geçici
 *   ve varsayılanı kapalı olan `memberPanelOverlayOpen` bayrağını okur.
 *
 * Kancanın kendisi kipten çıkışta bayrağı sıfırlar: kullanıcı pencereyi daraltıp genişlettiğinde
 * panelin bir dahaki dar ekranda kendiliğinden açılmaması gerekir.
 *
 * Dört çağıran var (`chat-area`, `server-member-panel`, `voice-channel-view` ve arama düğmesi);
 * kural üç yerde tekrar edilseydi, birinde unutulan bir güncelleme paneli yine örtücü yapardı.
 */
export function useRightPanelVisibility(): RightPanelVisibility {
  const responsiveLayout = useResponsiveLayout();
  const collapsed = useAppStore((state) => state.memberPanelCollapsed);
  const overlayOpen = useAppStore((state) => state.memberPanelOverlayOpen);

  /*
   * Eşik `selectServerShellLayout`'tan okunuyor: ölçülemeyen genişlikte (SSR anlık görüntüsü,
   * `0`) **en geniş** kompozisyon seçilir. Ham bir `width < 1400` karşılaştırması ilk boyayı
   * yanlış kipte çizerdi.
   */
  const isOverlay = selectServerShellLayout(responsiveLayout.viewportWidth).rightPanelOverlay;

  useEffect(() => {
    if (!isOverlay && overlayOpen) {
      useAppStore.getState().setMemberPanelOverlayOpen(false);
    }
  }, [isOverlay, overlayOpen]);

  const setOpen = useCallback(
    (open: boolean) => {
      const store = useAppStore.getState();

      if (isOverlay) {
        store.setMemberPanelOverlayOpen(open);
        return;
      }

      store.setMemberPanelCollapsed(!open);
    },
    [isOverlay],
  );

  return {
    isOpen: selectRightPanelOpen({ collapsed, overlay: isOverlay, overlayOpen }),
    isOverlay,
    setOpen,
  };
}
