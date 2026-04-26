"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Smile } from "lucide-react";
import { EmojiPicker } from "./emoji-picker";
import { ReplyPreview } from "./reply-preview";
import { useTyping } from "@/hooks/use-typing";

interface MessageInputProps {
  channelId: string;
  replyTo: { id: string; authorName: string; content: string } | null;
  onSend: (content: string, replyToId?: string) => void;
  onCancelReply: () => void;
}

export function MessageInput({
  channelId,
  replyTo,
  onSend,
  onCancelReply,
}: MessageInputProps) {
  const { startTyping, stopTyping } = useTyping(channelId);
  const [content, setContent] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Typing indicator
    if (!typingTimeoutRef.current) {
      startTyping();
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 96) + "px";
    }
  };

  const handleSend = () => {
    if (content.trim()) {
      if (replyTo?.id) {
        onSend(content, replyTo.id);
      } else {
        onSend(content);
      }
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      clearTimeout(typingTimeoutRef.current);
      stopTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return (
    <div className="border-t border-app-border p-4 space-y-2">
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            className="w-full p-3 bg-app-surface rounded border border-app-border text-app-foreground placeholder-app-muted resize-none max-h-24"
            rows={1}
          />

          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-3 bottom-3 text-app-muted hover:text-app-foreground transition"
            aria-label="Open emoji picker"
          >
            <Smile className="h-4 w-4" />
          </button>

          {showEmojiPicker && (
            <EmojiPicker
              onSelect={(emoji) => {
                setContent(content + emoji);
                setShowEmojiPicker(false);
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}

          {content.length > 1800 ? (
            <div className="text-app-danger mt-1 text-xs">{content.length}/2000</div>
          ) : null}
        </div>

        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className="app-button-primary rounded p-3 transition disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
