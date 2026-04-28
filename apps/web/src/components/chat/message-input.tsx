"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Send, Smile, X } from "lucide-react";
import type { MessageAttachment, UploadedAttachmentInput } from "@wizards/types";
import { EmojiPicker } from "./emoji-picker";
import { ReplyPreview } from "./reply-preview";
import { useI18n } from "@/components/providers/locale-provider";
import { useTyping } from "@/hooks/use-typing";
import type { MessageMode } from "@/hooks/use-messages";
import { useUploadThing } from "@/lib/uploadthing";

interface MessageInputProps {
  conversationId: string;
  mode: MessageMode;
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

type ImageDraft = {
  attachment?: MessageAttachment;
  error?: string;
  input?: UploadedAttachmentInput;
  localId: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 5;

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `image-${Date.now()}-${Math.random()}`;
}

function isSupportedImage(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
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
  replyTo,
  onSend,
  onCancelReply,
  uploadthingEnabled,
}: MessageInputProps) {
  const { t } = useI18n();
  const { startTyping, stopTyping } = useTyping(conversationId, mode);
  const { startUpload } = useUploadThing("messageImageUploader");
  const [content, setContent] = useState("");
  const [imageDrafts, setImageDrafts] = useState<ImageDraft[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const readyImageDrafts = useMemo(
    () =>
      imageDrafts.filter(
        (draft): draft is ImageDraft & {
          attachment: MessageAttachment;
          input: UploadedAttachmentInput;
        } => draft.status === "ready" && Boolean(draft.attachment) && Boolean(draft.input),
      ),
    [imageDrafts],
  );
  const hasUploadingImages = imageDrafts.some((draft) => draft.status === "uploading");
  const canSend =
    (content.trim().length > 0 || readyImageDrafts.length > 0) &&
    !hasUploadingImages &&
    !isUploadingImages;

  const revokePreviewUrl = (previewUrl: string) => {
    if (previewUrlsRef.current.has(previewUrl)) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(previewUrl);
    }
  };

  const removeImageDraft = (localId: string) => {
    setImageDrafts((current) => {
      const draft = current.find((item) => item.localId === localId);
      if (draft) {
        revokePreviewUrl(draft.previewUrl);
      }

      return current.filter((item) => item.localId !== localId);
    });
  };

  const clearImageDrafts = () => {
    setImageDrafts((current) => {
      current.forEach((draft) => revokePreviewUrl(draft.previewUrl));
      return [];
    });
    setImageUploadError(null);
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

  const uploadImageFiles = async (files: File[]) => {
    if (!uploadthingEnabled) {
      setImageUploadError(t("chat.attachments.uploadNotConfigured"));
      return;
    }

    if (isUploadingImages) {
      setImageUploadError(t("chat.attachments.uploadInProgress"));
      return;
    }

    const remainingSlots = MAX_IMAGES_PER_MESSAGE - imageDrafts.length;
    if (remainingSlots <= 0) {
      setImageUploadError(t("chat.attachments.maxImages"));
      return;
    }

    const supportedFiles = files.filter((file) => {
      if (!isSupportedImage(file)) {
        setImageUploadError(t("chat.attachments.unsupportedImageType"));
        return false;
      }

      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        setImageUploadError(t("chat.attachments.fileTooLarge"));
        return false;
      }

      return true;
    });

    const filesToUpload = supportedFiles.slice(0, remainingSlots);
    if (supportedFiles.length > remainingSlots) {
      setImageUploadError(t("chat.attachments.maxImages"));
    }

    if (filesToUpload.length === 0) {
      return;
    }

    const drafts = filesToUpload.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        localId: createLocalId(),
        previewUrl,
        status: "uploading" as const,
      };
    });

    setImageDrafts((current) => [...current, ...drafts]);
    setIsUploadingImages(true);
    setImageUploadError(null);

    try {
      const dimensions = await Promise.all(
        drafts.map((draft) => readImageDimensions(draft.previewUrl)),
      );
      const uploadedFiles = await startUpload(filesToUpload);

      if (!uploadedFiles || uploadedFiles.length !== drafts.length) {
        throw new Error(t("chat.attachments.uploadFailed"));
      }

      setImageDrafts((current) =>
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
            width: measuredDimensions.width ?? serverData.width ?? undefined,
            height: measuredDimensions.height ?? serverData.height ?? undefined,
          };

          revokePreviewUrl(draft.previewUrl);

          return {
            attachment,
            input: {
              id: attachment.id,
              height: attachment.height ?? null,
              width: attachment.width ?? null,
            },
            localId: draft.localId,
            previewUrl: attachment.url,
            status: "ready" as const,
          };
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("chat.attachments.uploadFailed");
      setImageUploadError(message);
      setImageDrafts((current) =>
        current.map((draft) =>
          drafts.some((item) => item.localId === draft.localId)
            ? { ...draft, error: message, status: "error" as const }
            : draft,
        ),
      );
    } finally {
      setIsUploadingImages(false);
    }
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
    void uploadImageFiles(files);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length > 0) {
      void uploadImageFiles(files);
    }
  };

  const handleSend = () => {
    const trimmedContent = content.trim();
    if (!canSend) {
      return;
    }

    const attachmentInputs = readyImageDrafts.map((draft) => draft.input);
    const optimisticAttachments = readyImageDrafts.map((draft) => draft.attachment);

    if (replyTo?.id) {
      onSend(trimmedContent, replyTo.id, attachmentInputs, optimisticAttachments);
    } else {
      onSend(trimmedContent, undefined, attachmentInputs, optimisticAttachments);
    }

    setContent("");
    clearImageDrafts();
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
    const previewUrls = previewUrlsRef.current;
    return () => {
      clearTimeout(typingTimeoutRef.current);
      stopTyping();
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrls.clear();
    };
  }, [stopTyping]);

  return (
    <div className="space-y-3 border-t border-app-border bg-[hsl(var(--surface-card)/0.62)] p-4 backdrop-blur-sm md:p-5">
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div className="app-panel rounded-[30px] border p-3 shadow-[0_20px_44px_hsl(var(--shadow-color)/0.08)]">
        {imageDrafts.length > 0 ? (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {imageDrafts.map((draft) => (
              <div
                className="group/image relative aspect-square overflow-hidden rounded-[20px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.42)]"
                key={draft.localId}
              >
                <img
                  alt={draft.attachment?.filename ?? t("chat.attachments.imagePreview")}
                  className="h-full w-full object-cover"
                  src={draft.attachment?.url ?? draft.previewUrl}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/12 opacity-80" />
                {draft.status === "uploading" ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/88 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("chat.attachments.uploadingImage")}
                    </span>
                  </div>
                ) : null}
                {draft.status === "error" ? (
                  <div className="absolute inset-x-2 bottom-2 rounded-full bg-[hsl(var(--danger)/0.92)] px-2 py-1 text-center text-[10px] font-semibold text-white shadow-sm">
                    {draft.error ?? t("chat.attachments.uploadFailed")}
                  </div>
                ) : null}
                <button
                  aria-label={t("chat.attachments.removeImage")}
                  className="absolute right-2 top-2 rounded-full border border-white/50 bg-white/88 p-1.5 text-slate-700 opacity-100 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => removeImageDraft(draft.localId)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {imageUploadError ? (
          <div className="mb-3 rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-medium text-[hsl(var(--danger))]">
            {imageUploadError}
          </div>
        ) : null}

        <div className="flex items-end gap-3">
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
              className="min-h-[3.25rem] w-full max-h-24 resize-none rounded-[24px] bg-transparent px-2 py-2 pr-4 text-[15px] text-app-foreground placeholder-app-muted focus-visible:outline-none"
              rows={1}
            />

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-[hsl(var(--border)/0.6)] px-2 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  accept="image/png,image/jpeg,image/webp"
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
                    onClick={() => setShowEmojiPicker((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] px-3 py-1.5 text-xs font-medium text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    aria-label={t("chat.input.openEmojiPicker")}
                    type="button"
                  >
                    <Smile className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("chat.input.openEmojiPicker")}</span>
                  </button>
                </div>

                <button
                  aria-label={t("chat.attachments.attachImage")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.26)] px-3 py-1.5 text-xs font-medium text-app-soft transition hover:border-[hsl(var(--primary)/0.38)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  onClick={() => {
                    if (!uploadthingEnabled) {
                      setImageUploadError(t("chat.attachments.uploadNotConfigured"));
                      return;
                    }

                    fileInputRef.current?.click();
                  }}
                  title={
                    uploadthingEnabled
                      ? t("chat.attachments.pasteHint")
                      : t("chat.attachments.uploadNotConfigured")
                  }
                  type="button"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t("chat.attachments.pasteHint")}
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
