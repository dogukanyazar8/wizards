import { MESSAGE_CONTENT_DEFAULT_LIMIT } from "@wizards/types";
import { create } from "zustand";

export type MobileComposerDraftKey = `${"channel" | "dm"}:${string}`;

export type MobileComposerDraftState = {
  readonly drafts: Readonly<Record<string, string>>;
  clearDraft(key: MobileComposerDraftKey): void;
  getDraft(key: MobileComposerDraftKey): string;
  reset(): void;
  setDraft(key: MobileComposerDraftKey, value: string): void;
};

export const useMobileComposerDraftStore = create<MobileComposerDraftState>((set, get) => ({
  drafts: {},
  clearDraft: (key) =>
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[key];
      return { drafts };
    }),
  getDraft: (key) => get().drafts[key] ?? "",
  reset: () => set({ drafts: {} }),
  setDraft: (key, value) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [key]: value.slice(0, MESSAGE_CONTENT_DEFAULT_LIMIT),
      },
    })),
}));
