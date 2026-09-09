"use client";

import { useEffect, useId, useRef } from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import {
  announceOverlayOpen,
  getOverlayOpenDetail,
  WHISPR_OVERLAY_OPEN_EVENT,
} from "@/lib/ui/overlay-coordinator";

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
  const overlayId = useId();
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    announceOverlayOpen("composer-picker", overlayId);

    const handleOverlayOpen = (event: Event) => {
      const detail = getOverlayOpenDetail(event);

      if (detail?.group === "composer-picker" && detail.id !== overlayId) {
        onClose();
      }
    };

    window.addEventListener(WHISPR_OVERLAY_OPEN_EVENT, handleOverlayOpen);
    return () => window.removeEventListener(WHISPR_OVERLAY_OPEN_EVENT, handleOverlayOpen);
  }, [onClose, overlayId]);

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
      className="app-emoji-picker fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[90] max-h-[min(64dvh,28rem)] overflow-hidden rounded-[1.5rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-overlay)/0.98)] p-2.5 shadow-[0_24px_62px_hsl(var(--shadow-color)/0.2)] backdrop-blur-2xl md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-3 md:max-h-none md:w-[min(23rem,calc(100vw-2rem))]"
      data-testid="emoji-picker"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] text-[var(--primary-readable)]">
            <Smile className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-app-foreground">{t("chat.emoji.title")}</p>
            <p className="truncate text-xs text-app-soft">{t("chat.emoji.hint")}</p>
          </div>
        </div>
        <WindowCloseButton
          aria-label={t("common.close")}
          onClick={onClose}
          testId="emoji-picker-close"
        />
      </div>
      <div className="max-h-[50dvh] overflow-hidden rounded-[1.25rem] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.86)] md:max-h-none">
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
