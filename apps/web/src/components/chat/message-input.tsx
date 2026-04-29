"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, Send, Smile, X } from "lucide-react";
import type { MessageAttachment, UploadedAttachmentInput } from "@wizards/types";
import { EmojiPicker } from "./emoji-picker";
import { GifPicker } from "./gif-picker";
import { ReplyPreview } from "./reply-preview";
import { useI18n } from "@/components/providers/locale-provider";
import { useTyping } from "@/hooks/use-typing";
import type { MessageMode } from "@/hooks/use-messages";
import {
  getMessageAttachmentMaxBytes,
  isMessageGifContentType,
  isMessageImageContentType,
  isSupportedMessageAttachmentContentType,
  MESSAGE_ATTACHMENT_ACCEPT,
  MESSAGE_ATTACHMENT_MAX_COUNT,
} from "@/lib/messages/attachment-rules";
import { useUploadThing } from "@/lib/uploadthing";

interface MessageInputProps {
  conversationId: string;
  mode: MessageMode;
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  replyTo: { id: string; authorName: string; content: string } | null;
  onSend: (
    content: string,
    replyToId?: string,
    attachments?: UploadedAttachmentInput[],
    optimisticAttachments?: MessageAttachment[],
  ) => void;
  onCancelReply: () => void;
  uploadthingEnabled: boolean;
}

