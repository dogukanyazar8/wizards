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
      className="my-2 overflow-hidden rounded-[24px] border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--surface-card)/0.88)] shadow-[0_18px_42px_hsl(var(--shadow-color)/0.08)] backdrop-blur-xl"
      data-testid="message-editor"
    >
      <div className="border-b border-[hsl(var(--border)/0.5)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-soft">
          {t("chat.editor.title")}
        </p>
      </div>

      <div className="p-2.5">
        <textarea
          aria-label={t("chat.editor.title")}
          className="min-h-[92px] w-full resize-none rounded-[20px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.38)] px-3 py-3 text-sm leading-6 text-app-foreground outline-none transition placeholder:text-app-soft focus:border-[hsl(var(--primary)/0.48)] focus:bg-[hsl(var(--surface-card)/0.82)] focus:ring-2 focus:ring-[hsl(var(--primary)/0.16)]"
          data-testid="message-editor-input"
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          ref={textareaRef}
          rows={3}
          value={content}
        />

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-app-muted">
            {t("chat.editor.hint")}
          </p>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              content.length > MAX_MESSAGE_LENGTH * 0.9
                ? "text-[hsl(var(--warning))]"
                : "text-app-soft",
            )}
          >
            {content.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>

        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] px-4 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.34)] sm:min-h-10"
            data-testid="message-editor-cancel"
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
            {t("chat.editor.cancel")}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.16)] px-4 text-sm font-semibold text-[hsl(var(--success))] shadow-[0_14px_32px_hsl(var(--success)/0.14)] transition hover:bg-[hsl(var(--success)/0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--success)/0.34)] disabled:cursor-not-allowed disabled:border-[hsl(var(--border)/0.55)] disabled:bg-[hsl(var(--surface-soft)/0.42)] disabled:text-app-soft disabled:shadow-none sm:min-h-10"
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
