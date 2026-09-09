"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";

/**
 * SPEC-SUNUCU §3.1 — metin kanalı başlığı.
 *
 * Ş6. Başlık `chat-area.tsx`in içinde satır içi bir bloktu ve Mesajlar paketinin diliyle
 * çiziliyordu (`min-h-11`, `rounded-[1rem]`, `gap-2`); §3.1'in `14px 20px` çerçevesi, `33×33`
 * düğmeleri, `1×22` ayracı ve kategori/bildirim çipleri orada yoktu. Bileşen **saf sunum**:
 * veri ve mutasyon `chat-area.tsx`te kalır, buraya prop olarak gelir.
 *
 * Ölçüler `SERVER_METRICS.textHeader`ten; bileşende çıplak sayı yok (00 §3). Renk yalnız
 * `hsl(var(--token))` (00 §2.7).
 *
 * A11y (00 §8, §12): ikon-only üç düğme `aria-label` taşır, aktif olan `aria-pressed`;
 * `Üyeler` düğmesi metin + ikon.
 */

const { textHeader } = SERVER_METRICS;

/** `Sunucu.dc.html` §3.1 — `#` ikonu, zil üçlüsü, raptiye, arama, üye. */
const HASH_PATH = "M10 3 8 21M16 3l-2 18M3.5 8.5h17M3 15.5h17";
const SEARCH_PATH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3";
const BELL_PATH = "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0";
const BELL_MENTION_PATH =
  "M12 21a9 9 0 1 1 8.5-6M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM15.5 8.5v4.5a2.5 2.5 0 0 0 5 0V12";
const BELL_OFF_PATH =
  "M13.7 21a2 2 0 0 1-3.4 0M18 8a6 6 0 0 0-9.3-5M5.3 5.3A6 6 0 0 0 6 8c0 7-3 9-3 9h13M3 3l18 18";
const PIN_PATH = "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z";
const USERS_PATH =
  "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M13 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M21 20v-1.5a4 4 0 0 0-3-3.9";

export type ChannelNotificationLevel = "all" | "mentions" | "muted";

const NOTIFICATION_ICON_PATH: Record<ChannelNotificationLevel, string> = {
  all: BELL_PATH,
  mentions: BELL_MENTION_PATH,
  muted: BELL_OFF_PATH,
};

/**
 * §3.1 — "Zil ikonunun rengi bildirim tercihine göre değişir." Üç ton üç tokendan gelir;
 * dördüncü bir renk uydurulmaz.
 */
const NOTIFICATION_TONE: Record<ChannelNotificationLevel, string> = {
  all: "--primary",
  mentions: "--warning",
  muted: "--danger",
};

function HeaderGlyph({ path, size }: { path: string; size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(size)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={pxToEm(size)}
    >
      <path d={path} />
    </svg>
  );
}

function actionButtonStyle(active: boolean): React.CSSProperties {
  return {
    background: active
      ? `hsl(var(--primary)/${textHeader.actionActiveBackgroundAlpha})`
      : "transparent",
    borderRadius: pxToRem(textHeader.actionRadius),
    color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
    height: pxToRem(textHeader.actionSize),
    width: pxToRem(textHeader.actionSize),
  };
}

export type ServerChannelHeaderProps = {
  /** `N üye erişebilir` — türetilemediğinde `null` (bkz. `channel-access-count.ts`). */
  readonly accessCount: number | null;
  readonly categoryName: string | null;
  readonly channelName: string;
  readonly locked: boolean;
  readonly membersActive: boolean;
  readonly membersDisabled: boolean;
  readonly notificationLevel: ChannelNotificationLevel;
  readonly onOpenMembers: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenPins: () => void;
  readonly onOpenSearch: () => void;
  readonly pinnedCount: number;
  readonly pinsActive: boolean;
  readonly searchActive: boolean;
  readonly searchButtonRef?: React.RefObject<HTMLButtonElement | null>;
  readonly topic: string | null;
};

