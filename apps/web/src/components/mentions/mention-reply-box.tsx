"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Paperclip, Reply, SendHorizontal, Smile, X } from "lucide-react";
import type { Mention, UploadedAttachmentInput } from "@wizards/types";

import { EmojiPicker } from "@/components/chat/emoji-picker";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { resolveMentionSourceLabel } from "@/components/mentions/mention-source-tile";
import { Avatar } from "@/components/ui/avatar";
import {
  getMessageAttachmentMaxBytes,
  isSupportedMessageAttachmentContentType,
  MESSAGE_ATTACHMENT_ACCEPT,
  MESSAGE_ATTACHMENT_MAX_COUNT,
} from "@/lib/messages/attachment-rules";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import {
  MENTION_REPLY_COPY_KEY,
  resolveReplyTarget,
  type MentionReplyTarget,
} from "@/lib/mentions/reply-target";
import { cn } from "@/lib/utils";
import { useUploadThing } from "@/lib/uploadthing";
import type { MessageSendAck } from "@/lib/socket/events";

/**
 * Satır içi yanıt kutusu — SPEC §5.2, karar K10.
 *
 * Kutu kartın **içinde**, eylem satırının altında durur; kart onu `replySlot` olarak yalnız
 * yerleştirir. Hedefi `resolveReplyTarget` söyler: thread kartında thread'e, DM kartında
 * sohbete, diğerlerinde kanala.
 *
 * **Taslak kaybolmaz.** Yazılmış ama gönderilmemiş metin modül düzeyinde, bahsetme kimliğine
 * göre tutulur; kutu kapanıp tekrar açıldığında geri gelir. React state'inde tutulsaydı kutu
 * kapanınca bileşen sökülür ve metin onunla giderdi — kullanıcı `Esc`e basmanın yazdığını
 * sildiğini ancak yazdıktan sonra öğrenirdi.
 */

const { replyBox } = MENTIONS_METRICS;

/**
 * Oturum ömürlü taslak deposu. `sessionStorage` değil: taslak sekmeler arası paylaşılmamalı ve
 * bir yenilemeden sonra da beklenmemeli — burada tutulan şey "kutuyu kapattım, geri açtım"
 * aralığıdır.
 */
const replyDrafts = new Map<string, string>();

export function readMentionReplyDraft(mentionId: string): string {
  return replyDrafts.get(mentionId) ?? "";
}

export function writeMentionReplyDraft(mentionId: string, value: string): void {
  if (value.trim().length === 0) {
    replyDrafts.delete(mentionId);
    return;
  }

  replyDrafts.set(mentionId, value);
}

export function clearMentionReplyDraft(mentionId: string): void {
  replyDrafts.delete(mentionId);
}

/** Boş ya da yalnız boşluktan oluşan metin gönderilemez. */
export function canSendMentionReply(value: string, attachmentCount = 0): boolean {
  return value.trim().length > 0 || attachmentCount > 0;
}

/** Taslak yalnız sunucu mesaj kimliğiyle başarıyı onayladığında temizlenir. */
export function applyMentionReplyAcknowledgement(
  mentionId: string,
  acknowledgement: MessageSendAck,
): boolean {
  if (!acknowledgement.ok) {
    return false;
  }

  clearMentionReplyDraft(mentionId);
  return true;
}

export type MentionReplyBoxProps = {
  /** İzleyicinin kendi avatarı — kutunun giriş satırındaki 28px daire. */
  readonly currentUser: {
    readonly avatarUrl?: string | null | undefined;
    readonly initials: string;
    readonly name: string;
  };
  readonly mention: Mention;
  readonly onClose: () => void;
  /** Gönderim başarılıysa kart okundu sayılır (SPEC §5.2). */
  readonly onSent: () => void;
  readonly uploadthingEnabled?: boolean;
};

type MentionReplyAttachment = {
  readonly filename: string;
  readonly input: UploadedAttachmentInput;
};

