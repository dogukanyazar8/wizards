"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Sağ panellerin ortak kabuğu — SPEC-MESAJLAR §6.
 *
 * Thread ve arama panelleri aynı başlık satırını, aynı genişliği ve aynı kapatma
 * davranışını paylaşıyor. İki kez yazılsalardı biri zamanla diğerinden ayrılırdı
 * — ve fark önce erişilebilirlikte görünürdü, çünkü orası en kolay unutulan yer.
 *
 * **Docked ile overlay farkı bilerek keskin.** `<1100px`'te panel ana alanın
 * üstüne biniyor ve o hâlde bir diyalogdur: `role="dialog"` + `aria-modal` +
 * focus tuzağı. Yerleşikken ise ekranın bir parçasıdır (`role="complementary"`)
 * ve tuzak **kurulmaz** — kurulsaydı klavye kullanıcısı, sohbetin geri kalanı
 * gözünün önündeyken oraya hiç gidemezdi.
 */

const { sidePanel } = MESSAGES_METRICS;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type MessagesSidePanelProps = {
  actions?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  /** `true` ise panel ana alanın üstünde duruyor (<1100px). */
  overlay?: boolean;
  subtitle?: string | null;
  testId?: string;
  title: string;
};

export function MessagesSidePanel({
  actions,
  children,
  icon,
  onClose,
  overlay = false,
  subtitle,
  testId,
  title,
}: MessagesSidePanelProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Açılışta odak başlığa taşınır: taşınmasaydı panel açıldıktan sonra `Tab`
  // kullanıcıyı sayfanın başına değil, tetikleyen ikonun **sonrasına** götürür
  // ve panelin içine hiç uğramazdı.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !overlay) {
        return;
      }

      const panel = panelRef.current;
      const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);

      if (!panel || !focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [overlay]);

  return (
    <aside
      aria-label={title}
      aria-modal={overlay ? true : undefined}
      className={cn(
        "flex min-h-0 flex-col bg-[hsl(var(--surface-panel))]",
        overlay ? "absolute inset-y-0 right-0 z-50 shadow-2xl" : "relative",
      )}
      data-overlay={overlay ? "true" : undefined}
      /*
        Ortak kanca: `data-testid` panele özel olabiliyor (`messages-search-panel`,
        `thread-panel`) ve "hangi panel açık olursa olsun" sorusunu soran testler
        onu bulamıyordu. Kanca her iki panelde de aynı, kimlik ayrı kalıyor.
      */
      data-messages-side-panel="true"
      data-testid={testId ?? "messages-side-panel"}
      ref={panelRef}
      role={overlay ? "dialog" : "complementary"}
      style={{
        borderLeft: `${hairline()} solid hsl(var(--border)/0.5)`,
        flex: "none",
        width: pxToRem(sidePanel.width),
      }}
    >
      <div
        className="flex shrink-0 items-start"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/0.5)`,
          gap: pxToRem(sidePanel.headerGap),
          padding: `${pxToRem(sidePanel.headerPaddingTop)} ${pxToRem(sidePanel.headerPaddingX)} ${pxToRem(sidePanel.headerPaddingBottom)}`,
        }}
      >
        {icon ? (
          <span
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--primary))]"
            style={{
              height: pxToRem(sidePanel.headerIconSize),
              width: pxToRem(sidePanel.headerIconSize),
            }}
          >
            {icon}
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "min-w-0 truncate text-[hsl(var(--foreground))] focus-visible:outline-hidden",
              DISPLAY_FONT,
            )}
            data-testid="messages-side-panel-title"
            ref={headingRef}
            style={{ fontSize: pxToRem(sidePanel.headerTitleFontSize), fontWeight: 600 }}
            tabIndex={-1}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className="min-w-0 truncate text-[hsl(var(--text-secondary))]"
              data-testid="messages-side-panel-subtitle"
              style={{
                fontSize: pxToRem(sidePanel.headerSubtitleFontSize),
                marginTop: pxToRem(sidePanel.headerSubtitleMarginTop),
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}

        <button
          aria-label={t("messages.panel.close")}
          className="grid shrink-0 place-items-center text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft)/0.7)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="messages-side-panel-close"
          onClick={onClose}
          style={{
            borderRadius: pxToRem(sidePanel.closeRadius),
            height: pxToRem(sidePanel.closeSize),
            width: pxToRem(sidePanel.closeSize),
          }}
          type="button"
        >
          <X
            aria-hidden="true"
            style={{
              height: pxToRem(sidePanel.closeIconSize),
              width: pxToRem(sidePanel.closeIconSize),
            }}
          />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </aside>
  );
}
