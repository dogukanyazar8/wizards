"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface MessageEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

const MAX_MESSAGE_LENGTH = 2000;

export function MessageEditor({ initialContent, onSave, onCancel }: MessageEditorProps) {
  const { t } = useI18n();
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedContent = content.trim();
  const isDirty = content !== initialContent;
  const canSave = trimmedContent.length > 0 && isDirty && content.length <= MAX_MESSAGE_LENGTH;

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [content]);

  const save = () => {
    if (canSave) {
      onSave(trimmedContent);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div
      className="my-1.5 rounded-[1rem] border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--surface-soft)/0.42)] p-2.5 shadow-[0_12px_30px_hsl(var(--shadow-color)/0.07)]"
      data-testid="message-editor"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-app-soft">
          {t("chat.editor.title")}
        </p>
        <span
          className={cn(
            "text-[0.6875rem] font-semibold tabular-nums",
            content.length > MAX_MESSAGE_LENGTH * 0.9
              ? "text-[hsl(var(--warning))]"
              : "text-app-soft",
          )}
        >
          {content.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>

      <textarea
        aria-label={t("chat.editor.title")}
        className="message-font-scope min-h-[3.5rem] w-full resize-none rounded-[0.875rem] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.88)] px-3 py-2.5 text-sm leading-6 text-app-foreground outline-hidden transition placeholder:text-app-soft focus:border-[hsl(var(--primary)/0.52)] focus:ring-2 focus:ring-[hsl(var(--primary)/0.14)]"
        data-testid="message-editor-input"
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        ref={textareaRef}
        rows={2}
        value={content}
      />

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-xs font-medium text-app-muted">{t("chat.editor.hint")}</p>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <button
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.86)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
            data-testid="message-editor-cancel"
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
            {t("chat.editor.cancel")}
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border-0 bg-[hsl(var(--primary))] px-3.5 text-sm font-semibold text-white shadow-[0_8px_18px_-12px_hsl(var(--primary))] transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)] disabled:cursor-not-allowed disabled:bg-[hsl(var(--surface-card))] disabled:text-app-soft disabled:shadow-none"
            data-testid="message-editor-save"
            disabled={!canSave}
            onClick={save}
            type="button"
          >
            <Check className="h-4 w-4" />
            {t("chat.editor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
