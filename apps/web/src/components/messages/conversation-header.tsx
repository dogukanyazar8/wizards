"use client";

import React from "react";
import { BellOff, MoreHorizontal, Phone, Pin, Search, Video } from "lucide-react";
import type { DMParticipantRole } from "@wizards/types";

import { Avatar } from "@/components/ui/avatar";
import { DISPLAY_FONT } from "@/components/home/home-primitives";
import {
  MUTE_DURATION_LABEL_KEYS,
  resolveMutePillDuration,
} from "@/components/messages/mute-submenu";
import { useI18n } from "@/components/providers/locale-provider";
import {
  deriveFriendStatusText,
  resolveHomeCopy,
  type FriendVoiceRoom,
  type HomePresenceStatus,
} from "@/lib/home/presentation";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Sohbet başlığı — SPEC-MESAJLAR §5.1.
 *
 * İki varyant tek bileşende: 1:1 sohbet avatar + presence noktası + `@kullanıcı`
 * çipi taşır, grup ise renkli tile + üye sayacı + avatar yığını. Ayrı iki bileşen
 * olsalardı sağdaki ikon şeridi ve panel vurgusu iki kez yazılırdı ve ikisi
 * zamanla birbirinden ayrılırdı.
 *
 * **250 üyeli grupta roster çekilmez.** Yığın en çok `memberStackVisibleCount`
 * gerçek avatar çizer, kalanı `+N` çipine düşer; sayaç `memberCount` alanından
 * gelir. Çağıran bu iki alanı zaten elinde tutuyor.
 */

const { conversation, moreMenu: menuMetrics } = MESSAGES_METRICS;

/** Başlıktaki hangi panelin açık olduğu — ikon vurgusunun tek kaynağı. */
export type ConversationHeaderPanel = "search" | "thread" | null;

export type ConversationHeaderMember = {
  avatarUrl: string | null;
  displayName: string | null;
  userId: string;
  username: string;
};

export type ConversationHeaderProps = {
  /** Grup ikonu tonu; `avatarColor` token adı, ham renk değil. */
  avatarColor?: string | undefined;
  avatarUrl?: string | null | undefined;
  /** Çağrı butonları; ses altyapısı yokken pasif çizilir, gizlenmez. */
  callDisabled?: boolean;
  customStatus?: string | null | undefined;
  lastSeenAt?: string | null | undefined;
  memberCount?: number | undefined;
  /**
   * §17'nin `...` menüsü. Başlık menüyü **çizmez**, ona bir yer açar: menü
   * `position:absolute; top:41; right:0` ile tetikleyicisine bağlı ve o sarmalayıcı
   * burada. İçeriğini `ConversationMoreMenu` doldurur, durumunu çağıran tutar.
   */
  moreMenu?: React.ReactNode;
  /** Menü açık mı — `...` butonunun vurgusu ve `aria-expanded` değeri. */
  moreOpen?: boolean;
  /** §17 sessiz pill'i. Süresi dolmuşsa pill hiç çizilmez. */
  muted?: boolean;
  mutedUntil?: string | null | undefined;
  name: string;
  /** Test tohumu: pill'in "süresi doldu mu" kararı bu ana göre verilir. */
  now?: Date | undefined;
  onlineCount?: number | undefined;
  onOpenMore?: (() => void) | undefined;
  onOpenSearch: () => void;
  /**
   * Sabitlenen mesajlar sayfasını açar. SPEC §5.1 bu yuvada bir "thread paneli"
   * ikonu tarif ediyor, ama thread paneli bir **kök mesaj** ister ve başlıkta
   * öyle bir mesaj yok; ikon o yüzden sabitlenenlere bağlı ve etiketi de onu
   * söylüyor. Thread paneli mesajın kendi şeridinden ve hover şeridinden açılır.
   */
  onOpenPins: () => void;
  onStartVideoCall: () => void;
  onStartVoiceCall: () => void;
  /** Pill'in tek eylemi: sessizliği kaldır (`{ muted: false }`). */
  onUnmute?: (() => void) | undefined;
  openPanel?: ConversationHeaderPanel;
  /** Yığında çizilecek üyeler; en çok 4 kayıt yeter, tamamı istenmez. */
  previewMembers?: readonly ConversationHeaderMember[] | undefined;
  /** Konuşmanın kendisi sabitli mi (`DMParticipant.pinnedAt`) — mesaj sabiti değil. */
  pinned?: boolean;
  role?: DMParticipantRole | undefined;
  status?: HomePresenceStatus | undefined;
  username?: string | null | undefined;
  variant: "dm" | "group";
  voiceRoom?: FriendVoiceRoom | null | undefined;
};