type AttachmentDraft = {
  attachment?: MessageAttachment;
  contentType: string;
  error?: string;
  filename: string;
  input?: UploadedAttachmentInput;
  kind: "file" | "image";
  localId: string;
  previewUrl?: string;
  size: number;
  status: "uploading" | "ready" | "error";
};

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random()}`;
}

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function readImageDimensions(previewUrl: string) {
  return new Promise<{ height?: number; width?: number }>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const dimensions: { height?: number; width?: number } = {};
      if (image.naturalHeight > 0) {
        dimensions.height = image.naturalHeight;
      }
      if (image.naturalWidth > 0) {
        dimensions.width = image.naturalWidth;
      }
      resolve(dimensions);
    };
    image.onerror = () => resolve({});
    image.src = previewUrl;
  });
}

export function MessageInput({
  conversationId,
  mode,
  allowFileUploads = true,
  allowGifs = true,
  replyTo,
  onSend,
  onCancelReply,
  uploadthingEnabled,
}: MessageInputProps) {
  const { t } = useI18n();
  const { startTyping, stopTyping } = useTyping(conversationId, mode);
  const { startUpload } = useUploadThing("messageAttachmentUploader");
  const [content, setContent] = useState("");
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>([]);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const readyAttachmentDrafts = useMemo(
    () =>
      attachmentDrafts.filter(
        (draft): draft is AttachmentDraft & {
          attachment: MessageAttachment;
          input: UploadedAttachmentInput;
        } => draft.status === "ready" && Boolean(draft.attachment) && Boolean(draft.input),
      ),
    [attachmentDrafts],
  );
  const hasUploadingAttachments = attachmentDrafts.some(
    (draft) => draft.status === "uploading",
  );
  const canSend =
    (content.trim().length > 0 || readyAttachmentDrafts.length > 0) &&
    !hasUploadingAttachments &&
    !isUploadingAttachments;

  const revokePreviewUrl = (previewUrl: string | undefined) => {
    if (previewUrl && previewUrlsRef.current.has(previewUrl)) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(previewUrl);
    }
  };

  const removeAttachmentDraft = (localId: string) => {
    setAttachmentDrafts((current) => {
      const draft = current.find((item) => item.localId === localId);
      revokePreviewUrl(draft?.previewUrl);

      return current.filter((item) => item.localId !== localId);
    });
  };

  const clearAttachmentDrafts = () => {
    setAttachmentDrafts((current) => {
      current.forEach((draft) => revokePreviewUrl(draft.previewUrl));
      return [];
    });
    setAttachmentUploadError(null);
  };

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

  const uploadAttachmentFiles = async (files: File[]) => {
    if (!allowFileUploads) {
      setAttachmentUploadError(t("chat.attachments.disabled"));
      return;
    }

    if (!uploadthingEnabled) {
      setAttachmentUploadError(t("chat.attachments.uploadNotConfigured"));
      return;
    }

    if (isUploadingAttachments) {
      setAttachmentUploadError(t("chat.attachments.uploadInProgress"));
      return;
    }

    const remainingSlots = MESSAGE_ATTACHMENT_MAX_COUNT - attachmentDrafts.length;
    if (remainingSlots <= 0) {
      setAttachmentUploadError(t("chat.attachments.maxAttachments"));
      return;
    }

    const supportedFiles = files.filter((file) => {
      const maxBytes = getMessageAttachmentMaxBytes(file.type);

      if (!allowGifs && isMessageGifContentType(file.type)) {
        setAttachmentUploadError(t("chat.gifs.disabled"));
        return false;
      }

      if (!isSupportedMessageAttachmentContentType(file.type) || maxBytes <= 0) {
        setAttachmentUploadError(t("chat.attachments.unsupportedAttachmentType"));
        return false;
      }

      if (file.size <= 0 || file.size > maxBytes) {
        setAttachmentUploadError(
          t("chat.attachments.attachmentTooLarge", {
            maxSize: formatAttachmentSize(maxBytes),
          }),
        );
        return false;
      }

      return true;
    });

    const filesToUpload = supportedFiles.slice(0, remainingSlots);
    if (supportedFiles.length > remainingSlots) {
      setAttachmentUploadError(t("chat.attachments.maxAttachments"));
    }

    if (filesToUpload.length === 0) {
      return;
    }

    const drafts: AttachmentDraft[] = filesToUpload.map((file) => {
      const kind: AttachmentDraft["kind"] = isMessageImageContentType(file.type)
        ? "image"
        : "file";
      const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;
      if (previewUrl) {
        previewUrlsRef.current.add(previewUrl);
      }

      const draft: AttachmentDraft = {
        contentType: file.type,
        filename: file.name,
        kind,
        localId: createLocalId(),
        size: file.size,
        status: "uploading",
      };

      if (previewUrl) {
        draft.previewUrl = previewUrl;
      }

      return draft;
    });

    setAttachmentDrafts((current) => [...current, ...drafts]);
    setIsUploadingAttachments(true);
    setAttachmentUploadError(null);

    try {
      const dimensions = await Promise.all(
        drafts.map((draft) =>
          draft.kind === "image" && draft.previewUrl
            ? readImageDimensions(draft.previewUrl)
            : Promise.resolve({} as { height?: number; width?: number }),
        ),
      );
      const uploadedFiles = await startUpload(filesToUpload);

      if (!uploadedFiles || uploadedFiles.length !== drafts.length) {
        throw new Error(t("chat.attachments.uploadFailed"));
      }

      setAttachmentDrafts((current) =>
        current.map((draft) => {
          const draftIndex = drafts.findIndex((item) => item.localId === draft.localId);
          if (draftIndex === -1) {
            return draft;
          }

          const uploadedFile = uploadedFiles[draftIndex];
          if (!uploadedFile) {
            return {
              ...draft,
              error: t("chat.attachments.uploadFailed"),
              status: "error" as const,
            };
          }

          const serverData = uploadedFile.serverData;
          const measuredDimensions = dimensions[draftIndex] ?? {};
          const attachment: MessageAttachment = {
            id: serverData.id,
            url: serverData.url,
            filename: serverData.filename,
            contentType: serverData.contentType,
            size: serverData.size,
          };

          if (draft.kind === "image") {
            const width = measuredDimensions.width ?? serverData.width ?? undefined;
            const height = measuredDimensions.height ?? serverData.height ?? undefined;
            if (width) {
              attachment.width = width;
            }
            if (height) {
              attachment.height = height;
            }
          }

          revokePreviewUrl(draft.previewUrl);

          const nextDraft: AttachmentDraft = {
            ...draft,
            attachment,
            input: {
              id: attachment.id,
              height: attachment.height ?? null,
              width: attachment.width ?? null,
            },
            status: "ready",
          };

          if (draft.kind === "image") {
            nextDraft.previewUrl = attachment.url;
          }

          return nextDraft;
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("chat.attachments.uploadFailed");
      setAttachmentUploadError(message);
      setAttachmentDrafts((current) =>
        current.map((draft) =>
          drafts.some((item) => item.localId === draft.localId)
            ? { ...draft, error: message, status: "error" as const }
            : draft,
        ),
      );
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handleGifSelect = (payload: {
    attachment: MessageAttachment;
    input: UploadedAttachmentInput;
  }) => {
    if (!allowGifs) {
      setAttachmentUploadError(t("chat.gifs.disabled"));
      return;
    }

    if (attachmentDrafts.length >= MESSAGE_ATTACHMENT_MAX_COUNT) {
      setAttachmentUploadError(t("chat.attachments.maxAttachments"));
      return;
    }

    const draft: AttachmentDraft = {
      attachment: payload.attachment,
      contentType: payload.attachment.contentType,
      filename: payload.attachment.filename,
      input: payload.input,
      kind: "image",
      localId: createLocalId(),
      previewUrl: payload.attachment.url,
      size: payload.attachment.size,
      status: "ready",
    };

    setAttachmentDrafts((current) => [...current, draft]);
    setAttachmentUploadError(null);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    if (!allowFileUploads) {
      setAttachmentUploadError(t("chat.attachments.disabled"));
      return;
    }

    void uploadAttachmentFiles(files);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length > 0) {
      void uploadAttachmentFiles(files);
    }
  };

  const handleSend = () => {
    const trimmedContent = content.trim();
    if (!canSend) {
      return;
    }

    const attachmentInputs = readyAttachmentDrafts.map((draft) => draft.input);
    const optimisticAttachments = readyAttachmentDrafts.map((draft) => draft.attachment);

    if (replyTo?.id) {
      onSend(trimmedContent, replyTo.id, attachmentInputs, optimisticAttachments);
    } else {
      onSend(trimmedContent, undefined, attachmentInputs, optimisticAttachments);
    }

    setContent("");
    clearAttachmentDrafts();
    setShowEmojiPicker(false);
    setShowGifPicker(false);

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
    const previewUrls = previewUrlsRef.current;
    return () => {
      clearTimeout(typingTimeoutRef.current);
      stopTyping();
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrls.clear();
    };
  }, [stopTyping]);

  useEffect(() => {
    if (!allowGifs) {
      setShowGifPicker(false);
    }
  }, [allowGifs]);

  return (
    <div className="sticky bottom-0 z-20 space-y-3 border-t border-app-border bg-[hsl(var(--surface-card)/0.82)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:static md:p-5">
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div className="app-panel rounded-[26px] border p-3 shadow-[0_20px_44px_hsl(var(--shadow-color)/0.08)] md:rounded-[30px]">
        {attachmentDrafts.length > 0 ? (
          <div className="mb-3 grid max-h-[38dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:max-h-none md:grid-cols-5 md:overflow-visible md:pr-0">
            {attachmentDrafts.map((draft) => (
              <div
                className="group/attachment relative aspect-square overflow-hidden rounded-[20px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.42)]"
                key={draft.localId}
              >
                {draft.kind === "image" && draft.previewUrl ? (
                  <img
                    alt={draft.attachment?.filename ?? t("chat.attachments.imagePreview")}
                    className="h-full w-full object-cover"
                    src={draft.attachment?.url ?? draft.previewUrl}
                  />
                ) : (
                  <div className="flex h-full flex-col justify-between p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.65)] bg-white/68 text-app-soft shadow-sm">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="line-clamp-2 break-all text-xs font-semibold text-app-foreground">
                        {draft.filename}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-app-soft">
                        {formatAttachmentSize(draft.size)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/12 opacity-80" />
                {draft.kind === "file" ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/86 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-sm backdrop-blur">
                    <Paperclip className="h-3 w-3" />
                    {t("chat.attachments.file")}
                  </span>
                ) : null}
                {isMessageGifContentType(draft.contentType) ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/86 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 shadow-sm backdrop-blur">
                    <ImageIcon className="h-3 w-3" />
                    {t("chat.attachments.gif")}
                  </span>
                ) : null}
                {draft.status === "uploading" ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/88 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("chat.attachments.uploadingAttachment")}
                    </span>
                  </div>
                ) : null}
                {draft.status === "error" ? (
                  <div className="absolute inset-x-2 bottom-2 rounded-full bg-[hsl(var(--danger)/0.92)] px-2 py-1 text-center text-[10px] font-semibold text-white shadow-sm">
                    {draft.error ?? t("chat.attachments.uploadFailed")}
                  </div>
                ) : null}
                <button
                  aria-label={t("chat.attachments.removeAttachment")}
                  className="absolute right-2 top-2 rounded-full border border-white/50 bg-white/88 p-1.5 text-slate-700 opacity-100 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => removeAttachmentDraft(draft.localId)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {attachmentUploadError ? (
          <div className="mb-3 rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-medium text-[hsl(var(--danger))]">
            {attachmentUploadError}
          </div>
        ) : null}

        <div className="flex items-end gap-2 md:gap-3">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                mode === "dm" ? t("dm.input.placeholder") : t("chat.input.placeholder")
              }
              className="max-h-24 min-h-[3rem] w-full resize-none rounded-[22px] bg-transparent px-2 py-2 pr-3 text-[16px] text-app-foreground placeholder-app-muted focus-visible:outline-none md:min-h-[3.25rem] md:rounded-[24px] md:pr-4 md:text-[15px]"
              rows={1}
            />

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[hsl(var(--border)/0.6)] px-1 pt-3 md:gap-3 md:px-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  accept={MESSAGE_ATTACHMENT_ACCEPT}
                  className="hidden"
                  multiple
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  type="file"
                />

                <div className="relative inline-flex">
                  {showEmojiPicker ? (
                    <EmojiPicker
                      onSelect={(emoji) => {
                        setContent((current) => current + emoji);
                        setShowEmojiPicker(false);
                      }}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  ) : null}
                  <button
                    onClick={() => {
                      setShowGifPicker(false);
                      setShowEmojiPicker((current) => !current);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] px-3 py-2 text-xs font-medium text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] md:min-h-0 md:py-1.5"
                    aria-label={t("chat.input.openEmojiPicker")}
                    type="button"
                  >
                    <Smile className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("chat.input.openEmojiPicker")}</span>
                  </button>
                </div>

                <div className="relative inline-flex">
                  {showGifPicker && allowGifs ? (
                    <GifPicker
                      onClose={() => setShowGifPicker(false)}
                      onSelect={handleGifSelect}
                    />
                  ) : null}
                  <button
                    aria-label={t("chat.gifs.openPicker")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.26)] px-3 py-2 text-xs font-medium text-app-soft transition hover:border-[hsl(var(--primary)/0.38)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-1.5"
                    disabled={!allowGifs}
                    onClick={() => {
                      if (!allowGifs) {
                        setAttachmentUploadError(t("chat.gifs.disabled"));
                        return;
                      }
                      setShowEmojiPicker(false);
                      setShowGifPicker((current) => !current);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    title={allowGifs ? t("chat.gifs.openPicker") : t("chat.gifs.disabled")}
                    type="button"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("chat.attachments.gif")}</span>
                  </button>
                </div>

                <button
                  aria-label={t("chat.attachments.attachFile")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.26)] px-3 py-2 text-xs font-medium text-app-soft transition hover:border-[hsl(var(--primary)/0.38)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-1.5"
                  disabled={!allowFileUploads}
                  onClick={() => {
                    if (!allowFileUploads) {
                      setAttachmentUploadError(t("chat.attachments.disabled"));
                      return;
                    }

                    if (!uploadthingEnabled) {
                      setAttachmentUploadError(t("chat.attachments.uploadNotConfigured"));
                      return;
                    }

                    fileInputRef.current?.click();
                  }}
                  title={
                    !allowFileUploads
                      ? t("chat.attachments.disabled")
                      : uploadthingEnabled
                      ? t("chat.attachments.attachFile")
                      : t("chat.attachments.uploadNotConfigured")
                  }
                  type="button"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("chat.attachments.attachFile")}</span>
                </button>
              </div>

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
            disabled={!canSend}
            className="inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/0.82))] px-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_34px_hsl(var(--shadow-color)/0.16)] transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:min-w-[3.25rem] md:px-4"
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
