"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Braces,
  ChartNoAxesColumnIncreasing,
  Code2,
  FileText,
  ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
  Send,
  Smile,
  Strikethrough,
  Underline,
  Video,
  X,
} from "lucide-react";
import type { MessageAttachment, UploadedAttachmentInput, WorkspaceMember } from "@wizards/types";
import { EmojiPicker } from "./emoji-picker";
import { GifPicker } from "./gif-picker";
import { ReplyPreview } from "./reply-preview";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { useTyping } from "@/hooks/use-typing";
import type { MessageMode } from "@/hooks/use-messages";
import { cn } from "@/lib/utils";
import {
  getMessageAttachmentMaxBytes,
  isMessageGifContentType,
  isMessageImageContentType,
  isMessageVideoContentType,
  isSupportedMessageAttachmentContentType,
  MESSAGE_ATTACHMENT_ACCEPT,
  MESSAGE_ATTACHMENT_MAX_COUNT,
} from "@/lib/messages/attachment-rules";
import { useUploadThing } from "@/lib/uploadthing";

const MAX_MESSAGE_LENGTH = 2000;

interface MessageInputProps {
  conversationId: string;
  mode: MessageMode;
  autoFocus?: boolean;
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  disabled?: boolean;
  disabledReason?: string | undefined;
  replyTo: { id: string; authorName: string; content: string } | null;
  onSend: (
    content: string,
    replyToId?: string,
    attachments?: UploadedAttachmentInput[],
    optimisticAttachments?: MessageAttachment[],
  ) => void;
  onCancelReply: () => void;
  mentionMembers?: WorkspaceMember[];
  uploadthingEnabled: boolean;
  maxLength?: number | null;
  variant?: "default" | "thread";
}