const STATUS_DOT_CLASS: Readonly<Record<HomePresenceStatus, string>> = Object.freeze({
  DND: "bg-[hsl(var(--danger))]",
  IDLE: "bg-[hsl(var(--warning))]",
  OFFLINE: "bg-[hsl(var(--text-soft))]",
  ONLINE: "bg-[hsl(var(--success))]",
});

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");

  return letters.join("").toLocaleUpperCase("tr") || "?";
}

function HeaderAction({
  active,
  disabled,
  expanded,
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  active?: boolean;
  disabled?: boolean;
  /** Menü tetikleyicisi: `aria-pressed` yerine `aria-expanded` + `aria-haspopup`. */
  expanded?: boolean;
  icon: typeof Phone;
  label: string;
  onClick: (() => void) | undefined;
  testId: string;
}) {
  return (
    <button
      aria-label={label}
      aria-expanded={expanded ?? undefined}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      // Panel açıkken `aria-pressed`: vurgu yalnız renkle anlatılsaydı ekran
      // okuyucu kullanıcısı hangi panelin açık olduğunu hiç öğrenemezdi.
      aria-pressed={active ?? undefined}
      className={cn(
        "grid shrink-0 place-items-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "bg-[hsl(var(--primary)/0.16)] text-[var(--primary-readable)]"
          : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft)/0.7)] hover:text-[hsl(var(--foreground))]",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
      )}
      data-testid={testId}
      disabled={disabled ?? false}
      onClick={onClick}
      style={{
        borderRadius: pxToRem(conversation.actionRadius),
        height: pxToRem(conversation.actionSize),
        width: pxToRem(conversation.actionSize),
      }}
      title={label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        style={{
          height: pxToRem(conversation.actionIconSize),
          width: pxToRem(conversation.actionIconSize),
        }}
      />
    </button>
  );
}

