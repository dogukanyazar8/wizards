"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalizeVoiceLayout, type VoiceLayout } from "./voice-layout";

type VoiceLayoutState = { layout: VoiceLayout; setLayout: (layout: VoiceLayout) => void };
export const useVoiceLayout = create<VoiceLayoutState>()(
  persist(
    (set) => ({
      layout: "fit",
      setLayout: (layout) => set({ layout: normalizeVoiceLayout(layout) }),
    }),
    {
      name: "whispr-voice-layout",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ layout: state.layout }),
      merge: (saved, current) => ({
        ...current,
        layout: normalizeVoiceLayout(
          saved && typeof saved === "object" && "layout" in saved ? saved.layout : null,
        ),
      }),
    },
  ),
);
