"use client";

/* eslint-disable @next/next/no-img-element */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartNoAxesColumnIncreasing,
  Code2,
  Slash,
  FileText,
  ImageIcon,
  ImagePlus,
  Loader2,
  BarChart3,
  Paperclip,
  Plus,
  Send,
  Smile,
  Video,
  X,
} from "lucide-react";
import type {
  MessageAttachment,
  UploadedAttachmentInput,
  WorkspaceMember,
  WorkspaceRole,
} from "@wizards/types";
import { ComposerFormattingBar } from "./composer-formatting-bar";
import { EmojiPicker } from "./emoji-picker";
import { GifPicker } from "./gif-picker";
import { ReplyPreview } from "./reply-preview";
import { VoiceRecorder, type VoiceRecording } from "./voice-recorder";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { filterRolesByMentionQuery } from "@/lib/workspace/mention-parser";
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
import {
  matchesAppShortcut,
  resolveAppShortcut,
  type AppShortcutId,
} from "@/lib/shortcuts/catalog";
import { useUploadThing } from "@/lib/uploadthing";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * SPEC §5.6'nın üç biçimlendirme eylemi. Tuş eşleşmesi merkezi uygulama kataloğunda;
 * burada yalnız eylemin metne hangi işaretçiyi yazdığı tutulur.
 *
 * İşaretçiler biçimlendirme şeridindekiyle aynı: kalın `**`, italik `_`, altı
 * çizili `++`. Şerit ile kısayol farklı işaretçi kullansaydı, aynı düğmenin iki
 * yolu iki farklı metin yazardı.
 */
const COMPOSER_FORMATTING_SHORTCUT_IDS = [
  "composer.bold",
  "composer.italic",
  "composer.underline",
] as const satisfies readonly AppShortcutId[];

const FORMATTING_SHORTCUTS: Readonly<
  Record<
    (typeof COMPOSER_FORMATTING_SHORTCUT_IDS)[number],
    {
      fallbackKey:
        "chat.input.boldFallback" | "chat.input.italicFallback" | "chat.input.underlineFallback";
      marker: string;
    }
  >
> = Object.freeze({
  "composer.bold": { fallbackKey: "chat.input.boldFallback", marker: "**" },
  "composer.italic": { fallbackKey: "chat.input.italicFallback", marker: "_" },
  "composer.underline": { fallbackKey: "chat.input.underlineFallback", marker: "++" },
});

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
  /**
   * Bahsedilmeler Ş2 / karar K1. Bahsedilebilir roller üye önerisinin **altında** ayrı bir
   * bölüm olarak çıkar. Liste çağıranda süzülür: bestekar izin bilmez, yalnız verileni çizer.
   */
  mentionRoles?: WorkspaceRole[];
  uploadthingEnabled: boolean;
  maxLength?: number | null;
  /**
   * Mesajlar karar #1. Bestekar anket **modalını bilmez**; yalnız düğmeyi çizer
   * ve bunu çağırır. Ş6 modalı kendi dosyasında tutuyor.
   */
  onOpenPoll?: (() => void) | undefined;
  /** SPEC §5.6 placeholder'ı için hedefin adı; verilmezse genel cümleye düşer. */
  conversationName?: string | undefined;
  /** `group` ise `{ad} grubuna yaz`, değilse `{ad}'e mesaj yaz`. */
  conversationKind?: "dm" | "group" | undefined;
  /** karar #12: anket hem grupta hem 1:1 DM'de. */
  pollEnabled?: boolean;
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

type ComposerButtonVariant = "primary" | "tool" | "ghost";

type ComposerButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  active?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  title?: string;
  variant?: ComposerButtonVariant;
};

function ComposerButton({
  active = false,
  className,
  children,
  disabled,
  icon: Icon,
  label,
  title,
  type = "button",
  variant = "tool",
  ...props
}: ComposerButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        "group/composer-button inline-flex h-11 min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-2xl border-0 text-sm font-bold transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-55 motion-safe:transition-transform",
        variant === "primary"
          ? "bg-[hsl(var(--primary))] text-white motion-safe:hover:scale-[1.025] hover:brightness-110"
          : variant === "ghost"
            ? "bg-transparent text-app-muted hover:bg-[hsl(var(--surface-soft)/0.64)] hover:text-app-foreground"
            : "bg-[hsl(var(--surface-soft)/0.34)] text-app-muted hover:bg-[hsl(var(--primary)/0.08)] hover:text-[hsl(var(--primary))]",
        active &&
          variant !== "primary" &&
          "bg-[hsl(var(--primary)/0.13)] text-[var(--primary-readable)]",
        disabled && "motion-safe:hover:scale-100",
        className,
      )}
      disabled={disabled}
      title={title ?? label}
      type={type}
      {...props}
    >
      {Icon ? <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function ComposerActionSheet({
  children,
  onClose,
  open,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] md:hidden">
      <button
        aria-label={title}
        className="absolute inset-0 cursor-default bg-[hsl(var(--backdrop)/0.38)] backdrop-blur-xs"
        onClick={onClose}
        type="button"
      />
      <div className="absolute inset-x-2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[min(70dvh,28rem)] overflow-y-auto rounded-[1.5rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.98)] p-2.5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.18)]">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-app-soft">{title}</p>
          <button
            aria-label={title}
            className="rounded-full p-2 text-app-muted transition hover:bg-app-surface-soft hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">{children}</div>
      </div>
    </div>
  );
}

type AutoResizeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  formattingOpen?: boolean;
  isThreadComposer?: boolean;
};

