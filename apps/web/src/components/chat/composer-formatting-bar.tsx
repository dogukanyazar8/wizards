"use client";

import React from "react";
import {
  Bold,
  Braces,
  ChartNoAxesColumnIncreasing,
  Code2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  useAppShortcutAriaKeyShortcuts,
  useAppShortcutLabel,
} from "@/hooks/use-app-shortcut-label";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Bestekârın biçimlendirme şeridi — SPEC-MESAJLAR §5.6.
 *
 * `message-input.tsx` içinden çıkarıldı: dokuz araç + anket girişi + Markdown
 * ipucu 140 satır tutuyordu ve bestekârın kendi işiyle (yükleme, bahsetme,
 * yazıyor sinyali, ses kaydı) hiçbir durumu paylaşmıyor. Şerit yalnız **metin
 * ekler**; nereye ekleyeceğini bilen taraf hâlâ bestekâr ve buraya geri çağrı
 * olarak geliyor.
 *
 * Araçların işaretçileri (`**`, `_`, `++`) klavye kısayollarıyla **aynı**
 * olmalı; farklı olsalardı aynı düğmenin iki yolu iki farklı metin yazardı. Tek
 * kaynak `message-input.tsx`'teki `FORMATTING_SHORTCUTS`.
 */

/**
 * Araç düğmesinin sınıfı. Bestekârdan **taşındı**, kopyalanmadı: iki tanım
 * olsaydı biri değiştiğinde şerit ile bestekârın geri kalanı görsel olarak
 * ayrışırdı.
 */
const TOOL_BUTTON_CLASS =
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[0.8125rem] border-0 bg-[hsl(var(--surface-soft)/0.3)] px-2.5 py-1.5 text-[0.78125rem] font-bold text-app-muted transition hover:bg-[hsl(var(--primary)/0.07)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)] disabled:cursor-not-allowed disabled:opacity-50";

export type ComposerFormattingBarProps = {
  isThreadComposer?: boolean;
  referenceComposer?: boolean;
  onInsertCodeBlock: () => void;
  onInsertOrderedList: () => void;
  onInsertPrefixedLines: (prefix: string, fallback: string) => void;
  onInsertWrap: (before: string, after: string, fallback: string) => void;
  /** Verilmezse anket düğmesi **çizilmez** (karar #1'in kapısı çağıranda). */
  onOpenPoll?: (() => void) | undefined;
};

