"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Smile, X } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";

const Picker = dynamic(
  () =>
    Promise.all([import("@emoji-mart/react"), import("@emoji-mart/data")]).then(
      ([mod, dataModule]) => ({
        default: (props: Record<string, unknown>) => (
          <mod.default {...props} data={dataModule.default} />
        ),
      }),
    ),
  {
    ssr: false,
    loading: () => <div className="bg-app-surface rounded p-2 text-sm text-app-muted">...</div>,
  },
);

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

type EmojiSelection = {
  native: string;
};

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { t } = useI18n();
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={pickerRef}
      className="app-emoji-picker fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[90] max-h-[70dvh] overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--surface-overlay)/0.98)] p-3 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.24)] backdrop-blur-2xl md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-3 md:max-h-none md:w-[min(23rem,calc(100vw-2rem))]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
            <Smile className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-app-foreground">{t("chat.emoji.title")}</p>
            <p className="truncate text-xs text-app-soft">{t("chat.emoji.hint")}</p>
          </div>
        </div>
        <button
          aria-label={t("common.close")}
          className="rounded-full border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.55)] p-2 text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[56dvh] overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.86)] md:max-h-none">
        <Picker
          dynamicWidth
          onEmojiSelect={(emoji: EmojiSelection) => onSelect(emoji.native)}
          theme="auto"
          previewPosition="none"
          searchPosition="sticky"
          {...{
            navPosition: "bottom",
            placeholder: t("chat.input.openEmojiPicker"),
          }}
        />
      </div>
    </div>
  );
}
