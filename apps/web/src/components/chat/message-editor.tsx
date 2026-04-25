"use client";

import { useEffect, useRef } from "react";

interface MessageEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function MessageEditor({ initialContent, onSave, onCancel }: MessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSave(textareaRef.current?.value || "");
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <textarea
      ref={textareaRef}
      defaultValue={initialContent}
      onKeyDown={handleKeyDown}
      onBlur={onCancel}
      className="w-full p-2 bg-app-surface rounded border border-app-border text-app-foreground resize-none"
      rows={3}
    />
  );
}