export function ComposerFormattingBar({
  isThreadComposer = false,
  referenceComposer = false,
  onInsertCodeBlock,
  onInsertOrderedList,
  onInsertPrefixedLines,
  onInsertWrap,
  onOpenPoll,
}: ComposerFormattingBarProps) {
  const { t } = useI18n();
  const boldShortcut = useAppShortcutLabel("composer.bold");
  const italicShortcut = useAppShortcutLabel("composer.italic");
  const underlineShortcut = useAppShortcutLabel("composer.underline");
  const boldAriaShortcut = useAppShortcutAriaKeyShortcuts("composer.bold");
  const italicAriaShortcut = useAppShortcutAriaKeyShortcuts("composer.italic");
  const underlineAriaShortcut = useAppShortcutAriaKeyShortcuts("composer.underline");
  const formattingActionButtonClass = cn(
    TOOL_BUTTON_CLASS,
    referenceComposer &&
      "h-[1.9375rem] min-h-[1.9375rem] w-[1.9375rem] overflow-hidden rounded-[0.5625rem] px-0 py-0",
  );

  return (
    <div
      aria-label={t("chat.input.formatting")}
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-t-[1.25rem] border border-b-0 border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card)/0.94)] p-1.5 shadow-[inset_0_1px_0_hsl(var(--background)/0.52)]",
        referenceComposer &&
          "flex-nowrap gap-[0.1875rem] overflow-x-auto rounded-t-[0.9375rem] bg-[hsl(var(--surface-soft))]",
        isThreadComposer ? "max-h-36 overflow-y-auto" : "",
      )}
      data-testid="message-formatting-toolbar"
      role="toolbar"
    >
      <button
        aria-label={t("chat.input.bold")}
        aria-keyshortcuts={boldAriaShortcut}
        className={formattingActionButtonClass}
        title={`${t("chat.input.bold")} · ${boldShortcut}`}
        onClick={() => onInsertWrap("**", "**", t("chat.input.boldFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Bold className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : "sr-only sm:not-sr-only"}>
          {t("chat.input.bold")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.italic")}
        aria-keyshortcuts={italicAriaShortcut}
        className={formattingActionButtonClass}
        title={`${t("chat.input.italic")} · ${italicShortcut}`}
        onClick={() => onInsertWrap("_", "_", t("chat.input.italicFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Italic className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : "sr-only sm:not-sr-only"}>
          {t("chat.input.italic")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.underline")}
        aria-keyshortcuts={underlineAriaShortcut}
        className={formattingActionButtonClass}
        title={`${t("chat.input.underline")} · ${underlineShortcut}`}
        onClick={() => onInsertWrap("++", "++", t("chat.input.underlineFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Underline className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : "sr-only sm:not-sr-only"}>
          {t("chat.input.underline")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.strikethrough")}
        className={formattingActionButtonClass}
        title={`${t("chat.input.strikethrough")} · ${t("messages.composer.tool.strikethroughHint")}`}
        onClick={() => onInsertWrap("~~", "~~", t("chat.input.strikethroughFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Strikethrough className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : "sr-only sm:not-sr-only"}>
          {t("chat.input.strikethrough")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.bulletedList")}
        className={formattingActionButtonClass}
        title={`${t("chat.input.bulletedList")} · ${t("messages.composer.tool.bulletListHint")}`}
        onClick={() => onInsertPrefixedLines("- ", t("chat.input.listFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <List className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : undefined}>
          {t("chat.input.bulletedList")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.orderedList")}
        className={formattingActionButtonClass}
        title={`${t("chat.input.orderedList")} · ${t("messages.composer.tool.orderedListHint")}`}
        onClick={onInsertOrderedList}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <ListOrdered className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : undefined}>
          {t("chat.input.orderedList")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.quote")}
        className={formattingActionButtonClass}
        title={`${t("chat.input.quote")} · ${t("messages.composer.tool.quoteHint")}`}
        onClick={() => onInsertPrefixedLines("> ", t("chat.input.quoteFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Quote className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : undefined}>{t("chat.input.quote")}</span>
      </button>
      <button
        aria-label={t("chat.input.inlineCode")}
        className={formattingActionButtonClass}
        title={`${t("chat.input.inlineCode")} · ${t("messages.composer.tool.inlineCodeHint")}`}
        onClick={() => onInsertWrap("`", "`", t("chat.input.codeFallback"))}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Code2 className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : undefined}>
          {t("chat.input.inlineCode")}
        </span>
      </button>
      <button
        aria-label={t("chat.input.codeBlock")}
        className={formattingActionButtonClass}
        title={`${t("chat.input.codeBlock")} · ${t("messages.composer.tool.codeBlockHint")}`}
        onClick={onInsertCodeBlock}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <Braces className="h-4 w-4" />
        <span className={referenceComposer ? "sr-only" : undefined}>
          {t("chat.input.codeBlock")}
        </span>
      </button>
      {onOpenPoll ? (
        <button
          aria-label={t("messages.composer.pollBar")}
          className={cn(
            formattingActionButtonClass,
            "bg-[hsl(var(--primary)/0.08)] text-[var(--primary-readable)]",
            referenceComposer && "w-auto px-2.5",
          )}
          data-testid="message-formatting-poll-button"
          onClick={onOpenPoll}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          <ChartNoAxesColumnIncreasing className="h-4 w-4" />
          <span>{t("messages.composer.poll")}</span>
        </button>
      ) : null}
      {/*
          SPEC §5.6: şeridin sağında "Markdown kısayolları desteklenir".
          `ml-auto` ile sağa itilir; araçların arasına karışan bir ipucu,
          tıklanabilir sanılan bir metin olurdu.
        */}
      <span
        className="ml-auto shrink-0 text-[hsl(var(--text-muted))]"
        data-testid="message-formatting-hint"
        style={{ fontSize: pxToRem(MESSAGES_METRICS.composer.barHintFontSize) }}
      >
        {t("messages.composer.markdownHint")}
      </span>
    </div>
  );
}
