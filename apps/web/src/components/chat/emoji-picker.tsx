"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";

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
    loading: () => <div className="bg-app-surface rounded p-2 text-sm text-app-muted">Loading...</div>,
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
    <div ref={pickerRef} className="absolute bottom-full right-0 mb-2 z-50">
      <Picker
        onEmojiSelect={(emoji: EmojiSelection) => onSelect(emoji.native)}
        theme="dark"
        previewPosition="none"
      />
    </div>
  );
}