type AttachmentDraft = {
  attachment?: MessageAttachment;
  contentType: string;
  error?: string;
  filename: string;
  input?: UploadedAttachmentInput;
  kind: "file" | "image" | "video";
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

function getActiveMention(value: string, cursorIndex: number) {
  const beforeCursor = value.slice(0, cursorIndex);
  const match = /(^|[\s([{])@([a-zA-Z0-9_.-]{0,32})$/.exec(beforeCursor);
  if (!match) {
    return null;
  }

  const query = match[2] ?? "";
  return {
    end: cursorIndex,
    query,
    start: beforeCursor.length - query.length - 1,
  };
}

export function MessageInput({
  conversationId,
  mode,
  autoFocus = false,
  allowFileUploads = true,
  allowGifs = true,
  disabled = false,
  disabledReason,
  replyTo,
  onSend,
  onCancelReply,
  mentionMembers = [],
  uploadthingEnabled,
  maxLength = MAX_MESSAGE_LENGTH,
  variant = "default",
}: MessageInputProps) {
  const { t } = useI18n();
  const { startTyping, stopTyping } = useTyping(conversationId, mode);
  const { startUpload } = useUploadThing("messageAttachmentUploader");
  const [content, setContent] = useState("");
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>([]);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const isThreadComposer = variant === "thread";
  const effectiveMaxLength = maxLength ?? Number.POSITIVE_INFINITY;
  const hasFiniteMaxLength = Number.isFinite(effectiveMaxLength);

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
  const disabledMessage = disabledReason ?? t("chat.input.disabled");
  const canSend =
    (content.trim().length > 0 || readyAttachmentDrafts.length > 0) &&
    content.length <= effectiveMaxLength &&
    !hasUploadingAttachments &&
    !isUploadingAttachments &&
    !disabled;
  const activeMention = useMemo(
    () => (disabled ? null : getActiveMention(content, selectionIndex)),
    [content, disabled, selectionIndex],
  );
  const mentionSuggestions = useMemo(() => {
    if (!activeMention || mode !== "channel") {
      return [];
    }

    const query = activeMention.query.toLocaleLowerCase("en-US");
    return mentionMembers
      .filter((member) => {
        const displayName = member.displayName ?? member.username;
        return (
          member.username.toLocaleLowerCase("en-US").includes(query) ||
          displayName.toLocaleLowerCase("en-US").includes(query)
        );
      })
      .slice(0, 6);
  }, [activeMention, mentionMembers, mode]);

  const formatButtonLabelClass = isThreadComposer ? "sr-only" : "hidden sm:inline";
  const compactToolButtonClass = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-card)/0.92)] text-[12.5px] font-semibold text-app-muted shadow-[0_8px_20px_hsl(var(--shadow-color)/0.04)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.24)] hover:bg-[hsl(var(--surface-card))] hover:text-app-foreground hover:shadow-[0_12px_26px_hsl(var(--shadow-color)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.44)] disabled:cursor-not-allowed disabled:opacity-55",
    isThreadComposer
      ? "h-9 w-9 px-0"
      : "min-h-8 px-2.5 py-1.5 md:min-h-0",
  );
  const formattingActionButtonClass =
    "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[13px] border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-card)/0.92)] px-2.5 py-1.5 text-[12.5px] font-bold text-app-muted shadow-[0_8px_18px_hsl(var(--shadow-color)/0.04)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.26)] hover:bg-[hsl(var(--primary)/0.07)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)] disabled:cursor-not-allowed disabled:opacity-50";

  const updateContentWithSelection = (
    nextContent: string,
    selectionStart: number,
    selectionEnd = selectionStart,
  ) => {
    if (nextContent.length > effectiveMaxLength) {
      return;
    }

    setContent(nextContent);
    setSelectionIndex(selectionEnd);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const getCurrentSelection = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionIndex;
    const end = textarea?.selectionEnd ?? selectionIndex;

    return {
      end,
      selectedText: content.slice(start, end),
      start,
    };
  };

  const insertMarkdownWrap = (
    before: string,
    after = before,
    fallback = t("chat.input.formatPlaceholder"),
  ) => {
    if (disabled) {
      return;
    }

    const { end, selectedText, start } = getCurrentSelection();
    const insertedText = selectedText || fallback;
    const nextContent =
      content.slice(0, start) + before + insertedText + after + content.slice(end);

    const selectionStart = start + before.length;
    const selectionEnd = selectionStart + insertedText.length;

    updateContentWithSelection(nextContent, selectionStart, selectionEnd);
  };

  const insertPrefixedLines = (prefix: string, fallback: string) => {
    if (disabled) {
      return;
    }

    const { end, selectedText, start } = getCurrentSelection();
    const source = selectedText || fallback;
    const formatted = source
      .split(/\r?\n/)
      .map((line) => `${prefix}${line || fallback}`)
      .join("\n");
    const leadingBreak = start > 0 && !content.slice(0, start).endsWith("\n") ? "\n" : "";
    const trailingBreak = end < content.length && !content.slice(end).startsWith("\n") ? "\n" : "";
    const insertion = `${leadingBreak}${formatted}${trailingBreak}`;
    const nextContent = content.slice(0, start) + insertion + content.slice(end);
    const selectionStart = start + leadingBreak.length;

    updateContentWithSelection(nextContent, selectionStart, selectionStart + formatted.length);
  };

  const insertOrderedList = () => {
    if (disabled) {
      return;
    }

    const { end, selectedText, start } = getCurrentSelection();
    const source = selectedText || t("chat.input.listFallback");
    const formatted = source
      .split(/\r?\n/)
      .map((line, index) => `${index + 1}. ${line || t("chat.input.listFallback")}`)
      .join("\n");
    const leadingBreak = start > 0 && !content.slice(0, start).endsWith("\n") ? "\n" : "";
    const trailingBreak = end < content.length && !content.slice(end).startsWith("\n") ? "\n" : "";
    const insertion = `${leadingBreak}${formatted}${trailingBreak}`;
    const nextContent = content.slice(0, start) + insertion + content.slice(end);
    const selectionStart = start + leadingBreak.length;

    updateContentWithSelection(nextContent, selectionStart, selectionStart + formatted.length);
  };

  const insertCodeBlock = () => {
    insertMarkdownWrap(
      "```text\n",
      "\n```",
      t("chat.input.codeBlockFallback"),
    );
  };

  const insertPollTemplate = () => {
    if (disabled) {
      return;
    }

    const { end, start } = getCurrentSelection();
    const needsLeadingBreak =
      start > 0 && !content.slice(0, start).endsWith("\n") ? "\n\n" : "";
    const pollTemplate = `${needsLeadingBreak}${t("chat.input.pollTemplate")}`;
    const nextContent = content.slice(0, start) + pollTemplate + content.slice(end);
    const questionOffset = pollTemplate.indexOf(t("chat.input.pollQuestion"));
    const selectionStart =
      start + (questionOffset >= 0 ? questionOffset : pollTemplate.length);
    const selectionEnd =
      questionOffset >= 0
        ? selectionStart + t("chat.input.pollQuestion").length
        : selectionStart;

    updateContentWithSelection(nextContent, selectionStart, selectionEnd);
  };

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
    const nextContent = event.target.value;
    setContent(nextContent);
    setSelectionIndex(event.currentTarget.selectionStart ?? nextContent.length);

    if (nextContent.trim().length === 0) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
      stopTyping();
    } else {
      if (!typingTimeoutRef.current) {
        startTyping();
      }

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
        typingTimeoutRef.current = undefined;
      }, 3000);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        96,
      )}px`;
    }
  };

  const insertMention = (member: WorkspaceMember) => {
    if (!activeMention) {
      return;
    }

    const mentionText = `@${member.username} `;
    const nextContent =
      content.slice(0, activeMention.start) +
      mentionText +
      content.slice(activeMention.end);
    const nextCursor = activeMention.start + mentionText.length;

    setContent(nextContent);
    setActiveMentionIndex(0);
    setSelectionIndex(nextCursor);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const uploadAttachmentFiles = async (files: File[]) => {
    if (disabled) {
      setAttachmentUploadError(disabledMessage);
      return;
    }

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
        : isMessageVideoContentType(file.type)
          ? "video"
          : "file";
      const previewUrl =
        kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined;
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
            duration: serverData.duration ?? undefined,
            thumbnailUrl: serverData.thumbnailUrl ?? undefined,
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

          if (draft.kind === "video") {
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
    if (disabled) {
      setAttachmentUploadError(disabledMessage);
      return;
    }

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
    if (disabled) {
      setAttachmentUploadError(disabledMessage);
      return;
    }

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

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = allowFileUploads && !disabled ? "copy" : "none";
    setIsDraggingFiles(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const relatedTarget =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;

    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setIsDraggingFiles(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    setIsDraggingFiles(false);

    if (disabled) {
      setAttachmentUploadError(disabledMessage);
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? []);
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

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = undefined;
    stopTyping();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
      }
      return;
    }

    if (mentionSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveMentionIndex((current) => (current + 1) % mentionSuggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveMentionIndex(
          (current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length,
        );
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        const selected = mentionSuggestions[activeMentionIndex] ?? mentionSuggestions[0];
        if (selected) {
          insertMention(selected);
        }
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [activeMention?.query]);

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

  useEffect(() => {
    if (disabled) {
      setShowEmojiPicker(false);
      setShowGifPicker(false);
      stopTyping();
    }
  }, [disabled, stopTyping]);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [autoFocus, conversationId, disabled, mode]);

  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 border-t border-app-border bg-[hsl(var(--surface-card)/0.9)] backdrop-blur-xl md:static",
        isThreadComposer
          ? "space-y-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:p-3"
          : "space-y-3 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 md:pt-3",
      )}
      data-testid="message-composer"
      data-composer-variant={isThreadComposer ? "thread" : "default"}
      data-disabled={disabled ? "true" : undefined}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div
        className={cn(
          "relative border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.96)] shadow-[0_20px_54px_hsl(var(--shadow-color)/0.085),inset_0_1px_0_hsl(var(--background)/0.56)]",
          isThreadComposer
            ? "rounded-[22px] p-2"
            : "rounded-[24px] p-2.5 md:rounded-[28px] md:p-3",
        )}
      >
        {disabled ? (
          <div
            className="mb-3 rounded-2xl border border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--warning)/0.08)] px-3 py-2 text-xs font-semibold text-app-foreground"
            data-testid="message-composer-disabled"
          >
            {disabledMessage}
          </div>
        ) : null}

        {isDraggingFiles ? (
          <div className="absolute inset-2 z-20 flex items-center justify-center rounded-[24px] border border-dashed border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.12)] text-center shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.1)] backdrop-blur-xl">
            <div className="rounded-3xl border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--surface-card)/0.9)] px-5 py-4 shadow-[0_18px_42px_hsl(var(--shadow-color)/0.14)]">
              <Paperclip className="mx-auto mb-2 h-5 w-5 text-[hsl(var(--primary))]" />
              <p className="text-sm font-bold text-app-foreground">
                {t("chat.attachments.dropToUpload")}
              </p>
              <p className="mt-1 text-xs text-app-muted">
                {t("chat.attachments.dropToUploadHint")}
              </p>
            </div>
          </div>
        ) : null}
        {attachmentDrafts.length > 0 ? (
          <div className="mb-3 grid max-h-[38dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:max-h-none md:grid-cols-5 md:overflow-visible md:pr-0">
            {attachmentDrafts.map((draft) => (
              <div
                className="group/attachment relative aspect-square overflow-hidden rounded-[20px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.42)]"
                data-filename={draft.filename}
                data-status={draft.status}
                data-testid="attachment-draft"
                key={draft.localId}
              >
                {draft.kind === "image" && draft.previewUrl ? (
                  <img
                    alt={draft.attachment?.filename ?? t("chat.attachments.imagePreview")}
                    className="h-full w-full object-cover"
                    src={draft.attachment?.url ?? draft.previewUrl}
                  />
                ) : draft.kind === "video" && draft.previewUrl ? (
                  <video
                    className="h-full w-full bg-black object-cover"
                    muted
                    playsInline
                    preload="metadata"
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
                {draft.kind === "video" ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/86 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-sm backdrop-blur">
                    <Video className="h-3 w-3" />
                    {t("chat.attachments.video")}
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
            <span data-testid="attachment-upload-error">
            {attachmentUploadError}
            </span>
          </div>
        ) : null}

        <div className="relative flex flex-col">
          <div className="relative flex-1">
            {showFormattingToolbar ? (
              <div
                aria-label={t("chat.input.formatting")}
                className={cn(
                  "flex flex-wrap items-center gap-1.5 rounded-t-[20px] border border-b-0 border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card)/0.94)] p-1.5 shadow-[inset_0_1px_0_hsl(var(--background)/0.52)]",
                  isThreadComposer ? "max-h-36 overflow-y-auto" : "",
                )}
                data-testid="message-formatting-toolbar"
                role="toolbar"
              >
                <button
                  aria-label={t("chat.input.bold")}
                  className={formattingActionButtonClass}
                  onClick={() => insertMarkdownWrap("**", "**", t("chat.input.boldFallback"))}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Bold className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">{t("chat.input.bold")}</span>
                </button>
                <button
                  aria-label={t("chat.input.italic")}
                  className={formattingActionButtonClass}
                  onClick={() => insertMarkdownWrap("_", "_", t("chat.input.italicFallback"))}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Italic className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">{t("chat.input.italic")}</span>
                </button>
                <button
                  aria-label={t("chat.input.underline")}
                  className={formattingActionButtonClass}
                  onClick={() =>
                    insertMarkdownWrap("++", "++", t("chat.input.underlineFallback"))
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Underline className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">{t("chat.input.underline")}</span>
                </button>
                <button
                  aria-label={t("chat.input.strikethrough")}
                  className={formattingActionButtonClass}
                  onClick={() =>
                    insertMarkdownWrap("~~", "~~", t("chat.input.strikethroughFallback"))
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Strikethrough className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">
                    {t("chat.input.strikethrough")}
                  </span>
                </button>
                <button
                  aria-label={t("chat.input.bulletedList")}
                  className={formattingActionButtonClass}
                  onClick={() => insertPrefixedLines("- ", t("chat.input.listFallback"))}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <List className="h-4 w-4" />
                  <span>{t("chat.input.bulletedList")}</span>
                </button>
                <button
                  aria-label={t("chat.input.orderedList")}
                  className={formattingActionButtonClass}
                  onClick={insertOrderedList}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <ListOrdered className="h-4 w-4" />
                  <span>{t("chat.input.orderedList")}</span>
                </button>
                <button
                  aria-label={t("chat.input.quote")}
                  className={formattingActionButtonClass}
                  onClick={() => insertPrefixedLines("> ", t("chat.input.quoteFallback"))}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Quote className="h-4 w-4" />
                  <span>{t("chat.input.quote")}</span>
                </button>
                <button
                  aria-label={t("chat.input.inlineCode")}
                  className={formattingActionButtonClass}
                  onClick={() => insertMarkdownWrap("`", "`", t("chat.input.codeFallback"))}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Code2 className="h-4 w-4" />
                  <span>{t("chat.input.inlineCode")}</span>
                </button>
                <button
                  aria-label={t("chat.input.codeBlock")}
                  className={formattingActionButtonClass}
                  onClick={insertCodeBlock}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <Braces className="h-4 w-4" />
                  <span>{t("chat.input.codeBlock")}</span>
                </button>
                <button
                  aria-label={t("chat.input.poll")}
                  className={cn(
                    formattingActionButtonClass,
                    "border-[hsl(var(--primary)/0.26)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]",
                  )}
                  onClick={insertPollTemplate}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  <ChartNoAxesColumnIncreasing className="h-4 w-4" />
                  <span>{t("chat.input.poll")}</span>
                </button>
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onClick={(event) =>
                setSelectionIndex(event.currentTarget.selectionStart ?? content.length)
              }
              onKeyDown={handleKeyDown}
              onKeyUp={(event) =>
                setSelectionIndex(event.currentTarget.selectionStart ?? content.length)
              }
              onPaste={handlePaste}
              onSelect={(event) =>
                setSelectionIndex(event.currentTarget.selectionStart ?? content.length)
              }
              placeholder={
                disabled
                  ? disabledMessage
                  : mode === "dm"
                    ? t("dm.input.placeholder")
                    : t("chat.input.placeholder")
              }
              disabled={disabled}
              data-testid="message-input"
              className={cn(
                "message-font-scope w-full resize-none border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-overlay)/0.52)] px-4 py-3 pr-4 text-[15px] leading-7 text-app-foreground shadow-[inset_0_1px_0_hsl(var(--background)/0.55)] placeholder-app-muted focus-visible:border-[hsl(var(--primary)/0.34)] focus-visible:bg-[hsl(var(--surface-card)/0.96)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.16)]",
                showFormattingToolbar
                  ? "rounded-b-[22px] rounded-t-none"
                  : "rounded-[22px]",
                isThreadComposer
                  ? "max-h-[8.5rem] min-h-[4.75rem]"
                  : "max-h-[12rem] min-h-[6.25rem] md:min-h-[6.75rem]",
              )}
              maxLength={hasFiniteMaxLength ? effectiveMaxLength : undefined}
              rows={1}
            />

            {activeMention && mode === "channel" && !disabled ? (
              <div
                className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-full max-w-sm rounded-[24px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.96)] p-2 shadow-[0_20px_50px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl"
                data-testid="mention-suggestions"
              >
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-soft">
                  {t("chat.mentions.title")}
                </p>
                {mentionSuggestions.length > 0 ? (
                  <div className="space-y-1">
                    {mentionSuggestions.map((member, index) => {
                      const name = member.displayName ?? member.username;
                      return (
                        <button
                          className={`flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left transition ${
                            index === activeMentionIndex
                              ? "bg-[hsl(var(--primary)/0.12)] text-app-foreground"
                              : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.62)] hover:text-app-foreground"
                          }`}
                          data-testid={`mention-suggestion-${member.username}`}
                          key={member.userId}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            insertMention(member);
                          }}
                          type="button"
                        >
                          <Avatar
                            alt={name}
                            className="h-8 w-8 text-[11px]"
                            fallback={name}
                            src={member.avatarUrl}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{name}</span>
                            <span className="block truncate text-xs text-app-soft">
                              @{member.username}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-2 py-3 text-sm font-medium text-app-muted">
                    {t("chat.mentions.empty")}
                  </p>
                )}
              </div>
            ) : null}

            <div
              className={cn(
                "mt-2 flex flex-wrap items-center justify-between gap-2.5 border-t border-[hsl(var(--border)/0.5)] px-1 pt-2.5",
                isThreadComposer ? "gap-2" : "md:gap-3 md:px-2",
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  accept={MESSAGE_ATTACHMENT_ACCEPT}
                  className="hidden"
                  data-testid="message-file-input"
                  disabled={disabled || !allowFileUploads}
                  multiple
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  type="file"
                />

                <button
                  aria-expanded={showFormattingToolbar}
                  aria-label={t("chat.input.toggleFormatting")}
                  className={cn(
                    compactToolButtonClass,
                    showFormattingToolbar
                      ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))] shadow-[0_12px_26px_hsl(var(--primary)/0.12)]"
                      : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] text-app-muted hover:text-app-foreground",
                  )}
                  data-testid="message-formatting-toggle"
                  onClick={() => setShowFormattingToolbar((current) => !current)}
                  title={t("chat.input.toggleFormatting")}
                  type="button"
                >
                  <span className="text-[13px] font-black tracking-[-0.04em]">Aa</span>
                  <span className={formatButtonLabelClass}>{t("chat.input.formatting")}</span>
                </button>

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
                      if (disabled) {
                        setAttachmentUploadError(disabledMessage);
                        return;
                      }
                      setShowGifPicker(false);
                      setShowEmojiPicker((current) => !current);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={cn(
                      compactToolButtonClass,
                      "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] text-app-muted hover:text-app-foreground",
                    )}
                    aria-label={t("chat.input.openEmojiPicker")}
                    data-testid="emoji-picker-button"
                    disabled={disabled}
                    type="button"
                  >
                    <Smile className="h-4 w-4" />
                    <span className={formatButtonLabelClass}>
                      {t("chat.input.openEmojiPicker")}
                    </span>
                  </button>
                </div>

                <div className="relative inline-flex">
                  {showGifPicker && allowGifs && !disabled ? (
                    <GifPicker
                      onClose={() => setShowGifPicker(false)}
                      onSelect={handleGifSelect}
                    />
                  ) : null}
                  <button
                    aria-label={t("chat.gifs.openPicker")}
                    className={cn(
                      compactToolButtonClass,
                      "border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.26)] text-app-soft hover:border-[hsl(var(--primary)/0.38)] hover:text-app-foreground",
                    )}
                    data-testid="gif-picker-button"
                    disabled={!allowGifs || disabled}
                    onClick={() => {
                      if (disabled) {
                        setAttachmentUploadError(disabledMessage);
                        return;
                      }
                      if (!allowGifs) {
                        setAttachmentUploadError(t("chat.gifs.disabled"));
                        return;
                      }
                      setShowEmojiPicker(false);
                      setShowGifPicker((current) => !current);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    title={
                      disabled
                        ? disabledMessage
                        : allowGifs
                          ? t("chat.gifs.openPicker")
                          : t("chat.gifs.disabled")
                    }
                    type="button"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className={formatButtonLabelClass}>{t("chat.attachments.gif")}</span>
                  </button>
                </div>

                <button
                  aria-label={t("chat.attachments.attachFile")}
                  className={cn(
                    compactToolButtonClass,
                    "border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.26)] text-app-soft hover:border-[hsl(var(--primary)/0.38)] hover:text-app-foreground",
                  )}
                  data-testid="message-file-button"
                  disabled={!allowFileUploads || disabled}
                  onClick={() => {
                    if (disabled) {
                      setAttachmentUploadError(disabledMessage);
                      return;
                    }

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
                    disabled
                      ? disabledMessage
                      : !allowFileUploads
                      ? t("chat.attachments.disabled")
                      : uploadthingEnabled
                      ? t("chat.attachments.attachFile")
                      : t("chat.attachments.uploadNotConfigured")
                  }
                  type="button"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className={formatButtonLabelClass}>
                    {t("chat.attachments.attachFile")}
                  </span>
                </button>
              </div>

              <div
                className={cn(
                  "ml-auto flex items-center gap-3",
                  isThreadComposer ? "w-full justify-between" : "",
                )}
              >
                <span
                  className={cn(
                    "whitespace-nowrap text-xs font-semibold",
                    hasFiniteMaxLength && content.length > effectiveMaxLength * 0.9
                      ? "text-app-danger"
                      : "text-app-muted",
                  )}
                >
                  {hasFiniteMaxLength
                    ? `${content.length}/${effectiveMaxLength}`
                    : t("chat.input.adminUnlimited")}
                </span>

                <button
                  onClick={handleSend}
                  disabled={disabled}
                  aria-disabled={!canSend}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-[18px] border border-[hsl(var(--primary)/0.32)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.94),hsl(var(--primary))_50%,hsl(var(--ambient-1)/0.9))] px-4 text-sm font-extrabold text-white shadow-[0_16px_34px_hsl(var(--primary)/0.26),inset_0_1px_0_rgba(255,255,255,0.28)] ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:scale-[1.012] hover:shadow-[0_20px_48px_hsl(var(--primary)/0.34),inset_0_1px_0_rgba(255,255,255,0.34)] hover:saturate-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.58)] disabled:cursor-not-allowed disabled:opacity-75",
                    !canSend && !disabled ? "saturate-[0.92]" : "",
                    isThreadComposer
                      ? "h-10 min-w-[8rem]"
                      : "h-11 min-w-[9.25rem] md:min-w-[9.75rem]",
                  )}
                  aria-label={t("chat.input.sendMessage")}
                  data-testid="message-send-button"
                  type="button"
                >
                  <span className={isThreadComposer ? "inline" : "hidden sm:inline"}>
                    {t("chat.input.sendMessage")}
                  </span>
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