const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  function AutoResizeTextarea(
    { className, formattingOpen = false, isThreadComposer = false, ...props },
    ref,
  ) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "message-composer-textarea message-font-scope max-h-[32dvh] min-h-11 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-[0.9375rem] leading-6 text-app-foreground shadow-none placeholder-app-muted focus-visible:outline-hidden focus-visible:ring-0 md:max-h-40 md:px-3 md:py-2.5",
          formattingOpen ? "rounded-b-[1.375rem] rounded-t-none" : "rounded-[1.375rem]",
          isThreadComposer ? "max-h-[8.5rem]" : "",
          className,
        )}
        rows={1}
        {...props}
      />
    );
  },
);

/**
 * SPEC-SUNUCU §3.4'ün ölçüleri. `null` dönen çağrılar DM yolundadır: orada Mesajlar paketinin
 * sınıfları geçerli ve bu şerit onlara dokunmuyor.
 */
const { composer: serverComposerMetrics } = SERVER_METRICS;

function serverComposerOuterStyle(active: boolean): React.CSSProperties | undefined {
  return active
    ? {
        paddingBottom: pxToRem(serverComposerMetrics.paddingBottom),
        paddingInline: pxToRem(serverComposerMetrics.paddingX),
        paddingTop: 0,
      }
    : undefined;
}

function serverComposerBoxStyle(active: boolean): React.CSSProperties | undefined {
  return active
    ? {
        borderRadius: pxToRem(serverComposerMetrics.boxRadius),
        gap: pxToRem(serverComposerMetrics.boxGap),
        padding: `${pxToRem(serverComposerMetrics.boxPaddingY)} ${pxToRem(
          serverComposerMetrics.boxPaddingX,
        )}`,
      }
    : undefined;
}

function serverComposerSquareStyle(
  active: boolean,
  size: number,
  radius: number,
): React.CSSProperties | undefined {
  return active
    ? {
        borderRadius: pxToRem(radius),
        height: pxToRem(size),
        minHeight: pxToRem(size),
        minWidth: pxToRem(size),
        width: pxToRem(size),
      }
    : undefined;
}

function messageSendButtonStyle(): React.CSSProperties {
  return {
    ...serverComposerSquareStyle(
      true,
      serverComposerMetrics.sendSize,
      serverComposerMetrics.sendRadius,
    ),
    background: "hsl(var(--primary))",
    boxShadow: `${pxToRem(serverComposerMetrics.sendShadow.x)} ${pxToRem(
      serverComposerMetrics.sendShadow.y,
    )} ${pxToRem(serverComposerMetrics.sendShadow.blur)} ${pxToRem(
      serverComposerMetrics.sendShadow.spread,
    )} hsl(var(--primary))`,
    marginLeft: pxToRem(serverComposerMetrics.sendMarginLeft),
  };
}