export function MentionReplyBox({
  currentUser,
  mention,
  onClose,
  onSent,
  uploadthingEnabled = false,
}: MentionReplyBoxProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const { startUpload } = useUploadThing("messageAttachmentUploader");
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(() => readMentionReplyDraft(mention.id));
  const [attachments, setAttachments] = useState<MentionReplyAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const target = useMemo(() => resolveReplyTarget(mention), [mention]);
  const copy = MENTION_REPLY_COPY_KEY[target.type];
  const sourceLabel = resolveMentionSourceLabel(mention.source, t);

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const handleChange = (next: string) => {
    setValue(next);
    writeMentionReplyDraft(mention.id, next);
  };

  const send = useCallback(() => {
    if (!canSendMentionReply(value, attachments.length) || sending || uploading) {
      return;
    }

    // Gönderme yolu bir socket yayınıdır ve **onay taşımaz** (`chat-area.tsx` ile aynı
    // sözleşme). Bağlantı kopukken yayın sessizce düşerdi; tek dürüst kontrol budur.
    if (!socket.connected) {
      setError(t("mentions.feed.error"));
      return;
    }

    const content = value.trim();
    const payloadAttachments = attachments.map((attachment) => attachment.input);
    setSending(true);
    setError(null);

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setSending(false);
        setError(t("mentions.feed.error"));
      }
    }, 10_000);

    const acknowledge = (result: MessageSendAck) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      setSending(false);

      if (!applyMentionReplyAcknowledgement(mention.id, result)) {
        setError(t("mentions.feed.error"));
        return;
      }

      setValue("");
      setAttachments([]);
      setEmojiOpen(false);
      onSent();
      onClose();
    };

    if (target.type === "dm") {
      socket.emit(
        "dm:message:send",
        {
          attachments: payloadAttachments,
          content,
          conversationId: target.conversationId,
          ...(target.replyToId ? { replyToId: target.replyToId } : {}),
        },
        acknowledge,
      );
    } else if (target.type === "thread") {
      socket.emit(
        "message:send",
        {
          attachments: payloadAttachments,
          channelId: target.channelId,
          content,
          threadParentId: target.parentMessageId,
        },
        acknowledge,
      );
    } else {
      socket.emit(
        "message:send",
        {
          attachments: payloadAttachments,
          channelId: target.channelId,
          content,
          ...(target.replyToId ? { replyToId: target.replyToId } : {}),
        },
        acknowledge,
      );
    }
  }, [attachments, mention.id, onClose, onSent, sending, socket, t, target, uploading, value]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!uploadthingEnabled) {
        setError(t("chat.attachments.uploadNotConfigured"));
        return;
      }

      const remaining = MESSAGE_ATTACHMENT_MAX_COUNT - attachments.length;
      if (remaining <= 0 || files.length > remaining) {
        setError(t("chat.attachments.maxAttachments"));
        return;
      }

      for (const file of files) {
        const maxBytes = getMessageAttachmentMaxBytes(file.type);
        if (!isSupportedMessageAttachmentContentType(file.type) || maxBytes <= 0) {
          setError(t("chat.attachments.unsupportedAttachmentType"));
          return;
        }
        if (file.size <= 0 || file.size > maxBytes) {
          setError(
            t("chat.attachments.attachmentTooLarge", {
              maxSize: `${Math.ceil(maxBytes / 1024 / 1024)}MB`,
            }),
          );
          return;
        }
      }

      setUploading(true);
      setError(null);
      try {
        const uploaded = await startUpload(files);
        if (!uploaded || uploaded.length !== files.length) {
          throw new Error("upload incomplete");
        }

        const next = uploaded.map((file, index) => ({
          filename: file.serverData.filename || files[index]?.name || t("chat.attachments.file"),
          input: {
            height: file.serverData.height ?? null,
            id: file.serverData.id,
            width: file.serverData.width ?? null,
          },
        }));
        setAttachments((current) => [...current, ...next]);
      } catch {
        setError(t("chat.attachments.uploadFailed"));
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [attachments.length, startUpload, t, uploadthingEnabled],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    send();
  };

  const canSend = canSendMentionReply(value, attachments.length) && !sending && !uploading;

  return (
    <div
      data-target={target.type}
      data-testid="mention-reply-box"
      style={{
        background: `hsl(var(--surface-secondary)/${replyBox.surfaceAlpha})`,
        border: `${hairline()} solid hsl(var(--primary)/${replyBox.borderAlpha})`,
        borderRadius: pxToRem(replyBox.radius),
        marginTop: pxToRem(replyBox.marginTop),
        padding: `${pxToRem(replyBox.paddingY)} ${pxToRem(replyBox.paddingX)}`,
      }}
    >
      {/* Meta satırı — hedefi açıkça yazar (K10). */}
      <div
        className="flex min-w-0 items-center text-[hsl(var(--text-muted))]"
        data-testid="mention-reply-meta"
        style={{
          fontSize: pxToRem(replyBox.metaFontSize),
          gap: pxToRem(replyBox.metaGap),
          marginBottom: pxToRem(replyBox.metaMarginBottom),
        }}
      >
        <Reply
          aria-hidden="true"
          className="shrink-0"
          style={{ height: pxToRem(replyBox.metaIconSize), width: pxToRem(replyBox.metaIconSize) }}
        />
        <span className="min-w-0 truncate">
          {t(copy.meta, { author: mention.author.name, source: sourceLabel })}
        </span>
      </div>

      {/* Giriş satırı */}
      <div className="flex items-center" style={{ gap: pxToRem(replyBox.inputRowGap) }}>
        <Avatar
          alt={currentUser.name}
          fallback={currentUser.initials}
          src={currentUser.avatarUrl}
          className="shrink-0"
          style={{
            height: pxToRem(replyBox.avatarSize),
            width: pxToRem(replyBox.avatarSize),
          }}
        />

        <div
          className="flex min-w-0 flex-1 items-center bg-[hsl(var(--surface-base))]"
          style={{
            border: `${hairline()} solid hsl(var(--border)/${replyBox.fieldBorderAlpha})`,
            borderRadius: pxToRem(replyBox.fieldRadius),
            gap: pxToRem(replyBox.fieldGap),
            height: pxToRem(replyBox.fieldHeight),
            padding: `0 ${pxToRem(replyBox.fieldPaddingX)}`,
          }}
        >
          <textarea
            aria-label={t(copy.placeholder)}
            className="min-w-0 flex-1 resize-none bg-transparent text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-muted))] focus-visible:outline-hidden"
            data-testid="mention-reply-field"
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(copy.placeholder)}
            ref={fieldRef}
            rows={1}
            style={{ fontSize: pxToRem(replyBox.fieldFontSize), lineHeight: 1.4 }}
            value={value}
          />

          <button
            aria-label={t("mentions.reply.emoji")}
            className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--foreground))]"
            data-testid="mention-reply-emoji"
            disabled={sending}
            onClick={() => setEmojiOpen((current) => !current)}
            style={{
              borderRadius: pxToRem(replyBox.iconButtonRadius),
              height: pxToRem(replyBox.iconButtonSize),
              width: pxToRem(replyBox.iconButtonSize),
            }}
            type="button"
          >
            <Smile
              aria-hidden="true"
              style={{ height: pxToRem(replyBox.iconSize), width: pxToRem(replyBox.iconSize) }}
            />
          </button>
          <button
            aria-label={t("mentions.reply.attach")}
            className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-45"
            data-testid="mention-reply-attach"
            disabled={!uploadthingEnabled || uploading || sending}
            onClick={() => fileInputRef.current?.click()}
            style={{
              borderRadius: pxToRem(replyBox.iconButtonRadius),
              height: pxToRem(replyBox.iconButtonSize),
              width: pxToRem(replyBox.iconButtonSize),
            }}
            type="button"
          >
            {uploading ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin"
                style={{ height: pxToRem(replyBox.iconSize), width: pxToRem(replyBox.iconSize) }}
              />
            ) : (
              <Paperclip
                aria-hidden="true"
                style={{ height: pxToRem(replyBox.iconSize), width: pxToRem(replyBox.iconSize) }}
              />
            )}
          </button>
          <input
            accept={MESSAGE_ATTACHMENT_ACCEPT}
            className="hidden"
            data-testid="mention-reply-file-input"
            multiple
            onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
            ref={fileInputRef}
            type="file"
          />
        </div>

        <button
          aria-label={t("mentions.reply.send")}
          className={cn(
            "grid shrink-0 place-items-center bg-[hsl(var(--primary))] text-white transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            canSend ? "hover:brightness-[1.08]" : "cursor-not-allowed opacity-45",
          )}
          data-testid="mention-reply-send"
          disabled={!canSend}
          onClick={send}
          style={{
            borderRadius: pxToRem(replyBox.sendRadius),
            boxShadow: `${pxToRem(replyBox.sendShadow.x)} ${pxToRem(replyBox.sendShadow.y)} ${pxToRem(
              replyBox.sendShadow.blur,
            )} ${pxToRem(replyBox.sendShadow.spread)} hsl(var(--primary))`,
            height: pxToRem(replyBox.sendSize),
            width: pxToRem(replyBox.sendSize),
          }}
          type="button"
        >
          {sending ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin"
              style={{
                height: pxToRem(replyBox.sendIconSize),
                width: pxToRem(replyBox.sendIconSize),
              }}
            />
          ) : (
            <SendHorizontal
              aria-hidden="true"
              style={{
                height: pxToRem(replyBox.sendIconSize),
                width: pxToRem(replyBox.sendIconSize),
              }}
            />
          )}
        </button>
      </div>

      {emojiOpen ? (
        <div className="relative z-40 mt-2">
          <EmojiPicker
            onClose={() => setEmojiOpen(false)}
            onSelect={(emoji) => {
              handleChange(`${value}${emoji}`);
              setEmojiOpen(false);
              fieldRef.current?.focus();
            }}
          />
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2" data-testid="mention-reply-attachments">
          {attachments.map((attachment) => (
            <span
              className="flex max-w-full items-center gap-1 rounded-lg bg-[hsl(var(--surface-soft))] px-2 py-1 text-xs text-[hsl(var(--text-secondary))]"
              key={attachment.input.id}
            >
              <span className="truncate">{attachment.filename}</span>
              <button
                aria-label={t("chat.attachments.removeAttachment")}
                disabled={sending}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.input.id !== attachment.input.id),
                  )
                }
                type="button"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          className="text-[hsl(var(--danger))]"
          data-testid="mention-reply-error"
          role="alert"
          style={{
            fontSize: pxToRem(replyBox.hintsFontSize),
            margin: `${pxToRem(replyBox.hintsMarginTop)} 0 0`,
          }}
        >
          {error}
        </p>
      ) : null}

      {/* Alt satır — kısayol ipuçları ve Vazgeç */}
      <div
        className="flex flex-wrap items-center text-[hsl(var(--text-muted))]"
        style={{
          fontSize: pxToRem(replyBox.hintsFontSize),
          gap: pxToRem(replyBox.hintsGap),
          marginTop: pxToRem(replyBox.hintsMarginTop),
        }}
      >
        {[
          { action: "mentions.reply.hint.send", key: "mentions.reply.hint.sendKey" },
          { action: "mentions.reply.hint.newline", key: "mentions.reply.hint.newlineKey" },
          { action: "mentions.reply.hint.close", key: "mentions.reply.hint.closeKey" },
        ].map((hint) => (
          <span key={hint.key}>
            <span style={{ fontWeight: replyBox.hintStrongWeight }}>{t(hint.key)}</span>{" "}
            {t(hint.action)}
          </span>
        ))}

        <button
          className="ms-auto text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="mention-reply-cancel"
          onClick={onClose}
          style={{
            fontSize: pxToRem(replyBox.cancelFontSize),
            fontWeight: replyBox.cancelWeight,
          }}
          type="button"
        >
          {t("mentions.reply.cancel")}
        </button>
      </div>
    </div>
  );
}

export type { MentionReplyTarget };