export function ServerChannelHeader({
  accessCount,
  categoryName,
  channelName,
  locked,
  membersActive,
  membersDisabled,
  notificationLevel,
  onOpenMembers,
  onOpenNotifications,
  onOpenPins,
  onOpenSearch,
  pinnedCount,
  pinsActive,
  searchActive,
  searchButtonRef,
  topic,
}: ServerChannelHeaderProps) {
  const { t } = useI18n();

  /** §3.1 — çip yalnız `Yalnızca bahsedilmeler` ve `Sessize alındı` durumlarında çizilir. */
  const notificationChip =
    notificationLevel === "all" ? null : t(`server.channel.header.notif.${notificationLevel}`);

  const subtitleParts = [
    topic?.trim() || null,
    accessCount === null ? null : t("server.channel.header.accessCount", { count: accessCount }),
  ].filter((part): part is string => part !== null);

  return (
    <header
      className="flex min-w-0 flex-none items-center"
      // Parity matrisinin (`e2e/specs/design/server-parity.spec.ts`) metin kanalı tutamağı.
      data-testid="server-text-channel"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/${textHeader.borderBottomAlpha})`,
        gap: pxToRem(textHeader.gap),
        padding: `${pxToRem(textHeader.paddingY)} ${pxToRem(textHeader.paddingX)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="flex flex-none items-center text-[hsl(var(--text-muted))]"
        style={{ fontSize: pxToRem(textHeader.iconSize) }}
      >
        <HeaderGlyph path={HASH_PATH} size={textHeader.iconSize} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(textHeader.titleGap) }}>
          <h1
            className="truncate font-semibold text-[hsl(var(--foreground))]"
            data-testid="server-channel-title"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(textHeader.nameFontSize),
              letterSpacing: DISPLAY_TRACKING,
              lineHeight: textHeader.nameLineHeight,
            }}
          >
            {channelName}
          </h1>

          {categoryName ? (
            <span
              className="flex-none font-semibold whitespace-nowrap text-[hsl(var(--text-secondary))] uppercase"
              data-testid="server-channel-category-chip"
              style={{
                background: "hsl(var(--surface-soft))",
                borderRadius: pxToRem(textHeader.categoryChipRadius),
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(textHeader.categoryChipFontSize),
                lineHeight: 1,
                padding: `${pxToRem(textHeader.categoryChipPaddingY)} ${pxToRem(
                  textHeader.categoryChipPaddingX,
                )}`,
              }}
            >
              {categoryName}
            </span>
          ) : null}

          {locked ? (
            <span className="sr-only" data-testid="server-channel-locked">
              {t("server.channel.header.locked")}
            </span>
          ) : null}

          {notificationChip ? (
            <span
              className="flex flex-none items-center font-semibold whitespace-nowrap"
              data-testid="server-channel-notif-chip"
              style={{
                background: `hsl(var(--warning)/${textHeader.notifChipBackgroundAlpha})`,
                borderRadius: pxToRem(textHeader.notifChipRadius),
                color: "hsl(var(--warning))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(textHeader.notifChipFontSize),
                gap: pxToRem(textHeader.notifChipGap),
                lineHeight: 1,
                padding: `${pxToRem(textHeader.notifChipPaddingY)} ${pxToRem(
                  textHeader.notifChipPaddingX,
                )}`,
              }}
            >
              <HeaderGlyph
                path={NOTIFICATION_ICON_PATH[notificationLevel]}
                size={textHeader.notifChipIconSize}
              />
              {notificationChip}
            </span>
          ) : null}
        </div>

        {subtitleParts.length > 0 ? (
          <p
            className="truncate font-medium text-[hsl(var(--text-muted))]"
            data-testid="server-channel-subtitle"
            style={{
              fontSize: pxToRem(textHeader.subtitleFontSize),
              lineHeight: textHeader.subtitleLineHeight,
              marginTop: pxToRem(textHeader.subtitleMarginTop),
            }}
          >
            {subtitleParts.join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-none items-center" style={{ gap: pxToRem(textHeader.actionsGap) }}>
        <button
          aria-label={t("server.channel.header.search")}
          aria-pressed={searchActive}
          className="grid cursor-pointer place-items-center border-0 bg-transparent transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="server-channel-search"
          onClick={onOpenSearch}
          ref={searchButtonRef}
          style={actionButtonStyle(searchActive)}
          type="button"
        >
          <HeaderGlyph path={SEARCH_PATH} size={textHeader.actionIconSize} />
        </button>

        <button
          aria-label={t("server.channel.header.notifications")}
          className="grid cursor-pointer place-items-center border-0 bg-transparent transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-notification-level={notificationLevel}
          data-testid="server-channel-notifications"
          onClick={onOpenNotifications}
          style={{
            ...actionButtonStyle(false),
            // §3.1 son madde — zil rengi tercihten gelir; `all` dışındaki iki durum uyarı ve
            // tehlike tonuna geçer ve çiple aynı şeyi söyler.
            color: `hsl(var(${NOTIFICATION_TONE[notificationLevel]}))`,
          }}
          type="button"
        >
          <HeaderGlyph
            path={NOTIFICATION_ICON_PATH[notificationLevel]}
            size={textHeader.actionIconSize}
          />
        </button>

        <button
          aria-label={t("server.channel.header.pins", { count: pinnedCount })}
          aria-pressed={pinsActive}
          className="grid cursor-pointer place-items-center border-0 bg-transparent transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="server-channel-pins"
          onClick={onOpenPins}
          style={actionButtonStyle(pinsActive)}
          type="button"
        >
          <HeaderGlyph path={PIN_PATH} size={textHeader.actionIconSize} />
        </button>

        <span
          aria-hidden="true"
          className="flex-none"
          style={{
            background: "hsl(var(--border))",
            height: pxToRem(textHeader.dividerHeight),
            marginInline: pxToRem(textHeader.dividerMarginX),
            width: hairline(textHeader.dividerWidth),
          }}
        />

        <button
          aria-pressed={membersActive}
          className="flex cursor-pointer items-center border-0 font-semibold whitespace-nowrap transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="server-channel-members"
          disabled={membersDisabled}
          onClick={onOpenMembers}
          style={{
            background: membersActive
              ? `hsl(var(--primary)/${textHeader.actionActiveBackgroundAlpha})`
              : "transparent",
            borderRadius: pxToRem(textHeader.membersButtonRadius),
            color: membersActive ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(textHeader.membersButtonFontSize),
            gap: pxToRem(textHeader.membersButtonGap),
            height: pxToRem(textHeader.membersButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(textHeader.membersButtonPaddingX)}`,
          }}
          type="button"
        >
          <HeaderGlyph path={USERS_PATH} size={textHeader.actionIconSize} />
          {t("server.channel.header.members")}
        </button>
      </div>
    </header>
  );
}