export function ConversationHeader({
  avatarColor,
  avatarUrl,
  callDisabled = false,
  customStatus,
  lastSeenAt,
  memberCount,
  moreMenu,
  moreOpen = false,
  muted = false,
  mutedUntil = null,
  name,
  now,
  onlineCount,
  onOpenMore,
  onOpenSearch,
  onOpenPins,
  onStartVideoCall,
  onStartVoiceCall,
  onUnmute,
  openPanel = null,
  previewMembers,
  pinned = false,
  status,
  username,
  variant,
  voiceRoom,
}: ConversationHeaderProps) {
  const { t } = useI18n();
  const isGroup = variant === "group";
  const members = previewMembers ?? [];
  const visible = members.slice(0, conversation.memberStackVisibleCount);
  // Fazlalık `memberCount`'tan türer, `members.length`'ten değil: çağıran yığın
  // için yalnız birkaç kayıt taşıyor, roster'ın tamamını değil.
  const overflow = Math.max(0, (memberCount ?? members.length) - visible.length);

  /**
   * Pill'in tek karar noktası. `resolveMutePillDuration` içeride `isMuteActive`
   * çağırıyor; başlıkta ikinci bir tarih karşılaştırması yok, yoksa süresi dolmuş bir
   * sessizlik başlıkta duran ama bildirimleri geçiren bir pill'e dönerdi.
   */
  const pillDuration = resolveMutePillDuration({ muted, mutedUntil }, now ?? new Date());
  const pillLabel =
    pillDuration === null
      ? null
      : pillDuration === "forever"
        ? t("messages.more.mute.pillForever")
        : t("messages.more.mute.pill", { duration: t(MUTE_DURATION_LABEL_KEYS[pillDuration]) });

  const subtitle = isGroup
    ? [
        memberCount === undefined
          ? null
          : t("messages.conversation.memberCount", { count: memberCount }),
        onlineCount === undefined
          ? null
          : t("messages.conversation.onlineCount", { count: onlineCount }),
      ].filter((part): part is string => Boolean(part))
    : [
        resolveHomeCopy(
          deriveFriendStatusText(
            {
              customStatus: customStatus ?? null,
              lastSeenAt: lastSeenAt ?? null,
              status: status ?? "OFFLINE",
              voiceRoom: voiceRoom ?? null,
            },
            new Date(),
          ),
          t,
        ),
      ];

  return (
    <header
      className="flex shrink-0 items-center bg-[hsl(var(--surface-base))]"
      data-testid="conversation-header"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
        gap: pxToRem(conversation.headerGap),
        padding: `${pxToRem(conversation.headerPaddingY)} ${pxToRem(conversation.headerPaddingX)}`,
      }}
    >
      {isGroup ? (
        <span
          aria-hidden="true"
          className={cn("grid shrink-0 place-items-center text-white", DISPLAY_FONT)}
          data-testid="conversation-header-group-tile"
          style={{
            background: getGroupSwatchBackground(avatarColor),
            ...(getGroupSwatchInk(avatarColor) ? { color: getGroupSwatchInk(avatarColor) } : {}),
            borderRadius: pxToRem(conversation.groupTileRadius),
            fontSize: pxToRem(conversation.groupTileFontSize),
            fontWeight: 600,
            height: pxToRem(conversation.groupTileSize),
            width: pxToRem(conversation.groupTileSize),
          }}
        >
          {initialsOf(name)}
        </span>
      ) : (
        <span className="relative inline-flex shrink-0">
          <Avatar
            alt={name}
            className="rounded-full"
            fallback={name}
            src={avatarUrl ?? null}
            style={{
              height: pxToRem(conversation.avatarSize),
              width: pxToRem(conversation.avatarSize),
            }}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute rounded-full border-[hsl(var(--surface-base))]",
              STATUS_DOT_CLASS[status ?? "OFFLINE"],
            )}
            data-testid="conversation-header-presence"
            style={{
              borderWidth: pxToRem(conversation.presenceDotBorderWidth),
              bottom: pxToRem(conversation.presenceDotOffset),
              height: pxToRem(conversation.presenceDotSize),
              right: pxToRem(conversation.presenceDotOffset),
              width: pxToRem(conversation.presenceDotSize),
            }}
          />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(conversation.titleGap) }}>
          <h1
            className={cn("min-w-0 truncate text-[hsl(var(--foreground))]", DISPLAY_FONT)}
            data-testid="conversation-header-title"
            style={{
              fontSize: pxToRem(conversation.titleFontSize),
              fontWeight: 600,
              lineHeight: conversation.titleLineHeight,
            }}
          >
            {name}
          </h1>

          {!isGroup && username ? (
            <span
              className="shrink-0 bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-secondary))]"
              data-testid="conversation-header-handle"
              style={{
                borderRadius: pxToRem(conversation.handleChipRadius),
                fontSize: pxToRem(conversation.handleChipFontSize),
                padding: `${pxToRem(conversation.handleChipPaddingY)} ${pxToRem(conversation.handleChipPaddingX)}`,
              }}
            >
              @{username}
            </span>
          ) : null}

          {isGroup && pinned ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 bg-[hsl(var(--primary)/0.14)] text-[var(--primary-readable)]"
              data-testid="conversation-header-pinned-chip"
              style={{
                borderRadius: pxToRem(conversation.handleChipRadius),
                fontSize: pxToRem(conversation.handleChipFontSize),
                padding: `${pxToRem(conversation.handleChipPaddingY)} ${pxToRem(conversation.handleChipPaddingX)}`,
              }}
            >
              <Pin aria-hidden="true" className="h-3 w-3" />
              {t("messages.conversation.pinnedChip")}
            </span>
          ) : null}
        </div>

        {subtitle.length > 0 ? (
          <p
            className="flex min-w-0 items-center text-[hsl(var(--text-secondary))]"
            data-testid="conversation-header-subtitle"
            style={{
              fontSize: pxToRem(conversation.subtitleFontSize),
              gap: pxToRem(conversation.subtitleGap),
              marginTop: pxToRem(conversation.subtitleMarginTop),
            }}
          >
            {subtitle.map((part, index) => (
              <React.Fragment key={part}>
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="shrink-0 rounded-full bg-[hsl(var(--text-soft))]"
                    style={{
                      height: pxToRem(conversation.subtitleDotSize),
                      width: pxToRem(conversation.subtitleDotSize),
                    }}
                  />
                ) : null}
                <span className="min-w-0 truncate">{part}</span>
              </React.Fragment>
            ))}
          </p>
        ) : null}
      </div>

      {isGroup && visible.length > 0 ? (
        <div
          className="flex shrink-0 items-center"
          data-testid="conversation-header-member-stack"
          style={{
            gap: pxToRem(conversation.memberStackGap),
            marginLeft: pxToRem(conversation.memberStackMarginLeft),
          }}
        >
          {visible.map((member) => (
            <Avatar
              alt={member.displayName ?? member.username}
              className="rounded-full"
              fallback={member.displayName ?? member.username}
              key={member.userId}
              src={member.avatarUrl}
              style={{
                fontSize: pxToRem(conversation.memberStackAvatarFontSize),
                height: pxToRem(conversation.memberStackAvatarSize),
                width: pxToRem(conversation.memberStackAvatarSize),
              }}
            />
          ))}
          {overflow > 0 ? (
            <span
              className="grid place-items-center rounded-full bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-secondary))]"
              data-testid="conversation-header-member-overflow"
              style={{
                fontSize: pxToRem(conversation.memberStackOverflowFontSize),
                fontWeight: 600,
                height: pxToRem(conversation.memberStackAvatarSize),
                width: pxToRem(conversation.memberStackAvatarSize),
              }}
            >
              {t("messages.conversation.memberOverflow", { count: overflow })}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center" style={{ gap: pxToRem(conversation.actionsGap) }}>
        {pillLabel === null ? null : (
          <button
            /*
             * Etiket iki şeyi birden söyler: sessizliğin **hâli** ve düğmenin ne
             * yapacağı. Yalnız "8 saat sessiz" deseydi ekran okuyucu kullanıcısı bunun
             * tıklanabilir olduğunu, yalnız "Sessize almayı kaldır" deseydi ne kadar
             * süre kaldığını öğrenemezdi.
             */
            aria-label={`${pillLabel} · ${t("messages.more.mute.pillAction")}`}
            className="inline-flex shrink-0 items-center border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] hover:bg-[hsl(var(--warning)/0.2)]"
            data-testid="conversation-header-mute-pill"
            onClick={onUnmute}
            style={{
              borderRadius: pxToRem(menuMetrics.mutePillRadius),
              fontSize: pxToRem(menuMetrics.mutePillFontSize),
              fontWeight: 600,
              gap: pxToRem(menuMetrics.mutePillGap),
              height: pxToRem(menuMetrics.mutePillHeight),
              lineHeight: 1,
              marginRight: pxToRem(menuMetrics.mutePillMarginRight),
              padding: `0 ${pxToRem(menuMetrics.mutePillPaddingX)}`,
              whiteSpace: "nowrap",
            }}
            title={t("messages.more.mute.pillAction")}
            type="button"
          >
            <BellOff
              aria-hidden="true"
              style={{
                height: pxToRem(menuMetrics.mutePillIconSize),
                width: pxToRem(menuMetrics.mutePillIconSize),
              }}
            />
            {pillLabel}
          </button>
        )}
        <HeaderAction
          disabled={callDisabled}
          icon={Phone}
          label={t("messages.conversation.action.voiceCall")}
          onClick={onStartVoiceCall}
          testId="conversation-header-voice-call"
        />
        <HeaderAction
          disabled={callDisabled}
          icon={Video}
          label={t("messages.conversation.action.videoCall")}
          onClick={onStartVideoCall}
          testId="conversation-header-video-call"
        />
        <span
          aria-hidden="true"
          className="shrink-0 bg-[hsl(var(--border)/0.6)]"
          style={{
            height: pxToRem(conversation.actionSeparatorHeight),
            margin: `0 ${pxToRem(conversation.actionSeparatorMarginX)}`,
            width: pxToRem(conversation.actionSeparatorWidth),
          }}
        />
        <HeaderAction
          active={openPanel === "thread"}
          icon={Pin}
          label={t("messages.conversation.action.pins")}
          onClick={onOpenPins}
          testId="conversation-header-pins"
        />
        <HeaderAction
          active={openPanel === "search"}
          icon={Search}
          label={t("messages.conversation.action.search")}
          onClick={onOpenSearch}
          testId="conversation-header-search"
        />
        {/*
          Menü tetikleyicisinin **kendi** sarmalayıcısı: §17 menüyü `top:41; right:0`
          ile buraya bağlıyor. `pointerdown` menü açıkken burada durur — durmasaydı
          menünün dışına tıklamayı dinleyen kabuk `...` tıklamasını da "dışarı" sayar,
          menüyü kapatır ve hemen ardından gelen `click` onu yeniden açardı.
        */}
        <div
          className="relative"
          onPointerDown={(event) => {
            if (moreOpen) {
              event.stopPropagation();
            }
          }}
        >
          <HeaderAction
            active={moreOpen}
            expanded={moreOpen}
            icon={MoreHorizontal}
            label={t("messages.conversation.action.more")}
            onClick={onOpenMore}
            testId="conversation-header-more"
          />
          {moreMenu}
        </div>
      </div>
    </header>
  );
}
