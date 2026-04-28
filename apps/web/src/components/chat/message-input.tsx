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
    <div className="space-y-2 border-t border-app-border bg-[hsl(var(--surface-card)/0.62)] p-4 backdrop-blur-sm">
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "dm" ? t("dm.input.placeholder") : t("chat.input.placeholder")
            }
            className="w-full max-h-24 resize-none rounded-[22px] border border-app-border bg-[hsl(var(--surface-card)/0.82)] p-3 text-app-foreground placeholder-app-muted shadow-[0_14px_32px_hsl(var(--shadow-color)/0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            rows={1}
          />

          <button
            onClick={() => setShowEmojiPicker((current) => !current)}
            className="absolute bottom-3 right-3 rounded-full p-1 text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            aria-label={t("chat.input.openEmojiPicker")}
            type="button"
          >
            <Smile className="h-4 w-4" />
          </button>

          {showEmojiPicker ? (
            <EmojiPicker
              onSelect={(emoji) => {
                setContent((current) => current + emoji);
                setShowEmojiPicker(false);
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          ) : null}

          {content.length > 1800 ? (
            <div className="mt-1 text-xs text-app-danger">{content.length}/2000</div>
          ) : null}
        </div>

        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className="app-button-primary rounded p-3 transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          aria-label={t("chat.input.sendMessage")}
          type="button"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
