"use client";

import React from "react";

import { Modal } from "@/components/ui/modal";
import {
  CloseIcon,
  ImagePlaceholderIcon,
  TrashIcon,
  WarningTriangleIcon,
} from "@/components/support/report-icons";
import { REPORT_METRICS, hairline, pxToRem } from "@/lib/support/report-metrics";

const { discard, lightbox, motion } = REPORT_METRICS;

/**
 * SPEC §A.9 ve §A.10 — formun **üstündeki** iki katman.
 *
 * İkisi de ayrı birer `Modal`: kendi odak tuzağı, kendi Esc'i ve kendi portalı
 * olsun diye. Formun içine `position:fixed` bir katman koymak, kartın framer
 * dönüşümü yüzünden kapsayıcı blok değişince kırılırdı.
 */

export function BugReportDiscardDialog({
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  open,
  testIdPrefix = "bug-report",
  title,
}: {
  readonly body: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
  readonly testIdPrefix?: string;
  readonly title: string;
}) {
  return (
    <Modal
      className="max-w-none overflow-visible rounded-none p-0 shadow-none backdrop-blur-none sm:rounded-none sm:p-0"
      hideHeader
      onClose={onCancel}
      open={open}
      overlayClassName="z-[81] items-center backdrop-blur-none"
      overlayStyle={{
        background: `hsl(var(--background) / ${discard.backdropAlpha})`,
        padding: pxToRem(discard.backdropPadding),
      }}
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(discard.radius),
        boxShadow: `0 ${pxToRem(discard.shadow.y)} ${pxToRem(discard.shadow.blur)} ${pxToRem(
          discard.shadow.spread,
        )} hsl(var(--shadow-color))`,
        maxWidth: "100%",
        padding: `${pxToRem(discard.paddingTop)} ${pxToRem(discard.paddingX)} ${pxToRem(
          discard.paddingBottom,
        )}`,
        width: pxToRem(discard.width),
      }}
      title={title}
    >
      <div data-testid={`${testIdPrefix}-discard-dialog`}>
        <div style={{ alignItems: "flex-start", display: "flex", gap: pxToRem(discard.headerGap) }}>
          <div
            style={{
              background: `hsl(var(--danger) / ${discard.iconSurfaceAlpha})`,
              borderRadius: pxToRem(discard.iconRadius),
              color: "hsl(var(--danger))",
              display: "grid",
              flex: "none",
              height: pxToRem(discard.iconBox),
              placeItems: "center",
              width: pxToRem(discard.iconBox),
            }}
          >
            <WarningTriangleIcon size={discard.iconSize} strokeWidth={discard.iconStroke} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: "hsl(var(--foreground))",
                fontFamily: "var(--font-display), sans-serif",
                fontSize: pxToRem(discard.titleFontSize),
                fontWeight: 600,
                letterSpacing: "-.02em",
                lineHeight: discard.titleLineHeight,
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "hsl(var(--text-secondary))",
                fontSize: pxToRem(discard.bodyFontSize),
                lineHeight: discard.bodyLineHeight,
                marginTop: pxToRem(discard.bodyMarginTop),
                textWrap: "pretty",
              }}
            >
              {body}
            </div>
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: pxToRem(discard.actionsGap),
            justifyContent: "flex-end",
            marginTop: pxToRem(discard.actionsMarginTop),
          }}
        >
          {/* Yıkıcı eylem solda, güvenli eylem sağda (SPEC §A.9). */}
          <button
            data-testid={`${testIdPrefix}-discard-confirm`}
            onClick={onConfirm}
            style={{
              background: "transparent",
              border: `${hairline()} solid hsl(var(--danger) / ${discard.discardBorderAlpha})`,
              borderRadius: pxToRem(discard.buttonRadius),
              color: "hsl(var(--danger))",
              cursor: "pointer",
              fontSize: pxToRem(discard.buttonFontSize),
              fontWeight: 600,
              height: pxToRem(discard.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(discard.discardPaddingX)}`,
              transition: `background ${motion.transitionSeconds}s`,
            }}
            type="button"
          >
            {confirmLabel}
          </button>
          <button
            data-testid={`${testIdPrefix}-discard-cancel`}
            onClick={onCancel}
            style={{
              background: "hsl(var(--primary))",
              border: 0,
              borderRadius: pxToRem(discard.buttonRadius),
              boxShadow: `0 ${pxToRem(12)} ${pxToRem(26)} ${pxToRem(-16)} hsl(var(--primary))`,
              color: "#fff",
              cursor: "pointer",
              fontSize: pxToRem(discard.buttonFontSize),
              fontWeight: 600,
              height: pxToRem(discard.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(discard.keepPaddingX)}`,
              transition: `filter ${motion.transitionSeconds}s`,
            }}
            type="button"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * SPEC §A.10 — tam ekran görsel. Tek eylem "Kaldır"; handoff'un karalama/kırpma
 * düzenleyicisi bu iş kapsamında değil (SPEC'te de kapsam dışı yazıyor).
 */
export function BugReportLightbox({
  caption,
  closeLabel,
  onClose,
  onRemove,
  open,
  removeLabel,
  title,
}: {
  readonly caption: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly onRemove: () => void;
  readonly open: boolean;
  readonly removeLabel: string;
  readonly title: string;
}) {
  return (
    <Modal
      className="max-w-none overflow-visible rounded-none bg-transparent p-0 shadow-none backdrop-blur-none sm:rounded-none sm:p-0"
      hideHeader
      onClose={onClose}
      open={open}
      overlayClassName="z-[82] items-center backdrop-blur-none"
      overlayStyle={{
        background: `hsl(var(--background) / ${lightbox.backdropAlpha})`,
        padding: pxToRem(lightbox.backdropPadding),
      }}
      style={{ background: "transparent", border: 0, width: "auto" }}
      title={title}
    >
      <div
        data-testid="bug-report-lightbox"
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: pxToRem(lightbox.gap),
        }}
      >
        <div
          style={{
            aspectRatio: "16 / 10",
            background: `repeating-linear-gradient(135deg,hsl(var(--surface-secondary)) 0 ${pxToRem(
              lightbox.stripeStep,
            )},hsl(var(--surface-tertiary) / ${lightbox.stripeAlpha}) ${pxToRem(
              lightbox.stripeStep,
            )} ${pxToRem(lightbox.stripePeriod)})`,
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(lightbox.frameRadius),
            maxWidth: "100%",
            overflow: "hidden",
            position: "relative",
            width: pxToRem(lightbox.frameWidth),
          }}
        >
          <div
            style={{
              alignItems: "center",
              color: "hsl(var(--text-muted))",
              display: "flex",
              flexDirection: "column",
              gap: pxToRem(lightbox.captionGap),
              inset: 0,
              justifyContent: "center",
              position: "absolute",
            }}
          >
            <ImagePlaceholderIcon size={lightbox.iconSize} strokeWidth={lightbox.iconStroke} />
            <span
              style={{
                fontSize: pxToRem(lightbox.captionFontSize),
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {caption}
            </span>
          </div>
          <button
            aria-label={closeLabel}
            data-testid="bug-report-lightbox-close"
            onClick={onClose}
            style={{
              background: `hsl(var(--surface-card) / ${lightbox.closeSurfaceAlpha})`,
              border: 0,
              borderRadius: pxToRem(lightbox.closeRadius),
              color: "hsl(var(--text-secondary))",
              cursor: "pointer",
              display: "grid",
              height: pxToRem(lightbox.closeSize),
              placeItems: "center",
              position: "absolute",
              right: pxToRem(lightbox.closeInset),
              top: pxToRem(lightbox.closeInset),
              transition: `background ${motion.transitionSeconds}s`,
              width: pxToRem(lightbox.closeSize),
            }}
            title={closeLabel}
            type="button"
          >
            <CloseIcon size={lightbox.closeIconSize} strokeWidth={2} />
          </button>
        </div>
        <button
          data-testid="bug-report-lightbox-remove"
          onClick={onRemove}
          style={{
            alignItems: "center",
            background: `hsl(var(--danger) / ${lightbox.removeSurfaceAlpha})`,
            border: `${hairline()} solid hsl(var(--danger) / ${lightbox.removeBorderAlpha})`,
            borderRadius: pxToRem(lightbox.removeRadius),
            color: "hsl(var(--danger))",
            cursor: "pointer",
            display: "flex",
            fontSize: pxToRem(lightbox.removeFontSize),
            fontWeight: 600,
            gap: pxToRem(lightbox.removeGap),
            height: pxToRem(lightbox.removeHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(lightbox.removePaddingX)}`,
            transition: `background ${motion.transitionSeconds}s`,
          }}
          type="button"
        >
          <TrashIcon size={lightbox.removeIconSize} strokeWidth={1.9} />
          {removeLabel}
        </button>
      </div>
    </Modal>
  );
}
