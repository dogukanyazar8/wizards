"use client";

import React, { useId, useRef } from "react";
import { ChevronDown, FolderPlus, Info, Plus } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { categoryPreviewName, isCounterWarning } from "@/lib/servers/modal-form-model";
import { cn } from "@/lib/utils";
import {
  ServerModalShell,
  serverModalFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "./server-modal-shell";

/**
 * Kategori oluştur / düzenle — SPEC-SUNUCU §6.1, 560 px.
 *
 * Pencerenin tek alanı var ama iki işi de yapıyor: `edit` kipinde aynı gövde mevcut adı taşır
 * (mağazadaki `categoryModal.mode` korundu). Canlı önizleme her iki kipte de kenar çubuğunda
 * satırın nasıl görüneceğini gösterir — versal ad, caret ve `+`; boşken `YENİ KATEGORİ`.
 *
 * Sayaç 48'in %85'ini (40) geçince `warning`'e döner; oran `modal.counterWarnRatio`'dan gelir,
 * `40` sabiti buraya yazılmaz.
 */

const CATEGORY_NAME_MAX = 48;

export type CreateCategoryModalProps = {
  error?: boolean;
  mode: "create" | "edit";
  name: string;
  onChange: (name: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
  serverName: string;
};

export function CreateCategoryModal({
  error = false,
  mode,
  name,
  onChange,
  onClose,
  onSubmit,
  open,
  pending,
  serverName,
}: CreateCategoryModalProps) {
  const { t } = useI18n();
  const { modal } = SERVER_METRICS;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = name.trim().length > 0 && !pending;

  return (
    <ServerModalShell
      closeLabel={t("common.close")}
      description={t("server.modal.category.subtitle", { server: serverName })}
      footer={
        <div className="flex items-center justify-end" style={serverModalFooterStyle()}>
          <button
            className="flex-none cursor-pointer border font-semibold transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onClose}
            style={serverModalSecondaryButtonStyle()}
            type="button"
          >
            {t("common.cancel")}
          </button>
          <button
            aria-disabled={!canSubmit}
            className="flex-none border-0 font-semibold transition hover:brightness-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="category-submit-button"
            onClick={() => {
              if (!canSubmit) {
                return;
              }

              onSubmit();
            }}
            style={serverModalPrimaryButtonStyle(canSubmit)}
            type="button"
          >
            {mode === "edit" ? t("server.modal.category.save") : t("server.modal.category.submit")}
          </button>
        </div>
      }
      icon={
        <FolderPlus
          aria-hidden="true"
          style={{
            height: pxToEm(modal.iconBoxGlyphSize, modal.iconBoxSize),
            width: pxToEm(modal.iconBoxGlyphSize, modal.iconBoxSize),
          }}
        />
      }
      initialFocusRef={inputRef}
      onClose={onClose}
      open={open}
      scrollBody
      bodyPaddingBottom={modal.bodyPaddingBottomWide}
      bodyPaddingTop={modal.bodyPaddingTopWide}
      title={
        mode === "edit" ? t("server.modal.category.editTitle") : t("server.modal.category.title")
      }
      width="category"
    >
      <CreateCategoryModalView
        error={error}
        inputRef={inputRef}
        name={name}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </ServerModalShell>
  );
}

/**
 * Pencerenin gövdesi — kabuk olmadan. `ui/modal` hidrasyondan önce `null` döner, bu yüzden
 * gövdenin metinleri ve ölçüleri ancak kabuktan ayrı render edilerek denetlenebiliyor
 * (Ş9'un `ChannelNotificationsModalView` deseniyle aynı).
 */
export type CreateCategoryModalViewProps = {
  error?: boolean | undefined;
  inputRef?: React.RefObject<HTMLInputElement | null> | undefined;
  name: string;
  onChange: (name: string) => void;
  onSubmit: () => void;
};

export function CreateCategoryModalView({
  error = false,
  inputRef,
  name,
  onChange,
  onSubmit,
}: CreateCategoryModalViewProps) {
  const { t } = useI18n();
  const { categoryModal, modal } = SERVER_METRICS;
  const inputId = useId();
  const hintId = useId();
  const canSubmit = name.trim().length > 0;
  const warn = isCounterWarning(name.length, CATEGORY_NAME_MAX);
  const preview = categoryPreviewName(name, t("server.modal.category.previewEmpty"));

  return (
    <form
      data-testid="category-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit();
        }
      }}
    >
      <div className="flex items-center" style={{ gap: pxToRem(modal.labelGap) }}>
        <label
          className="font-semibold uppercase text-[hsl(var(--text-muted))]"
          htmlFor={inputId}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.labelFontSize),
            letterSpacing: `${modal.labelLetterSpacing}em`,
            lineHeight: 1,
          }}
        >
          {t("server.modal.category.nameLabel")}
        </label>
        <span
          className="font-semibold text-[hsl(var(--danger))]"
          style={{
            background: `hsl(var(--danger)/${modal.requiredBadgeBackgroundAlpha})`,
            borderRadius: pxToRem(modal.badgeRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.badgeFontSize),
            lineHeight: 1,
            padding: `${pxToRem(modal.badgePaddingY)} ${pxToRem(modal.badgePaddingX)}`,
          }}
        >
          {t("server.field.required")}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "ml-auto flex-none font-semibold",
            warn ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-muted))]",
          )}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.counterFontSize),
            lineHeight: 1,
          }}
        >
          {`${name.length}/${CATEGORY_NAME_MAX}`}
        </span>
      </div>

      <input
        aria-describedby={hintId}
        className="box-border w-full bg-[hsl(var(--surface-base))] font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="category-name-input"
        id={inputId}
        maxLength={CATEGORY_NAME_MAX}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("server.modal.category.placeholder")}
        ref={inputRef}
        style={{
          border: `${hairline()} solid ${name ? "hsl(var(--primary)/0.5)" : "hsl(var(--border))"}`,
          borderRadius: pxToRem(modal.inputRadius),
          fontSize: pxToRem(modal.inputFontSize),
          lineHeight: 1,
          marginTop: pxToRem(modal.inputMarginTop),
          padding: `${pxToRem(modal.inputPaddingY)} ${pxToRem(modal.inputPaddingX)}`,
        }}
        value={name}
      />

      <div
        className="text-[hsl(var(--text-muted))]"
        id={hintId}
        style={{
          fontSize: pxToRem(modal.hintFontSize),
          lineHeight: modal.hintLineHeight,
          marginTop: pxToRem(modal.hintMarginTop),
        }}
      >
        {t("server.modal.category.hint", { max: CATEGORY_NAME_MAX })}
      </div>

      <div
        className="font-semibold uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(modal.labelFontSize),
          letterSpacing: `${modal.labelLetterSpacing}em`,
          lineHeight: 1,
          marginTop: pxToRem(categoryModal.previewLabelMarginTop),
        }}
      >
        {t("server.modal.category.previewLabel")}
      </div>

      <div
        className="bg-[hsl(var(--surface-panel))]"
        data-testid="category-preview"
        style={{
          border: `${hairline()} solid hsl(var(--border)/${categoryModal.previewBorderAlpha})`,
          borderRadius: pxToRem(categoryModal.previewRadius),
          marginTop: pxToRem(categoryModal.previewMarginTop),
          padding: `${pxToRem(categoryModal.previewPaddingY)} ${pxToRem(categoryModal.previewPaddingX)}`,
        }}
      >
        <div className="flex items-center" style={{ gap: pxToRem(categoryModal.previewHeadGap) }}>
          <ChevronDown
            aria-hidden="true"
            className="flex-none text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(categoryModal.previewCaretSize, categoryModal.previewNameFontSize),
              width: pxToEm(categoryModal.previewCaretSize, categoryModal.previewNameFontSize),
            }}
          />
          <span
            className="min-w-0 truncate font-semibold uppercase text-[hsl(var(--text-secondary))]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(categoryModal.previewNameFontSize),
              letterSpacing: `${categoryModal.previewNameLetterSpacing}em`,
              lineHeight: categoryModal.previewNameLineHeight,
            }}
          >
            {preview}
          </span>
          <span
            aria-hidden="true"
            className="ml-auto grid flex-none place-items-center text-[hsl(var(--text-muted))]"
            style={{
              borderRadius: pxToRem(categoryModal.previewAddRadius),
              height: pxToRem(categoryModal.previewAddSize),
              width: pxToRem(categoryModal.previewAddSize),
            }}
          >
            <Plus
              style={{
                height: pxToRem(categoryModal.previewAddGlyphSize),
                width: pxToRem(categoryModal.previewAddGlyphSize),
              }}
            />
          </span>
        </div>
        <div
          className="text-[hsl(var(--text-muted))]"
          style={{
            border: `${hairline()} dashed hsl(var(--border))`,
            borderRadius: pxToRem(categoryModal.previewEmptyRadius),
            fontSize: pxToRem(categoryModal.previewEmptyFontSize),
            marginTop: pxToRem(categoryModal.previewEmptyMarginTop),
            padding: `${pxToRem(categoryModal.previewEmptyPaddingY)} ${pxToRem(categoryModal.previewEmptyPaddingX)}`,
          }}
        >
          {t("server.modal.category.previewEmptyChannels")}
        </div>
      </div>

      <div
        className="flex items-start"
        style={{
          background: `hsl(var(--surface-soft)/${modal.noteBackgroundAlpha})`,
          borderRadius: pxToRem(modal.noteRadius),
          gap: pxToRem(modal.noteGap),
          marginTop: pxToRem(modal.noteMarginTop),
          padding: `${pxToRem(modal.notePaddingY)} ${pxToRem(modal.notePaddingX)}`,
        }}
      >
        <Info
          aria-hidden="true"
          className="flex-none text-[hsl(var(--text-muted))]"
          style={{
            height: pxToEm(modal.noteIconSize, modal.noteFontSize),
            marginTop: pxToRem(modal.noteIconMarginTop),
            width: pxToEm(modal.noteIconSize, modal.noteFontSize),
          }}
        />
        <span
          className="text-pretty text-[hsl(var(--text-secondary))]"
          style={{ fontSize: pxToRem(modal.noteFontSize), lineHeight: modal.noteLineHeight }}
        >
          {t("server.modal.category.note")}
        </span>
      </div>

      {error ? (
        <div
          className="text-pretty font-semibold text-[hsl(var(--danger))]"
          data-testid="category-error"
          role="alert"
          style={{
            fontSize: pxToRem(modal.hintFontSize),
            lineHeight: modal.hintLineHeight,
            marginTop: pxToRem(modal.hintMarginTop),
          }}
        >
          {t("server.modal.category.error")}
        </div>
      ) : null}
    </form>
  );
}
