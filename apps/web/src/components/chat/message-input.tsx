"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Smile } from "lucide-react";
import { EmojiPicker } from "./emoji-picker";
import { ReplyPreview } from "./reply-preview";
import { useI18n } from "@/components/providers/locale-provider";
import { useTyping } from "@/hooks/use-typing";
import type { MessageMode } from "@/hooks/use-messages";

interface MessageInputProps {
  conversationId: string;
  mode: MessageMode;
  replyTo: { id: string; authorName: string; content: string } | null;
  onSend: (content: string, replyToId?: string) => void;
  onCancelReply: () => void;
}

export function MessageInput({
  conversationId,
  mode,
  replyTo,
  onSend,
  onCancelReply,
}: MessageInputProps) {
  const { t } = useI18n();
  const { startTyping, stopTyping } = useTyping(conversationId, mode);
  const [content, setContent] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(event.target.value);

    if (!typingTimeoutRef.current) {
      startTyping();
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        96,
      )}px`;
    }
  };

  const handleSend = () => {
    if (!content.trim()) {
      return;
    }

    if (replyTo?.id) {
      onSend(content, replyTo.id);
    } else {
      onSend(content);
    }

    setContent("");
    setShowEmojiPicker(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = undefined;
    stopTyping();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(typingTimeoutRef.current);
      stopTyping();
    };
  }, [stopTyping]);

  return (
    <div className="space-y-3 border-t border-app-border bg-[hsl(var(--surface-card)/0.62)] p-4 backdrop-blur-sm md:p-5">
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div className="app-panel rounded-[30px] border p-3 shadow-[0_20px_44px_hsl(var(--shadow-color)/0.08)]">
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "dm" ? t("dm.input.placeholder") : t("chat.input.placeholder")
              }
              className="min-h-[3.25rem] w-full max-h-24 resize-none rounded-[24px] bg-transparent px-2 py-2 pr-4 text-[15px] text-app-foreground placeholder-app-muted focus-visible:outline-none"
              rows={1}
            />

            {showEmojiPicker ? (
              <EmojiPicker
                onSelect={(emoji) => {
                  setContent((current) => current + emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            ) : null}

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-[hsl(var(--border)/0.6)] px-2 pt-3">
              <button
                onClick={() => setShowEmojiPicker((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] px-3 py-1.5 text-xs font-medium text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                aria-label={t("chat.input.openEmojiPicker")}
                type="button"
              >
                <Smile className="h-4 w-4" />
                <span className="hidden sm:inline">{t("chat.input.openEmojiPicker")}</span>
              </button>

              <span
                className={`text-xs font-medium ${
                  content.length > 1800 ? "text-app-danger" : "text-app-soft"
                }`}
              >
                {content.length}/2000
              </span>
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={!content.trim()}
            className="inline-flex h-12 min-w-[3.25rem] items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/0.82))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_34px_hsl(var(--shadow-color)/0.16)] transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            aria-label={t("chat.input.sendMessage")}
            type="button"
          >
            <span className="hidden sm:inline">{t("chat.input.sendMessage")}</span>
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
