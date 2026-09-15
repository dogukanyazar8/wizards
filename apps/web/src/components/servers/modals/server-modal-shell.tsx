"use client";

import React from "react";

import { Modal } from "@/components/ui/modal";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToRem } from "@/lib/servers/metrics";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import { cn } from "@/lib/utils";

/**
 * SPEC-SUNUCU §6 — sunucu pencerelerinin ortak kabuğu.
 *
 * **Ş8'in dosyası, Ş9 tarafından yazıldı.** Ş8 ve Ş9 aynı dalgada paralel koşuyor ve Ş9'un üç
 * penceresi kabuk olmadan çizilemezdi. Şekil Ş8 şerit dosyasının §3'ünden **birebir** alındı
 * (kaplama, kart, başlık, ayak, pasif düğme, genişlik kaynağı) ki Ş8 kendi iki penceresini
 * ikinci bir kabuk yazmadan buraya bağlayabilsin.
 *
 * `Esc`, focus tuzağı ve kapanışta tetikleyiciye dönüş `components/ui/modal`'dan gelir —
 * ikinci bir tuzak yazılmaz (00 §8). `hideHeader` ile o dosyanın kendi başlığı susturulur;
 * SPEC'in `38 r13` ikon kutulu başlığı burada çizilir.
 *
 * K11: kaplamanın katmanı `useLayerStack`ten gelir (pencere 80, sunucu ayarları 70), bu yüzden
 * pencere ayarların **üstünde** çizilir ve kapanınca ayarlara dönülür. Kabuk kendi sayısını
 * yazmaz; `ui/modal`ın sınıf üzerinden verdiği taban değeri satır içi katman ezer.
 */

const { modal } = SERVER_METRICS;

export type ServerModalWidthKey = keyof typeof SERVER_METRICS.modalWidths;

export type ServerModalTone = "primary" | "warning" | "danger" | "success" | "info";

export type ServerModalShellProps = {
  /**
   * Ş10 (940): gövde iki kolonlu bir ızgaradır ve boşluğu **kolonların içindedir**
   * (`Sunucu.dc.html` satır 955). `bodyClassName` ile ızgara sınıfı verilir, üç boşluk da
   * `0` geçilir; ortak gövde boşluğunu ezmenin başka yolu satır içi bir `style` sızdırmak
   * olurdu.
   */
  /**
   * Gövdeye `data-` tutamağı takar. Ş14'ün §11 kırılımı gövdenin **kendisini** seçiyor
   * (`data-server-single-column="grid"`); `className` ile verilemez çünkü seçici bir
   * öznitelik seçicisi ve ortak kabuk bu bilgiyi başka türlü dışarıya açmıyor.
   */
  readonly bodyAttributes?: Record<string, string>;
  readonly bodyClassName?: string;
  readonly bodyPaddingBottom?: number;
  readonly bodyPaddingTop?: number;
  readonly bodyPaddingX?: number;
  /** Izgara şablonunun okuduğu CSS değişkenleri gibi, sınıfla verilemeyen değerler. */
  readonly bodyStyle?: React.CSSProperties;
  readonly children: React.ReactNode;
  readonly closeLabel: string;
  readonly description: string;
  readonly footer?: React.ReactNode;
  readonly icon: React.ReactNode;
  readonly initialFocusRef?: React.RefObject<HTMLElement | null> | undefined;
  /**
   * Katman yığınındaki kimlik (K11). Aynı anda tek pencere açık kalır; ayarlar açıkken
   * açılan pencere ayarları kapatmaz, üstüne çizilir. Verilmezse genişlik anahtarı kullanılır
   * — iki farklı pencerenin aynı anda açılmadığı zaten mağazanın sözleşmesi.
   */
  readonly layerId?: string | undefined;
  readonly onClose: () => void;
  readonly open: boolean;
  /** Uzun içerik varsayılan olarak kartın içinde kaydırılır. */
  readonly scrollBody?: boolean;
  readonly title: string;
  readonly tone?: ServerModalTone;
  readonly width: ServerModalWidthKey;
};

/** Kaplama: `padding 34`, `background hsl(var(--background)/.72)`, ortalanmış. */
export const SERVER_MODAL_OVERLAY_CLASS = "items-center bg-[hsl(var(--background)/0.72)] sm:p-0";

/** Kart: `r22`, `surface-card`, `1px border`; kabuğun kendi boşluğu sıfırlanır. */
export const SERVER_MODAL_CARD_CLASS =
  "flex max-h-full flex-col overflow-hidden border bg-[hsl(var(--surface-card))] p-0 sm:p-0";

export function serverModalOverlayStyle(): React.CSSProperties {
  return { padding: pxToRem(modal.overlayPadding) };
}

export function serverModalCardStyle(width: ServerModalWidthKey): React.CSSProperties {
  return {
    // Satır içi: `ui/modal`ın `app-overlay` sınıfı kendi zeminini taşıyor ve SPEC'in
    // `surface-card` kartını yalnız satır içi bir değer kesin olarak ezer.
    backgroundColor: "hsl(var(--surface-card))",
    borderColor: "hsl(var(--border))",
    borderRadius: pxToRem(modal.cardRadius),
    borderWidth: hairline(),
    boxShadow: `${pxToRem(modal.cardShadow.x)} ${pxToRem(modal.cardShadow.y)} ${pxToRem(
      modal.cardShadow.blur,
    )} ${pxToRem(modal.cardShadow.spread)} hsl(var(--shadow-color))`,
    maxWidth: pxToRem(SERVER_METRICS.modalWidths[width]),
    width: "100%",
  };
}

