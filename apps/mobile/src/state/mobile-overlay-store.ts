import { create } from "zustand";

export type MobileOverlayId = "media-picker" | "screen-share-consent" | "voice-invite";

export type MobileOverlayState = {
  readonly activeOverlay: MobileOverlayId | null;
  closeOverlay(overlay?: MobileOverlayId): void;
  openOverlay(overlay: MobileOverlayId): void;
  reset(): void;
};

export const useMobileOverlayStore = create<MobileOverlayState>((set, get) => ({
  activeOverlay: null,
  closeOverlay: (overlay) => {
    if (overlay && get().activeOverlay !== overlay) {
      return;
    }

    set({ activeOverlay: null });
  },
  openOverlay: (activeOverlay) => set({ activeOverlay }),
  reset: () => set({ activeOverlay: null }),
}));