export function ChatComposer({
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
  mentionRoles = [],
  uploadthingEnabled,
  maxLength = MAX_MESSAGE_LENGTH,
  onOpenPoll,
  conversationName,
  conversationKind,
  pollEnabled = false,
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
  const [isUploadingVoiceMessage, setIsUploadingVoiceMessage] = useState(false);
  const [isVoiceRecorderActive, setIsVoiceRecorderActive] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const [mentionSelection, setMentionSelection] = useState({
    index: 0,
    query: null as string | null,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const isThreadComposer = variant === "thread";
  /**
   * Ş6 · SPEC-SUNUCU §3.4. Sunucu kanalının bestekarı da **tek satırlık** düzeni kullanır:
   * `9px 12px` kutu, `r15`, solda `34 r11` dosya düğmesi, sağda `Aa` · emoji · `GIF` ve
   * `36 r12` gönder. Mesajlar paketi bu düzeni zaten çizdi (`referenceComposer`); ikinci bir
   * kopya yazmak iki bestekarın ilk düzenlemede ayrışması olurdu. Geometri farkı tek yerde:
   * kanal yolunda ölçüler `SERVER_METRICS.composer`dan satır içi `style` ile veriliyor,
   * DM yolu **hiç değişmiyor**.
   */
  const serverComposer = mode === "channel" && !isThreadComposer;
  const referenceComposer = (mode === "dm" || serverComposer) && !isThreadComposer;
  const effectiveMaxLength = maxLength ?? Number.POSITIVE_INFINITY;
  const hasFiniteMaxLength = Number.isFinite(effectiveMaxLength);

  const readyAttachmentDrafts = useMemo(
    () =>
      attachmentDrafts.filter(
        (
          draft,
        ): draft is AttachmentDraft & {
          attachment: MessageAttachment;
          input: UploadedAttachmentInput;
        } => draft.status === "ready" && Boolean(draft.attachment) && Boolean(draft.input),
      ),
    [attachmentDrafts],
  );
  const hasUploadingAttachments = attachmentDrafts.some((draft) => draft.status === "uploading");
  const disabledMessage = disabledReason ?? t("chat.input.disabled");
  const canSend =
    (content.trim().length > 0 || readyAttachmentDrafts.length > 0) &&
    content.length <= effectiveMaxLength &&
    !hasUploadingAttachments &&
    !isUploadingAttachments &&
    !isVoiceRecorderActive &&
    !isUploadingVoiceMessage &&
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
  /**
   * Eşleşme sunucu tarafıyla **aynı** fonksiyondan geçer: öneri listesiyle fan-out'un rol
   * çözümü ayrışırsa, kullanıcı listede gördüğü rolü yazar ve kimse bildirim almaz.
   */
  const roleSuggestions = useMemo(() => {
    if (!activeMention || mode !== "channel") {
      return [];
    }

    return filterRolesByMentionQuery(mentionRoles, activeMention.query);
  }, [activeMention, mentionRoles, mode]);
  /** Klavye gezinmesi tek listede yürür; roller üyelerin altında durur. */
  const mentionOptionCount = mentionSuggestions.length + roleSuggestions.length;
  const activeMentionIndex =
    mentionSelection.query === activeMention?.query ? mentionSelection.index : 0;
  const emojiPickerOpen = showEmojiPicker && !disabled;
  const gifPickerOpen = showGifPicker && allowGifs && !disabled;
  const actionSheetOpen = isActionSheetOpen && !disabled;
  const composerFocused = isFocused && !disabled;

  const formatButtonLabelClass = isThreadComposer ? "sr-only" : "hidden sm:inline";
  const compactToolButtonClass = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[0.875rem] border-0 bg-[hsl(var(--surface-soft)/0.3)] text-[0.78125rem] font-semibold text-app-muted transition hover:bg-[hsl(var(--primary)/0.08)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.44)] disabled:cursor-not-allowed disabled:opacity-55",
    isThreadComposer ? "h-9 w-9 px-0" : "min-h-8 px-2.5 py-1.5 md:min-h-0",
  );
  const composerHint = t("chat.input.sendHint");
  const composerActionsTitle = t("chat.input.actions");

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const viewportHeight = typeof window === "undefined" ? 900 : Math.max(window.innerHeight, 480);
    const maxHeight = isThreadComposer ? 136 : Math.min(160, viewportHeight * 0.35);

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [isThreadComposer]);

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
      resizeTextarea();
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
    insertMarkdownWrap("```text\n", "\n```", t("chat.input.codeBlockFallback"));
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

    resizeTextarea();
  };

  const insertMention = (name: string) => {
    if (!activeMention) {
      return;
    }

    const mentionText = `@${name} `;
    const nextContent =
      content.slice(0, activeMention.start) + mentionText + content.slice(activeMention.end);
    const nextCursor = activeMention.start + mentionText.length;

    setContent(nextContent);
    setMentionSelection({ index: 0, query: null });
    setSelectionIndex(nextCursor);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      resizeTextarea();
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
          if (!serverData.url) {
            return {
              ...draft,
              error: t("chat.attachments.uploadFailed"),
              status: "error" as const,
            };
          }

          const measuredDimensions = dimensions[draftIndex] ?? {};
          const attachment: MessageAttachment = {
            id: serverData.id,
            url: serverData.url,
            filename: serverData.filename,
            contentType: serverData.contentType,
            size: serverData.size,
            duration: serverData.duration ?? undefined,
            thumbnailUrl: serverData.thumbnailUrl ?? undefined,
            scanStatus: serverData.scanStatus,
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
            nextDraft.previewUrl = serverData.url;
          }

          if (draft.kind === "video") {
            nextDraft.previewUrl = serverData.url;
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

    if (!payload.attachment.url) {
      setAttachmentUploadError(t("chat.attachments.uploadFailed"));
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
    const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;

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

  /**
   * Kaydı yükler ve **kendi başına** gönderir.
   *
   * Sesli mesaj bestekârın taslağına eklenmez: kullanıcı kaydı bitirip
   * "gönder"e bastığında niyeti zaten göndermek. Taslağa koymak, yazılmış bir
   * metinle birlikte gönderilmeyi bekleyen ve unutulabilecek bir ek bırakırdı.
   *
   * Yazılmış metin varsa korunur — kayıt onun yerine geçmez.
   */
  const handleVoiceRecorded = async (recording: VoiceRecording) => {
    if (!uploadthingEnabled) {
      setAttachmentUploadError(t("messages.errors.voiceFailed"));
      return;
    }

    setIsUploadingVoiceMessage(true);
    setAttachmentUploadError(null);

    try {
      const file = new File([recording.blob], recording.filename, { type: recording.mimeType });
      const uploaded = await startUpload([file]);
      const serverData = uploaded?.[0]?.serverData;

      if (!serverData?.url) {
        throw new Error(t("messages.errors.voiceFailed"));
      }

      const durationSeconds = Math.max(1, Math.round(recording.durationMs / 1000));
      const attachment: MessageAttachment = {
        id: serverData.id,
        url: serverData.url,
        filename: serverData.filename,
        contentType: serverData.contentType,
        size: serverData.size,
        duration: durationSeconds,
        // İyimser balonun dalga formu da gerçek: sunucudan dönmesini beklemek,
        // kendi kaydını bir saniye boyunca düz çubuk olarak görmek demek.
        waveform: recording.waveform.join(","),
        scanStatus: serverData.scanStatus,
      };

      onSend(
        content.trim(),
        replyTo?.id,
        [{ id: attachment.id, duration: durationSeconds, waveform: recording.waveform }],
        [attachment],
      );

      setContent("");
      onCancelReply();
    } catch (error) {
      setAttachmentUploadError(
        error instanceof Error ? error.message : t("messages.errors.voiceFailed"),
      );
    } finally {
      setIsUploadingVoiceMessage(false);
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
    setIsActionSheetOpen(false);

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (isComposing || nativeEvent.isComposing) {
      return;
    }

    if (disabled) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
      }
      return;
    }

    if (mentionOptionCount > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionSelection({
          index: (activeMentionIndex + 1) % mentionOptionCount,
          query: activeMention?.query ?? null,
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionSelection({
          index: (activeMentionIndex - 1 + mentionOptionCount) % mentionOptionCount,
          query: activeMention?.query ?? null,
        });
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        const index = activeMentionIndex < mentionOptionCount ? activeMentionIndex : 0;
        const member = mentionSuggestions[index];
        const role = roleSuggestions[index - mentionSuggestions.length];
        if (member) {
          insertMention(member.username);
        } else if (role) {
          insertMention(role.name);
        }
        return;
      }
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
      return;
    }

    if (
      content.length === 0 &&
      !replyTo &&
      matchesAppShortcut("message.editLast", event, { allowInTypingTarget: true })
    ) {
      const messageContext = isThreadComposer ? "thread" : "main";
      const editableMessages = Array.from(
        document.querySelectorAll<HTMLElement>('[data-message-editable="true"]'),
      ).filter(
        (message) =>
          message.dataset.messageConversationId === conversationId &&
          message.dataset.messageContext === messageContext,
      );
      const lastEditableMessage = editableMessages.at(-1);
      const editButton = lastEditableMessage?.querySelector<HTMLButtonElement>(
        '[data-message-shortcut-action="edit"]',
      );

      if (editButton) {
        event.preventDefault();
        editButton.click();
        return;
      }
    }

    /*
     * SPEC §5.6 / §10: `Ctrl/Cmd+B|I|U`.
     *
     * Katalog `altKey` değerini dışlar: `AltGr` Türkçe ve birçok Avrupa düzeninde `Ctrl+Alt`
     * olarak gelir. `AltGr+B` yazmak isteyen birine kalın metin açmak yazdığını bozardı.
     */
    const formattingShortcutId = resolveAppShortcut(COMPOSER_FORMATTING_SHORTCUT_IDS, event);
    if (formattingShortcutId) {
      const shortcut = FORMATTING_SHORTCUTS[formattingShortcutId];

      event.preventDefault();
      insertMarkdownWrap(shortcut.marker, shortcut.marker, t(shortcut.fallbackKey));
      return;
    }

    /*
     * `Esc` yanıt ya da düzenlemeyi iptal eder (§10).
     *
     * Yalnız yanıt açıkken tüketilir: boş bir bestekârda `Esc`'i yutmak, üstteki
     * paneli ya da modalı kapatmak isteyen kullanıcının tuşunu kaybetmesi olurdu.
     */
    if (event.key === "Escape" && replyTo) {
      event.preventDefault();
      onCancelReply();
      return;
    }

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
    if (disabled) {
      stopTyping();
    }
  }, [disabled, stopTyping]);

  useEffect(() => {
    if (!actionSheetOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsActionSheetOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionSheetOpen]);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [autoFocus, conversationId, disabled, mode]);

  /*
   * SPEC §5.6: DM'de `{ad}'e mesaj yaz`, grupta `{ad} grubuna yaz`.
   *
   * Hedefin adı çağırandan geliyor; bestekâr konuşmayı bilmiyor ve bilmemeli.
   * Ad verilmediğinde eski genel cümleye düşüyor — yoksa isim gelene kadar
   * placeholder boş bir tırnak gibi görünürdü.
   */
  const placeholder = disabled
    ? disabledMessage
    : conversationName && mode === "dm"
      ? t(
          conversationKind === "group"
            ? "messages.composer.placeholderGroup"
            : "messages.composer.placeholderDm",
          { name: conversationName },
        )
      : mode === "dm"
        ? t("dm.input.placeholder")
        : conversationName
          ? // SPEC-SUNUCU §3.4 — `#surum-notlari kanalına yaz`. Kanal adı çağırandan gelir;
            // bestekâr kanalı bilmez ve bilmemeli (Mesajlar §5.6 ile aynı gerekçe).
            t("server.channel.composer.placeholder", { channel: conversationName })
          : t("chat.input.placeholder");

  const characterCounter = hasFiniteMaxLength ? (
    <span
      className={cn(
        "whitespace-nowrap text-xs font-semibold",
        content.length > effectiveMaxLength * 0.9 ? "text-app-danger" : "text-app-muted",
      )}
    >
      {`${content.length}/${effectiveMaxLength}`}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.48)] px-2.5 py-1.5 text-[0.6875rem] font-semibold text-app-muted shadow-[inset_0_1px_0_hsl(var(--background)/0.55)]">
      {t("chat.input.adminUnlimited")}
    </span>
  );

  const composerShortcutHint = (
    <span
      aria-label={composerHint}
      className="hidden min-w-0 items-center gap-2 whitespace-nowrap text-[0.6875rem] font-semibold text-app-muted xl:inline-flex"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.48)] px-2.5 py-1.5 shadow-[inset_0_1px_0_hsl(var(--background)/0.55)]">
        <kbd className="rounded-md border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.94)] px-1.5 py-0.5 font-sans text-[0.625rem] font-black leading-none text-app-foreground shadow-xs">
          Enter
        </kbd>
        <span>{t("chat.input.enterToSend")}</span>
      </span>
      <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" aria-hidden="true" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.48)] px-2.5 py-1.5 shadow-[inset_0_1px_0_hsl(var(--background)/0.55)]">
        <kbd className="rounded-md border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.94)] px-1.5 py-0.5 font-sans text-[0.625rem] font-black leading-none text-app-foreground shadow-xs">
          Shift
        </kbd>
        <span className="text-app-soft">+</span>
        <kbd className="rounded-md border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.94)] px-1.5 py-0.5 font-sans text-[0.625rem] font-black leading-none text-app-foreground shadow-xs">
          Enter
        </kbd>
        <span>{t("chat.input.shiftEnterNewLine")}</span>
      </span>
    </span>
  );

  const openFilePicker = () => {
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

    setIsActionSheetOpen(false);
    fileInputRef.current?.click();
  };

  const toggleEmojiPicker = () => {
    if (disabled) {
      setAttachmentUploadError(disabledMessage);
      return;
    }

    setIsActionSheetOpen(false);
    setShowGifPicker(false);
    setShowEmojiPicker((current) => !current);
  };

  const toggleGifPicker = () => {
    if (disabled) {
      setAttachmentUploadError(disabledMessage);
      return;
    }
    if (!allowGifs) {
      setAttachmentUploadError(t("chat.gifs.disabled"));
      return;
    }

    setIsActionSheetOpen(false);
    setShowEmojiPicker(false);
    setShowGifPicker((current) => !current);
  };

  const insertSlashCommand = () => {
    if (disabled) {
      return;
    }

    const { end, start } = getCurrentSelection();
    const nextContent = content.slice(0, start) + "/" + content.slice(end);
    updateContentWithSelection(nextContent, start + 1);
    setIsActionSheetOpen(false);
  };

  const actionSheetButtonClass =
    "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.94)] px-1.5 py-2 text-center text-[0.625rem] font-bold leading-tight text-app-muted shadow-[0_8px_18px_hsl(var(--shadow-color)/0.045)] transition hover:border-[hsl(var(--primary)/0.26)] hover:bg-[hsl(var(--primary)/0.08)] hover:text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-not-allowed disabled:opacity-55";
  const formattingPollProps = pollEnabled && onOpenPoll ? { onOpenPoll } : {};

  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 bg-transparent backdrop-blur-xl md:static",
        isThreadComposer
          ? "space-y-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:p-3"
          : referenceComposer
            ? "space-y-1.5 px-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1.5 md:px-[1.375rem] md:pb-[1.125rem]"
            : "space-y-1.5 p-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] md:px-3 md:pb-3 md:pt-1.5",
      )}
      data-testid="message-composer"
      data-composer-surface={serverComposer ? "server" : undefined}
      data-composer-variant={isThreadComposer ? "thread" : "default"}
      style={serverComposerOuterStyle(serverComposer)}
      data-disabled={disabled ? "true" : undefined}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />

      <div
        className={cn(
          "relative",
          !referenceComposer &&
            "border border-[hsl(var(--border)/0.44)] bg-[hsl(var(--surface-card)/0.94)] shadow-[0_10px_30px_hsl(var(--shadow-color)/0.055),inset_0_1px_0_hsl(var(--background)/0.5)] transition-colors duration-150",
          !referenceComposer &&
            composerFocused &&
            "border-[hsl(var(--primary)/0.38)] shadow-[0_14px_38px_hsl(var(--primary)/0.095),inset_0_1px_0_hsl(var(--background)/0.62)]",
          referenceComposer
            ? ""
            : isThreadComposer
              ? "rounded-[1.125rem] p-2"
              : "rounded-[1.25rem] p-2 md:rounded-[1.375rem] md:p-3",
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
          <div className="absolute inset-2 z-20 flex items-center justify-center rounded-[1.5rem] border border-dashed border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.12)] text-center shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.1)] backdrop-blur-xl">
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
          <div className="mb-2 grid max-h-[34dvh] grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 md:max-h-none md:grid-cols-5 md:gap-2 md:overflow-visible md:pr-0">
            {attachmentDrafts.map((draft) => (
              <div
                className="group/attachment relative aspect-square overflow-hidden rounded-[1.25rem] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.42)]"
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.65)] bg-white/68 text-app-soft shadow-xs">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="line-clamp-2 break-all text-xs font-semibold text-app-foreground">
                        {draft.filename}
                      </p>
                      <p className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-app-soft">
                        {formatAttachmentSize(draft.size)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/45 via-transparent to-black/12 opacity-80" />
                {draft.kind === "file" ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/86 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--foreground))] shadow-xs backdrop-blur">
                    <Paperclip className="h-3 w-3" />
                    {t("chat.attachments.file")}
                  </span>
                ) : null}
                {draft.kind === "video" ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/86 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--foreground))] shadow-xs backdrop-blur">
                    <Video className="h-3 w-3" />
                    {t("chat.attachments.video")}
                  </span>
                ) : null}
                {isMessageGifContentType(draft.contentType) ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/86 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--foreground))] shadow-xs backdrop-blur">
                    <ImageIcon className="h-3 w-3" />
                    {t("chat.attachments.gif")}
                  </span>
                ) : null}
                {draft.status === "uploading" ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/88 px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] shadow-xs">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("chat.attachments.uploadingAttachment")}
                    </span>
                  </div>
                ) : null}
                {draft.status === "error" ? (
                  <div className="absolute inset-x-2 bottom-2 rounded-full bg-[hsl(var(--danger)/0.92)] px-2 py-1 text-center text-[0.625rem] font-semibold text-white shadow-xs">
                    {draft.error ?? t("chat.attachments.uploadFailed")}
                  </div>
                ) : null}
                <button
                  aria-label={t("chat.attachments.removeAttachment")}
                  className="absolute right-2 top-2 rounded-full border border-white/50 bg-white/88 p-1.5 text-[hsl(var(--foreground))] opacity-100 shadow-xs transition hover:bg-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
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
            <span data-testid="attachment-upload-error">{attachmentUploadError}</span>
          </div>
        ) : null}

        <div className="relative z-40">
          {emojiPickerOpen ? (
            <EmojiPicker
              onSelect={(emoji) => {
                setContent((current) => current + emoji);
                setShowEmojiPicker(false);
                window.requestAnimationFrame(resizeTextarea);
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          ) : null}
          {gifPickerOpen ? (
            <GifPicker onClose={() => setShowGifPicker(false)} onSelect={handleGifSelect} />
          ) : null}
        </div>

        <div className="relative flex flex-col">
          {referenceComposer && showFormattingToolbar ? (
            <ComposerFormattingBar
              isThreadComposer={isThreadComposer}
              referenceComposer={referenceComposer}
              onInsertCodeBlock={insertCodeBlock}
              onInsertOrderedList={insertOrderedList}
              onInsertPrefixedLines={insertPrefixedLines}
              onInsertWrap={insertMarkdownWrap}
              {...formattingPollProps}
            />
          ) : null}

          <div
            className={cn(
              "message-composer-field relative flex-1",
              referenceComposer &&
                "flex flex-wrap items-center gap-1.5 border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] px-2.5 py-2 shadow-[0_4px_14px_hsl(var(--shadow-color)/0.035)]",
              referenceComposer &&
                (showFormattingToolbar ? "rounded-b-[0.9375rem]" : "rounded-[0.9375rem]"),
              referenceComposer &&
                composerFocused &&
                "border-[hsl(var(--primary)/0.5)] ring-2 ring-[hsl(var(--primary)/0.1)]",
            )}
            data-testid="message-composer-input-row"
            data-focus-surface
            style={serverComposerBoxStyle(serverComposer)}
          >
            {!referenceComposer && showFormattingToolbar ? (
              <ComposerFormattingBar
                isThreadComposer={isThreadComposer}
                onInsertCodeBlock={insertCodeBlock}
                onInsertOrderedList={insertOrderedList}
                onInsertPrefixedLines={insertPrefixedLines}
                onInsertWrap={insertMarkdownWrap}
                {...formattingPollProps}
              />
            ) : null}
            <AutoResizeTextarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onClick={(event) =>
                setSelectionIndex(event.currentTarget.selectionStart ?? content.length)
              }
              onCompositionEnd={() => setIsComposing(false)}
              onCompositionStart={() => setIsComposing(true)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              onKeyUp={(event) =>
                setSelectionIndex(event.currentTarget.selectionStart ?? content.length)
              }
              onPaste={handlePaste}
              onSelect={(event) =>
                setSelectionIndex(event.currentTarget.selectionStart ?? content.length)
              }
              placeholder={placeholder}
              disabled={disabled}
              data-testid={isThreadComposer ? "thread-message-input" : "message-input"}
              className={cn(
                referenceComposer
                  ? "order-2 min-h-[2.125rem] min-w-[10rem] flex-[1_1_14rem] rounded-none bg-transparent px-1.5 py-1 text-[0.90625rem] leading-6 focus-visible:bg-transparent md:min-h-[2.125rem] md:px-2 md:py-1"
                  : "bg-[hsl(var(--surface-soft)/0.24)] pr-4 focus-visible:bg-[hsl(var(--surface-soft)/0.34)]",
                !referenceComposer &&
                  (isThreadComposer ? "min-h-[4.25rem]" : "min-h-[3.25rem] md:min-h-[4rem]"),
              )}
              formattingOpen={showFormattingToolbar && !referenceComposer}
              isThreadComposer={isThreadComposer}
              maxLength={hasFiniteMaxLength ? effectiveMaxLength : undefined}
            />

            {activeMention && mode === "channel" && !disabled ? (
              <div
                className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-full max-w-sm rounded-[1.5rem] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.96)] p-2 shadow-[0_20px_50px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl"
                data-testid="mention-suggestions"
              >
                <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-app-soft">
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
                            insertMention(member.username);
                          }}
                          type="button"
                        >
                          <Avatar
                            alt={name}
                            className="h-8 w-8 text-[0.6875rem]"
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
                ) : null}
                {roleSuggestions.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 pt-2 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-app-soft">
                      {t("chat.mentions.rolesTitle")}
                    </p>
                    <div className="space-y-1">
                      {roleSuggestions.map((role, index) => {
                        const optionIndex = mentionSuggestions.length + index;
                        return (
                          <button
                            className={`flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left transition ${
                              optionIndex === activeMentionIndex
                                ? "bg-[hsl(var(--primary)/0.12)] text-app-foreground"
                                : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.62)] hover:text-app-foreground"
                            }`}
                            data-testid={`mention-role-suggestion-${role.id}`}
                            key={role.id}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertMention(role.name);
                            }}
                            type="button"
                          >
                            {/* Rol rengi tasarımın verisi, token değil: sunucu yöneticisinin
                                seçtiği 24-bit değer. `0` "renk seçilmedi" demektir ve o zaman
                                satır metin rengine düşer. */}
                            <span
                              aria-hidden="true"
                              className="h-2.5 w-2.5 shrink-0 rounded-full border border-[hsl(var(--border)/0.7)]"
                              style={
                                role.color === 0
                                  ? undefined
                                  : {
                                      backgroundColor: `#${role.color.toString(16).padStart(6, "0")}`,
                                    }
                              }
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                @{role.name}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                {mentionOptionCount === 0 ? (
                  <p className="px-2 py-3 text-sm font-medium text-app-muted">
                    {t("chat.mentions.empty")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div
              className={cn(
                referenceComposer
                  ? "contents"
                  : "mt-1.5 flex flex-wrap items-center justify-between gap-2 px-0 pt-1",
                !referenceComposer && (isThreadComposer ? "gap-2" : "md:gap-3 md:px-2"),
              )}
            >
              <div
                className={cn(
                  referenceComposer
                    ? "contents"
                    : "flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2",
                )}
              >
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

                {/*
                  Ş6 §4 — sunucu `allowFileUploads` kapalıyken düğme **hiç çizilmez**; pasif
                  bir düğme kullanıcıya var olmayan bir yetenek gösterirdi. DM yolunda davranış
                  değişmedi: orada bayrak her zaman açık gelir.
                */}
                {serverComposer && !allowFileUploads ? null : (
                  <ComposerButton
                    aria-expanded={actionSheetOpen}
                    className={cn(
                      referenceComposer
                        ? "order-1 h-[2.125rem] min-h-[2.125rem] w-[2.125rem] min-w-[2.125rem] rounded-[0.6875rem] bg-[hsl(var(--surface-soft))]"
                        : isThreadComposer
                          ? "h-10 min-h-10 min-w-10 rounded-xl"
                          : "h-10 w-10 md:h-11 md:w-11",
                    )}
                    data-testid="message-file-button"
                    disabled={disabled || !allowFileUploads}
                    style={serverComposerSquareStyle(
                      serverComposer,
                      serverComposerMetrics.attachSize,
                      serverComposerMetrics.attachRadius,
                    )}
                    icon={Plus}
                    label={t("chat.attachments.attachFile")}
                    onClick={() => {
                      if (disabled) {
                        setAttachmentUploadError(disabledMessage);
                        return;
                      }

                      if (typeof window !== "undefined" && window.innerWidth < 768) {
                        setIsActionSheetOpen((current) => !current);
                        return;
                      }

                      if (!allowFileUploads) {
                        setAttachmentUploadError(t("chat.attachments.disabled"));
                        return;
                      }

                      openFilePicker();
                    }}
                    title={
                      disabled
                        ? disabledMessage
                        : !allowFileUploads
                          ? t("chat.attachments.disabled")
                          : t("chat.attachments.attachFile")
                    }
                  />
                )}

                <button
                  aria-expanded={showFormattingToolbar}
                  aria-label={t("chat.input.toggleFormatting")}
                  className={cn(
                    compactToolButtonClass,
                    "hidden md:inline-flex",
                    referenceComposer && "order-3 h-[2.125rem] min-h-[2.125rem] w-[2.125rem] px-0",
                    showFormattingToolbar
                      ? "bg-[hsl(var(--primary)/0.14)] text-[var(--primary-readable)] shadow-[0_12px_26px_hsl(var(--primary)/0.12)]"
                      : "bg-[hsl(var(--surface-soft)/0.42)] text-app-muted hover:text-app-foreground",
                  )}
                  data-testid="message-formatting-toggle"
                  onClick={() => setShowFormattingToolbar((current) => !current)}
                  style={serverComposerSquareStyle(
                    serverComposer,
                    serverComposerMetrics.actionSize,
                    serverComposerMetrics.actionRadius,
                  )}
                  title={t("chat.input.toggleFormatting")}
                  type="button"
                >
                  <span className="text-[0.8125rem] font-black tracking-[-0.04em]">Aa</span>
                  <span className={referenceComposer ? "sr-only" : formatButtonLabelClass}>
                    {t("chat.input.formatting")}
                  </span>
                </button>

                <div
                  className={cn(
                    "relative",
                    referenceComposer ? "order-4 hidden md:inline-flex" : "inline-flex",
                  )}
                >
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
                      "hidden md:inline-flex",
                      referenceComposer && "h-[2.125rem] min-h-[2.125rem] w-[2.125rem] px-0",
                      "bg-[hsl(var(--surface-soft)/0.42)] text-app-muted hover:text-app-foreground",
                    )}
                    aria-label={t("chat.input.openEmojiPicker")}
                    data-testid="emoji-picker-button"
                    disabled={disabled}
                    style={serverComposerSquareStyle(
                      serverComposer,
                      serverComposerMetrics.actionSize,
                      serverComposerMetrics.actionRadius,
                    )}
                    type="button"
                  >
                    <Smile className="h-4 w-4" />
                    <span className={referenceComposer ? "sr-only" : formatButtonLabelClass}>
                      {t("chat.input.openEmojiPicker")}
                    </span>
                  </button>
                </div>

                {/* Ş6 §4 — `allowGifs` kapalıyken GIF düğmesi çizilmez. */}
                {serverComposer && !allowGifs ? null : (
                  <div
                    className={cn(
                      "relative",
                      referenceComposer ? "order-5 hidden md:inline-flex" : "inline-flex",
                    )}
                  >
                    <button
                      aria-label={t("chat.gifs.openPicker")}
                      className={cn(
                        compactToolButtonClass,
                        "hidden md:inline-flex",
                        referenceComposer &&
                          "h-[2.125rem] min-h-[2.125rem] w-[2.125rem] px-0 text-[0.6875rem] font-black",
                        "bg-[hsl(var(--surface-soft)/0.26)] text-app-soft hover:text-app-foreground",
                      )}
                      data-testid="gif-picker-button"
                      disabled={!allowGifs || disabled}
                      style={
                        serverComposer
                          ? {
                              borderRadius: pxToRem(serverComposerMetrics.gifButtonRadius),
                              fontSize: pxToRem(serverComposerMetrics.gifButtonFontSize),
                              height: pxToRem(serverComposerMetrics.gifButtonHeight),
                              letterSpacing: `${serverComposerMetrics.gifButtonLetterSpacing}em`,
                              minHeight: pxToRem(serverComposerMetrics.gifButtonHeight),
                              paddingInline: pxToRem(serverComposerMetrics.gifButtonPaddingX),
                            }
                          : undefined
                      }
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
                      {!referenceComposer ? <ImageIcon className="h-3.5 w-3.5" /> : null}
                      <span className={referenceComposer ? "inline" : formatButtonLabelClass}>
                        {t("chat.attachments.gif")}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  referenceComposer
                    ? "contents"
                    : "ml-auto flex min-w-0 items-center gap-1.5 md:gap-3",
                  !referenceComposer && isThreadComposer ? "w-full justify-between" : "",
                )}
              >
                {!isThreadComposer && !referenceComposer ? composerShortcutHint : null}

                <span
                  className={cn(
                    "hidden items-center gap-2 sm:inline-flex",
                    referenceComposer && "sm:hidden",
                  )}
                >
                  {!hasFiniteMaxLength ? (
                    <span
                      aria-hidden="true"
                      className="hidden h-1 w-1 rounded-full bg-[hsl(var(--border))] xl:inline-block"
                    />
                  ) : null}
                  {characterCounter}
                </span>

                {pollEnabled && onOpenPoll ? (
                  <ComposerButton
                    className={cn(
                      referenceComposer
                        ? "order-6 hidden h-[2.125rem] min-h-[2.125rem] w-[2.125rem] min-w-[2.125rem] rounded-[0.6875rem] px-0 md:inline-flex"
                        : isThreadComposer
                          ? "h-10 min-h-10 min-w-10 rounded-xl"
                          : "h-10 w-10 md:h-11 md:w-11",
                    )}
                    data-testid="message-poll-button"
                    disabled={disabled}
                    icon={BarChart3}
                    label={t("messages.composer.poll")}
                    onClick={onOpenPoll}
                    variant="ghost"
                  />
                ) : null}

                {/*
                  Mesajlar karar #5. Bu düğme buraya kadar pasifti; artık gerçek
                  kayıt alıyor. `VoiceRecorder` kayıt sırasında kendi şeridini
                  çiziyor, o yüzden `ComposerButton` sarmalayıcısı yok.
                */}
                <div
                  className={referenceComposer ? "order-7 flex min-w-0 items-center" : "contents"}
                >
                  <VoiceRecorder
                    disabled={disabled || isUploadingVoiceMessage}
                    onActiveChange={setIsVoiceRecorderActive}
                    onRecorded={(recording) => void handleVoiceRecorded(recording)}
                  />
                </div>

                {!isVoiceRecorderActive ? (
                  <ComposerButton
                    aria-disabled={!canSend}
                    className={cn(
                      referenceComposer
                        ? "order-8 h-[2.125rem] min-h-[2.125rem] w-[2.125rem] min-w-[2.125rem] rounded-[0.6875rem] bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:brightness-110"
                        : isThreadComposer
                          ? "h-10 min-h-10 min-w-10 rounded-xl"
                          : "h-10 w-10 md:h-12 md:w-12",
                    )}
                    data-testid="message-send-button"
                    disabled={!canSend}
                    icon={Send}
                    style={messageSendButtonStyle()}
                    label={t("chat.input.sendMessage")}
                    onClick={handleSend}
                    variant="primary"
                  >
                    <span className="sr-only">{t("chat.input.sendMessage")}</span>
                  </ComposerButton>
                ) : null}
              </div>
            </div>

            <ComposerActionSheet
              onClose={() => setIsActionSheetOpen(false)}
              open={actionSheetOpen}
              title={composerActionsTitle}
            >
              <button
                aria-label={t("chat.input.formatting")}
                className={actionSheetButtonClass}
                data-testid="mobile-formatting-button"
                onClick={() => {
                  setShowFormattingToolbar((current) => !current);
                  setIsActionSheetOpen(false);
                }}
                type="button"
              >
                <span className="text-sm font-black tracking-[-0.04em]">Aa</span>
                <span>{t("chat.input.formatting")}</span>
              </button>
              <button
                aria-label={t("chat.input.openEmojiPicker")}
                className={actionSheetButtonClass}
                data-testid="mobile-emoji-picker-button"
                disabled={disabled}
                onClick={toggleEmojiPicker}
                type="button"
              >
                <Smile className="h-5 w-5" />
                <span>{t("chat.input.openEmojiPicker")}</span>
              </button>
              <button
                aria-label={t("chat.gifs.openPicker")}
                className={actionSheetButtonClass}
                data-testid="mobile-gif-picker-button"
                disabled={!allowGifs || disabled}
                onClick={toggleGifPicker}
                type="button"
              >
                <ImageIcon className="h-5 w-5" />
                <span>{t("chat.attachments.gif")}</span>
              </button>
              <button
                aria-label={t("chat.attachments.image")}
                className={actionSheetButtonClass}
                data-testid="mobile-image-picker-button"
                disabled={!allowFileUploads || disabled}
                onClick={openFilePicker}
                type="button"
              >
                <ImagePlus className="h-5 w-5" />
                <span>{t("chat.attachments.image")}</span>
              </button>
              {/*
                Bu düğme `Sticker` diyor ama anket şablonu ekliyordu — etiketi
                yaptığı işi anlatmıyordu. Şablon karar #1 ile kalktığı için düğme
                artık gerçek anket modalını açıyor ve adı da onu söylüyor.
              */}
              {pollEnabled && onOpenPoll ? (
                <button
                  aria-label={t("messages.composer.poll")}
                  className={actionSheetButtonClass}
                  data-testid="mobile-poll-button"
                  disabled={disabled}
                  onClick={() => {
                    onOpenPoll();
                    setIsActionSheetOpen(false);
                  }}
                  type="button"
                >
                  <ChartNoAxesColumnIncreasing className="h-5 w-5" />
                  <span>{t("messages.composer.poll")}</span>
                </button>
              ) : null}
              <button
                aria-label={t("chat.input.codeBlock")}
                className={actionSheetButtonClass}
                data-testid="mobile-code-button"
                disabled={disabled}
                onClick={() => {
                  insertCodeBlock();
                  setIsActionSheetOpen(false);
                }}
                type="button"
              >
                <Code2 className="h-5 w-5" />
                <span>{t("chat.input.codeBlock")}</span>
              </button>
              <button
                aria-label={t("chat.input.slashCommands")}
                className={actionSheetButtonClass}
                data-testid="mobile-slash-button"
                disabled={disabled}
                onClick={insertSlashCommand}
                type="button"
              >
                <Slash className="h-5 w-5" />
                <span>{t("chat.input.slashCommands")}</span>
              </button>
              <button
                aria-label={t("chat.attachments.file")}
                className={actionSheetButtonClass}
                data-testid="mobile-file-button"
                disabled={!allowFileUploads || disabled}
                onClick={openFilePicker}
                type="button"
              >
                <Paperclip className="h-5 w-5" />
                <span>{t("chat.attachments.file")}</span>
              </button>
            </ComposerActionSheet>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageInput(props: MessageInputProps) {
  return <ChatComposer {...props} />;
}
