"use client";

import React, { memo, type ReactNode } from "react";
import { Search } from "lucide-react";

import { useCommandPalette } from "@/components/command/command-palette-provider";
import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useOptionalFocusControls } from "@/components/providers/focus-controls-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { NotificationBell } from "@/components/shared/notification-bell";
import {
  useAppShortcutAriaKeyShortcuts,
  useAppShortcutLabel,
} from "@/hooks/use-app-shortcut-label";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToEm, pxToRem } from "@/lib/home/metrics";
import { cn } from "@/lib/utils";

/**
 * Ana alan üst çubuğu — SPEC §2.3, `05-faz4` §2, `07-faz6` §1.
 *
 * **Dört yüzeyin tek çubuğu.** Ana Sayfa selamlamayı, üç yan ekran kendi adını
 * yazar; geri kalan her şey (arama alanı, kısayol çipi, bildirim butonu, odak
 * pill'i) aynı bileşendir. Yan ekranların ayrı bir handoff'u yok, o yüzden ayrı
 * bir çubuğu da yok — kopyalanmış bir çubuk bu paketin ilk sapması olurdu.
 */

const { topBar } = HOME_METRICS;

/**
 * Odak pill'i — `06-faz5` §3.3'ün üç yüzeyi artık dört. Sayı **tek kaynaktan**
 * gelir (`useFocusCountdown`'ın modül seviyesi motoru); dördüncü okuyucu
 * dördüncü bir timer açmaz. Kabuk dışında render edilen bir çubuk sağlayıcıyı
 * bulamayabilir, o yüzden tolere eden okuyucu kullanılıyor.
 */
function FocusPill({ fallbackMinutes }: { fallbackMinutes: number }) {
  const { t } = useI18n();
  const focus = useOptionalFocusControls();

  return (
    <span
      className="flex shrink-0 items-center text-[var(--warning-readable)]"
      data-testid="home-focus-pill"
      style={{
        background: "hsl(var(--warning) / 0.14)",
        borderRadius: pxToRem(HOME_METRICS.radius.pill),
        fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
        fontWeight: 600,
        gap: pxToRem(topBar.focusPillGap),
        lineHeight: 1,
        padding: `${pxToRem(topBar.focusPillPaddingY)} ${pxToRem(topBar.focusPillPaddingX)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full bg-[hsl(var(--warning))]"
        style={{
          height: pxToRem(topBar.focusPillDotSize),
          width: pxToRem(topBar.focusPillDotSize),
        }}
      />
      {t("home.focus.pill", { minutes: focus?.minutesLeft ?? fallbackMinutes })}
    </span>
  );
}

export type AppScreenTopBarProps = {
  /** Odak açıkken başlığın yanındaki pill; sunucunun ilk yanıtı yedek sayıdır. */
  focusMinutesLeft?: number | null;
  subtitle?: ReactNode;
  subtitleTestId?: string;
  testId?: string;
  title: ReactNode;
};

function AppScreenTopBarComponent({
  focusMinutesLeft = null,
  subtitle,
  subtitleTestId = "app-screen-top-bar-subtitle",
  testId = "app-screen-top-bar",
  title,
}: AppScreenTopBarProps) {
  const { t } = useI18n();
  const shortcut = useAppShortcutLabel("commandPalette.toggle");
  const ariaShortcut = useAppShortcutAriaKeyShortcuts("commandPalette.toggle");
  const palette = useCommandPalette();

  return (
    <header
      className="flex items-start justify-between"
      data-testid={testId}
      style={{
        gap: pxToRem(topBar.gap),
        padding: `${pxToRem(topBar.paddingTop)} ${pxToRem(topBar.paddingX)} ${pxToRem(
          topBar.paddingBottom,
        )}`,
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center" style={{ gap: pxToRem(topBar.titleGap) }}>
          <h1
            className={cn(DISPLAY_FONT, "m-0 truncate text-[hsl(var(--foreground))]")}
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.greeting.size),
              fontWeight: HOME_TYPE_SCALE.greeting.weight,
              letterSpacing: HOME_TYPE_SCALE.greeting.tracking,
              lineHeight: HOME_TYPE_SCALE.greeting.lineHeight,
            }}
          >
            {title}
          </h1>
          {focusMinutesLeft === null ? null : <FocusPill fallbackMinutes={focusMinutesLeft} />}
        </div>

        <p
          className="m-0 truncate text-[hsl(var(--text-muted))]"
          data-testid={subtitleTestId}
          style={{
            fontSize: pxToRem(topBar.subtitleFontSize),
            marginTop: pxToRem(topBar.subtitleMarginTop),
          }}
        >
          {subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center" style={{ gap: pxToRem(topBar.actionsGap) }}>
        {/* §5.1 — arama alanına tıklamak da paleti açar; kısayolun tek dinleyicisi kabukta. */}
        <button
          aria-haspopup="dialog"
          aria-keyshortcuts={ariaShortcut}
          aria-label={t("home.search.placeholder")}
          onClick={() => palette?.open()}
          className="flex items-center border-solid border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] text-left outline-hidden transition-[border-color] hover:border-[hsl(var(--primary)/0.6)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="home-command-search"
          style={{
            borderRadius: pxToRem(topBar.searchRadius),
            borderWidth: hairline(topBar.searchBorderWidth),
            gap: pxToRem(topBar.searchGap),
            padding: `${pxToRem(topBar.searchPaddingY)} ${pxToRem(topBar.searchPaddingX)}`,
            transitionDuration: `${HOME_METRICS.motion.durationSearchBorder}s`,
            width: pxToRem(topBar.searchWidth),
          }}
          type="button"
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            strokeWidth={topBar.searchIconStrokeWidth}
            style={{
              height: pxToEm(topBar.searchIconSize, topBar.searchPlaceholderFontSize),
              width: pxToEm(topBar.searchIconSize, topBar.searchPlaceholderFontSize),
            }}
          />
          <span
            className="flex-1 truncate text-[hsl(var(--text-muted))]"
            style={{ fontSize: pxToRem(topBar.searchPlaceholderFontSize) }}
          >
            {t("home.search.placeholder")}
          </span>
          <span
            className={cn(DISPLAY_FONT, "shrink-0 text-[hsl(var(--text-muted))]")}
            style={{
              background: "hsl(var(--surface-tertiary))",
              borderRadius: pxToRem(topBar.searchKbdRadius),
              fontSize: pxToRem(topBar.searchKbdFontSize),
              fontWeight: 600,
              lineHeight: topBar.searchKbdLineHeight,
              padding: `${pxToRem(topBar.searchKbdPaddingY)} ${pxToRem(topBar.searchKbdPaddingX)}`,
            }}
          >
            {shortcut}
          </span>
        </button>

        {/* Mevcut `NotificationBell` davranışı (popover, sorgular, soket) yeniden yazılmaz. */}
        <NotificationBell
          badgeVariant="dot"
          className="border-solid border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--primary))]"
          style={{
            borderRadius: pxToRem(topBar.bellRadius),
            borderWidth: hairline(topBar.bellBorderWidth),
            height: pxToRem(topBar.bellSize),
            width: pxToRem(topBar.bellSize),
          }}
        />
      </div>
    </header>
  );
}

export const AppScreenTopBar = memo(AppScreenTopBarComponent);