export function serverModalPrimaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? "hsl(var(--primary))" : "hsl(var(--surface-tertiary))",
    borderRadius: pxToRem(modal.primaryRadius),
    boxShadow: enabled
      ? `${pxToRem(modal.primaryShadow.x)} ${pxToRem(modal.primaryShadow.y)} ${pxToRem(
          modal.primaryShadow.blur,
        )} ${pxToRem(modal.primaryShadow.spread)} hsl(var(--primary))`
      : "none",
    color: enabled ? "hsl(var(--primary-foreground))" : "hsl(var(--text-muted))",
    cursor: enabled ? "pointer" : "not-allowed",
    fontSize: pxToRem(modal.primaryFontSize),
    height: pxToRem(modal.primaryHeight),
    paddingInline: pxToRem(modal.primaryPaddingX),
  };
}

export function serverModalSecondaryButtonStyle(): React.CSSProperties {
  return {
    borderColor: "hsl(var(--border))",
    borderRadius: pxToRem(modal.secondaryRadius),
    borderWidth: hairline(),
    color: "hsl(var(--text-secondary))",
    fontSize: pxToRem(modal.secondaryFontSize),
    height: pxToRem(modal.secondaryHeight),
    paddingInline: pxToRem(modal.secondaryPaddingX),
  };
}

/** SPEC §6 ayağı: `14px 22px`, üst kenar `border/.5`, zemin `surface-secondary/.5`. */
export function serverModalFooterStyle(): React.CSSProperties {
  return {
    background: `hsl(var(--surface-secondary)/${modal.footerBackgroundAlpha})`,
    borderTop: `${hairline()} solid hsl(var(--border)/${modal.footerBorderTopAlpha})`,
    gap: pxToRem(modal.footerGap),
    paddingBlock: pxToRem(modal.footerPaddingY),
    paddingInline: pxToRem(modal.footerPaddingX),
  };
}

/**
 * §6.4'ün kenarsız ayağı — bildirim penceresi ortak ayağın düzeninde değil (sözlükteki
 * `SPEC_DEVIATIONS` başlığı bunu kayda geçiriyor).
 */
export function serverModalPlainFooterStyle(): React.CSSProperties {
  return {
    gap: pxToRem(modal.footerGap),
    paddingBottom: pxToRem(modal.plainFooterPaddingBottom),
    paddingInline: pxToRem(modal.plainFooterPaddingX),
    paddingTop: pxToRem(modal.plainFooterPaddingTop),
  };
}

export function ServerModalShell({
  bodyAttributes,
  bodyClassName,
  bodyPaddingBottom,
  bodyPaddingTop,
  bodyPaddingX,
  bodyStyle,
  children,
  closeLabel,
  description,
  footer,
  icon,
  initialFocusRef,
  layerId,
  onClose,
  open,
  scrollBody = true,
  title,
  tone = "primary",
  width,
}: ServerModalShellProps) {
  // `z-index` katmandan gelir; kabuk kendi sayısını uydurmaz (00 §4).
  const layer = useLayerStack({
    id: layerId ?? `server-modal:${width}`,
    kind: "modal",
    onClose,
    open,
  });

  return (
    <Modal
      className={SERVER_MODAL_CARD_CLASS}
      hideHeader
      initialFocusRef={initialFocusRef}
      onClose={onClose}
      open={open}
      overlayClassName={SERVER_MODAL_OVERLAY_CLASS}
      style={serverModalCardStyle(width)}
      title={title}
      overlayStyle={{ ...serverModalOverlayStyle(), zIndex: layer.zIndex }}
    >
      <div
        className="flex shrink-0 items-start"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/${modal.headerBorderBottomAlpha})`,
          gap: pxToRem(modal.headerGap),
          paddingBottom: pxToRem(modal.headerPaddingBottom),
          paddingInline: pxToRem(modal.headerPaddingX),
          paddingTop: pxToRem(modal.headerPaddingTop),
        }}
      >
        <span
          aria-hidden="true"
          className="grid flex-none place-items-center"
          style={{
            background: `hsl(var(--${tone})/0.14)`,
            borderRadius: pxToRem(modal.iconBoxRadius),
            color: `hsl(var(--${tone}))`,
            height: pxToRem(modal.iconBoxSize),
            width: pxToRem(modal.iconBoxSize),
          }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block font-semibold text-[hsl(var(--foreground))]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(modal.titleFontSize),
              letterSpacing: DISPLAY_TRACKING,
              lineHeight: modal.titleLineHeight,
            }}
          >
            {title}
          </span>
          <span
            className="block text-[hsl(var(--text-secondary))]"
            style={{
              fontSize: pxToRem(modal.subtitleFontSize),
              lineHeight: modal.subtitleLineHeight,
              marginTop: pxToRem(modal.subtitleMarginTop),
            }}
          >
            {description}
          </span>
        </span>
        <WindowCloseButton aria-label={closeLabel} onClick={onClose} />
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0",
          scrollBody && "flex-auto overflow-y-auto overscroll-contain",
          bodyClassName,
        )}
        style={{
          ...bodyStyle,
          paddingBottom: pxToRem(bodyPaddingBottom ?? modal.bodyPaddingBottom),
          paddingInline: pxToRem(bodyPaddingX ?? modal.bodyPaddingX),
          paddingTop: pxToRem(bodyPaddingTop ?? modal.bodyPaddingTop),
        }}
        {...bodyAttributes}
      >
        {children}
      </div>

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </Modal>
  );
}
