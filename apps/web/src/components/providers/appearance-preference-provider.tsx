"use client";

import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";

type MediaPreferences = Pick<
  UserLayoutSettings,
  "inlineAttachmentMedia" | "linkPreviews" | "renderEmbeds" | "renderReactions" | "reduceMotion"
>;
const DEFAULT_MEDIA: MediaPreferences = {
  inlineAttachmentMedia: true,
  linkPreviews: true,
  renderEmbeds: true,
  renderReactions: true,
  reduceMotion: false,
};
const AppearancePreferenceContext = createContext(DEFAULT_MEDIA);

export function AppearancePreferenceProvider({
  preferences,
  children,
}: {
  preferences?: Partial<MediaPreferences> | null;
  children: ReactNode;
}) {
  const {
    inlineAttachmentMedia = true,
    linkPreviews = true,
    renderEmbeds = true,
    renderReactions = true,
    reduceMotion = false,
  } = preferences ?? {};
  const value = useMemo(
    () => ({
      inlineAttachmentMedia,
      linkPreviews,
      renderEmbeds,
      renderReactions,
      reduceMotion,
    }),
    [inlineAttachmentMedia, linkPreviews, renderEmbeds, renderReactions, reduceMotion],
  );
  return (
    <AppearancePreferenceContext.Provider value={value}>
      {children}
    </AppearancePreferenceContext.Provider>
  );
}

export function useAppearancePreferences() {
  return useContext(AppearancePreferenceContext);
}
