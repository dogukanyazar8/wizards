"use client";

import { useEffect } from "react";
import { applyMessageFontToDocument } from "@/lib/message-fonts";
import { useAppStore } from "@/lib/store";

export function MessageFontSync() {
  const messageFont = useAppStore((state) => state.messageFont);

  useEffect(() => {
    applyMessageFontToDocument(messageFont);
  }, [messageFont]);

  return null;
}
