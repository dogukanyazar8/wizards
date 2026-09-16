"use client";

import React from "react";
import {
  Archive,
  Ban,
  Bell,
  BellOff,
  ChevronRight,
  Flag,
  Image as ImageIcon,
  List,
  LogOut,
  Mail,
  Pencil,
  Pin,
  Trash,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type {
  ConversationMuteDuration,
  DMParticipantRole,
  MessagesPresence,
  ProfilePanelTab,
} from "@wizards/types";

import { Avatar } from "@/components/ui/avatar";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MuteSubmenu, muteRowKeyAction } from "@/components/messages/mute-submenu";
import { isProfileAdminRole } from "@/components/messages/profile-panel-identity";
import { useI18n } from "@/components/providers/locale-provider";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";
import { MESSAGES_METRICS, hairline, pxToEm, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Başlıktaki `...` menüsü — SPEC-MESAJLAR §17.
 *
 * DM 254 / grup 262; iki liste tek bileşende, çünkü kabuk (başlık bloğu, satır ölçüsü,
 * ayırıcı, klavye sözleşmesi) ikisinde de aynı ve iki dosyaya bölünseydi ölçülerin biri
 * zamanla diğerinden ayrılırdı. Ayrışan tek şey **satır listesi**, ve o liste saf bir
 * fonksiyondan geliyor — `buildDmMenuEntries` / `buildGroupMenuEntries` DOM olmadan
 * sınanabilsin diye.
 *
 * Bileşen **hiçbir istek atmaz.** Her satır bir geri çağrıyı çağırır ve menü kapanır;
 * ağ, iyimser yazma ve toast'ı çağıran kurar. Menü bir seçim yüzeyidir, bir mutasyon
 * katmanı değil.
 */

const { moreMenu } = MESSAGES_METRICS;

export type ConversationMoreMenuAction =
  | "viewProfile"
  | "mute"
  | "markUnread"
  | "archive"
  | "export"
  | "block"
  | "report"
  | "groupProfile"
  | "viewMembers"
  | "addMembers"
  | "pinnedMessages"
  | "sharedMedia"
  | "notificationSettings"
  | "editGroup"
  | "clearHistory"
  | "leaveGroup"
  | "deleteGroup";

export type ConversationMoreMenuEntry =
  | { readonly kind: "row"; readonly action: ConversationMoreMenuAction; readonly count?: number }
  | { readonly kind: "separator" }
  | { readonly kind: "section" };

const ROW_LABEL_KEYS: Readonly<Record<ConversationMoreMenuAction, string>> = Object.freeze({
  archive: "messages.more.dm.archive",
  addMembers: "messages.more.group.addMembers",
  block: "messages.more.dm.block",
  clearHistory: "messages.more.group.clearHistory",
  deleteGroup: "messages.more.group.delete",
  editGroup: "messages.more.group.editGroup",
  export: "messages.more.dm.export",
  groupProfile: "messages.more.group.profile",
  leaveGroup: "messages.more.group.leave",
  markUnread: "messages.more.dm.markUnread",
  mute: "messages.more.mute.label",
  notificationSettings: "messages.more.group.notificationSettings",
  pinnedMessages: "messages.more.group.pinnedMessages",
  report: "messages.more.dm.report",
  sharedMedia: "messages.more.group.sharedMedia",
  viewMembers: "messages.more.group.viewMembers",
  viewProfile: "messages.more.dm.viewProfile",
});

type IconComponent = React.ComponentType<{
  "aria-hidden"?: "true" | boolean;
  style?: React.CSSProperties;
}>;

const ROW_ICONS: Readonly<Record<ConversationMoreMenuAction, IconComponent>> = Object.freeze({
  archive: Archive,
  addMembers: UserPlus,
  block: Ban,
  // `Trash` temizler, `Trash2` siler — `dc.html` de iki farklı çöp kutusu çiziyor ve
  // aynı ikonu iki yıkıcı satıra vermek onları göz ucuyla ayırt edilemez kılardı.
  clearHistory: Trash,
  deleteGroup: Trash2,
  editGroup: Pencil,
  export: Upload,
  groupProfile: Users,
  leaveGroup: LogOut,
  markUnread: Mail,
  mute: BellOff,
  notificationSettings: Bell,
  pinnedMessages: Pin,
  report: Flag,
  sharedMedia: ImageIcon,
  viewMembers: List,
  viewProfile: UserRound,
});

const DANGER_ACTIONS: ReadonlySet<ConversationMoreMenuAction> = new Set<ConversationMoreMenuAction>(
  ["block", "report", "leaveGroup", "deleteGroup"],
);

/**
 * §10'un dört satırı. Menü paneli **ilgili sekmeyle** açar; hangi sekme olduğunu satır
 * bilir, panel değil.
 */
export const PROFILE_TAB_ACTIONS: Readonly<
  Partial<Record<ConversationMoreMenuAction, ProfilePanelTab>>
> = Object.freeze({
  groupProfile: "genel",
  notificationSettings: "ayarlar",
  sharedMedia: "medya",
  viewMembers: "uyeler",
  viewProfile: "genel",
});

/**
 * Presence → sözlük anahtarı.
 *
 * `profile-panel-identity.tsx` ile **aynı** dört anahtar: aynı kişinin durumu menüde
 * `Çevrimiçi`, panelde `çevrimiçi` yazsaydı ikisinden biri yanlış olurdu. Harita orada
 * dışa aktarılmamış (dosya modülü değil satır içi bir sabit) ve o dosya bu şeridin yazma
 * listesinde değil, o yüzden ikinci kopya burada duruyor; birleştirmesi tek satır.
 */
const PRESENCE_LABEL_KEYS: Readonly<Record<MessagesPresence, string>> = Object.freeze({
  dnd: "home.presence.dnd",
  idle: "home.presence.idle",
  offline: "home.friends.offline",
  online: "home.presence.online",
});

/**
 * `Geçmişi temizle` — yönetici ve sahip. Sunucu da aynı kapıyı koyuyor
 * (`DELETE /api/v1/dm/groups/[id]/history`, OWNER/ADMIN).
 */
export function canClearGroupHistory(role: DMParticipantRole): boolean {
  return isProfileAdminRole(role);
}

/**
 * `Grubu sil` — **yalnız sahip** (Ş2 kararı). Sunucu `ADMIN`'e 403 veriyor; satırı
 * yöneticiye çizmek, tıklandığında hata veren bir düğme göstermek olurdu.
 */
export function canDeleteGroup(role: DMParticipantRole): boolean {
  return role === "OWNER";
}

/**
 * Art arda düşen ayırıcıları ve listenin başına/sonuna kaçanları eler.
 *
 * Gizlenen bir satır (yetkisiz `Grubu sil`, karşılığı olmayan `Sohbeti dışa aktar`)
 * kendi ayırıcılarını da götürmeliydi; götürmeseydi menüde neyi ayırdığı belli olmayan
 * çift çizgiler kalırdı.
 */
export function collapseSeparators(
  entries: readonly ConversationMoreMenuEntry[],
): readonly ConversationMoreMenuEntry[] {
  const collapsed: ConversationMoreMenuEntry[] = [];

  for (const entry of entries) {
    if (entry.kind !== "separator") {
      collapsed.push(entry);
      continue;
    }

    const previous = collapsed[collapsed.length - 1];

    if (previous !== undefined && previous.kind === "row") {
      collapsed.push(entry);
    }
  }

  while (collapsed.length > 0 && collapsed[collapsed.length - 1]?.kind !== "row") {
    collapsed.pop();
  }

  return collapsed;
}

/**
 * DM listesi — SPEC §17.
 *
 * `Sohbeti dışa aktar` varsayılan olarak **yok**: üründe sohbet başına döküm üreten bir
 * uç bulunmuyor (`GET /api/v1/users/me/data-export` hesabın tamamını verir ve sohbet
 * parametresi almaz). Yapamadığı bir şeyi vaat eden bir satır, pasif çizilse bile,
 * kullanıcının aradığı özelliğin var olduğunu söyler.
 */
export function buildDmMenuEntries(
  options: { readonly exportEnabled?: boolean } = {},
): readonly ConversationMoreMenuEntry[] {
  return collapseSeparators([
    { action: "viewProfile", kind: "row" },
    { action: "mute", kind: "row" },
    { action: "markUnread", kind: "row" },
    { action: "archive", kind: "row" },
    { kind: "separator" },
    ...(options.exportEnabled === true
      ? ([{ action: "export", kind: "row" }] as const)
      : ([] as const)),
    { kind: "separator" },
    { action: "block", kind: "row" },
    { action: "report", kind: "row" },
  ]);
}

/** Grup listesi — SPEC §17. Sayaçlar veriden gelir; yoksa satır sayaçsız çizilir. */
export function buildGroupMenuEntries(options: {
  readonly memberCount?: number | undefined;
  readonly pinnedCount?: number | undefined;
  readonly role: DMParticipantRole;
}): readonly ConversationMoreMenuEntry[] {
  const admin = canClearGroupHistory(options.role);

  return collapseSeparators([
    { action: "groupProfile", kind: "row" },
    {
      action: "viewMembers",
      kind: "row",
      ...(options.memberCount === undefined ? {} : { count: options.memberCount }),
    },
    { action: "addMembers", kind: "row" },
    {
      action: "pinnedMessages",
      kind: "row",
      ...(options.pinnedCount === undefined ? {} : { count: options.pinnedCount }),
    },
    { action: "sharedMedia", kind: "row" },
    { action: "mute", kind: "row" },
    { action: "notificationSettings", kind: "row" },
    ...(admin
      ? ([
          { kind: "section" },
          { action: "editGroup", kind: "row" },
          { action: "clearHistory", kind: "row" },
        ] as const)
      : ([] as const)),
    { kind: "separator" },
    { action: "leaveGroup", kind: "row" },
    ...(canDeleteGroup(options.role)
      ? ([{ action: "deleteGroup", kind: "row" }] as const)
      : ([] as const)),
  ]);
}

export type ConversationMoreMenuProps = {
  /** Grup karosunun swatch **adı** (ham renk değil). */
  readonly avatarColor?: string | null | undefined;
  readonly avatarUrl?: string | null | undefined;
  /** DM alt satırındaki `@kullanıcı`. */
  readonly handle?: string | null | undefined;
  readonly memberCount?: number | undefined;
  /** Yürürlükteki sessizlik süresi; alt menüde o satır seçili görünür. */
  readonly muteDuration?: ConversationMuteDuration | null | undefined;
  readonly muteSubmenuOpen?: boolean;
  readonly name: string;
  readonly onAddMembers?: (() => void) | undefined;
  readonly onArchive?: (() => void) | undefined;
  readonly onBlockUser?: (() => void) | undefined;
  readonly onClearHistory?: (() => void) | undefined;
  readonly onClose: () => void;
  readonly onDeleteGroup?: (() => void) | undefined;
  /** Yoksa satır `onOpenProfile("ayarlar")` çağırır — `dc.html` de oraya bağlıyor. */
  readonly onEditGroup?: (() => void) | undefined;
  /** Verilmezse `Sohbeti dışa aktar` satırı **çizilmez**. */
  readonly onExportConversation?: (() => void) | undefined;
  readonly onLeaveGroup?: (() => void) | undefined;
  readonly onMarkUnread?: (() => void) | undefined;
  readonly onOpenPins?: (() => void) | undefined;
  readonly onOpenProfile: (tab: ProfilePanelTab) => void;
  readonly onReportUser?: (() => void) | undefined;
  readonly onSelectMuteDuration: (duration: ConversationMuteDuration) => void;
  /** Alt menüyü açar/kapatır; reducer `openMuteSubmenu` action'ı. */
  readonly onToggleMuteSubmenu: () => void;
  readonly open: boolean;
  readonly pinnedCount?: number | undefined;
  readonly presence?: MessagesPresence | undefined;
  readonly role?: DMParticipantRole | undefined;
  readonly variant: "dm" | "group";
};

/** Yalnız `Sessize al` satırının taşıdığı ek nitelikler. */
type ContextMenuItemExtraProps = {
  readonly "aria-controls"?: string;
  readonly "aria-expanded"?: boolean;
  readonly "aria-haspopup"?: "menu";
  readonly id?: string;
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  readonly ref?: React.Ref<HTMLButtonElement>;
};

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);

  return (
    words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toLocaleUpperCase("tr") || "?"
  );
}

export function ConversationMoreMenu({
  avatarColor,
  avatarUrl,
  handle,
  memberCount,
  muteDuration = null,
  muteSubmenuOpen = false,
  name,
  onAddMembers,
  onArchive,
  onBlockUser,
  onClearHistory,
  onClose,
  onDeleteGroup,
  onEditGroup,
  onExportConversation,
  onLeaveGroup,
  onMarkUnread,
  onOpenPins,
  onOpenProfile,
  onReportUser,
  onSelectMuteDuration,
  onToggleMuteSubmenu,
  open,
  pinnedCount,
  presence = "offline",
  role = "MEMBER",
  variant,
}: ConversationMoreMenuProps) {
  const { t } = useI18n();
  const reactId = React.useId();
  const muteRowId = `${reactId}-mute`;
  const submenuId = `${reactId}-mute-list`;
  const muteRowRef = React.useRef<HTMLButtonElement | null>(null);
  const isGroup = variant === "group";

  /**
   * `Esc` **tek katman** kapatır: önce alt menü, sonra menü. Dinleyici yakalama
   * fazında ve `stopPropagation` ile: kabuk kendi `Esc`'ini `window` üzerinde
   * kabarma fazında dinliyor, arkadaki panel de öyle. Durdurulmasaydı bir tuş üç
   * yüzeyi birden kapatırdı ve kullanıcı geri dönemeyeceği bir yere düşerdi.
   */
  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (muteSubmenuOpen) {
        onToggleMuteSubmenu();
        muteRowRef.current?.focus();
        return;
      }

      onClose();
    };

    window.addEventListener("keydown", handleEscape, true);

    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [muteSubmenuOpen, onClose, onToggleMuteSubmenu, open]);

  const entries = isGroup
    ? buildGroupMenuEntries({
        ...(memberCount === undefined ? {} : { memberCount }),
        ...(pinnedCount === undefined ? {} : { pinnedCount }),
        role,
      })
    : buildDmMenuEntries({ exportEnabled: onExportConversation !== undefined });

  const runAndClose = (run: (() => void) | undefined) => () => {
    run?.();
    onClose();
  };

  const handlers: Readonly<Record<ConversationMoreMenuAction, () => void>> = {
    archive: runAndClose(onArchive),
    addMembers: runAndClose(onAddMembers),
    block: runAndClose(onBlockUser),
    clearHistory: runAndClose(onClearHistory),
    deleteGroup: runAndClose(onDeleteGroup),
    /**
     * `dc.html` bu satırı da `openSettings`e bağlıyor: grup adı ve rengi profil
     * panelinin Ayarlar sekmesinde düzenleniyor. Ayrı bir kanca verilirse o kazanır.
     */
    editGroup: runAndClose(onEditGroup ?? (() => onOpenProfile("ayarlar"))),
    export: runAndClose(onExportConversation),
    groupProfile: runAndClose(() => onOpenProfile("genel")),
    leaveGroup: runAndClose(onLeaveGroup),
    markUnread: runAndClose(onMarkUnread),
    // Tek istisna: alt menüyü açan satır menüyü **kapatmaz**.
    mute: onToggleMuteSubmenu,
    notificationSettings: runAndClose(() => onOpenProfile("ayarlar")),
    pinnedMessages: runAndClose(onOpenPins),
    report: runAndClose(onReportUser),
    sharedMedia: runAndClose(() => onOpenProfile("medya")),
    viewMembers: runAndClose(() => onOpenProfile("uyeler")),
    viewProfile: runAndClose(() => onOpenProfile("genel")),
  };

  const subtitle = isGroup
    ? t("messages.more.subtitle.group", {
        count: memberCount ?? 0,
        role: t(
          isProfileAdminRole(role) ? "messages.profile.role.admin" : "messages.profile.role.member",
        ),
      })
    : handle
      ? t("messages.more.subtitle.dm", { handle, status: t(PRESENCE_LABEL_KEYS[presence]) })
      : t(PRESENCE_LABEL_KEYS[presence]);

  return (
    <ContextMenu
      className="text-left"
      label={t("messages.conversation.action.more")}
      onClose={onClose}
      open={open}
      placement="anchor"
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(moreMenu.radius),
        boxShadow: `0 ${pxToRem(MESSAGES_METRICS.shadow.headerMenu.offsetY)} ${pxToRem(MESSAGES_METRICS.shadow.headerMenu.blur)} ${pxToRem(MESSAGES_METRICS.shadow.headerMenu.spread)} hsl(var(--shadow-color)/${MESSAGES_METRICS.shadow.headerMenu.alpha})`,
        padding: pxToRem(moreMenu.padding),
        right: 0,
        top: pxToRem(moreMenu.top),
        width: pxToRem(isGroup ? moreMenu.groupWidth : moreMenu.dmWidth),
        zIndex: 40,
      }}
      testId="conversation-more-menu"
    >
      {/*
       * WAI-ARIA'da `role="menu"` yalnız menü öğesi, grup ve ayırıcı taşıyabilir; avatarın `img`
       * rolü axe'te `aria-required-children` ihlaliydi. Başlık görsel bir özet: ad ve durum
       * sayfa başlığında zaten okunuyor, menünün kendi erişilebilir adı `label`'dan geliyor.
       */}
      <div
        aria-hidden="true"
        className="flex items-center"
        data-testid="conversation-more-menu-header"
        style={{
          gap: pxToRem(moreMenu.headerGap),
          padding: `${pxToRem(moreMenu.headerPaddingTop)} ${pxToRem(moreMenu.headerPaddingX)} ${pxToRem(moreMenu.headerPaddingBottom)}`,
        }}
      >
        {isGroup ? (
          <span
            aria-hidden="true"
            className={cn("grid shrink-0 place-items-center text-white", DISPLAY_FONT)}
            style={{
              background: getGroupSwatchBackground(avatarColor),
              ...(getGroupSwatchInk(avatarColor) ? { color: getGroupSwatchInk(avatarColor) } : {}),
              borderRadius: pxToRem(moreMenu.headerTileRadius),
              fontSize: pxToRem(moreMenu.headerTileFontSize),
              fontWeight: 600,
              height: pxToRem(moreMenu.headerTileSize),
              width: pxToRem(moreMenu.headerTileSize),
            }}
          >
            {initialsOf(name)}
          </span>
        ) : (
          <Avatar
            alt={name}
            className="shrink-0 rounded-full"
            fallback={name}
            src={avatarUrl ?? null}
            style={{
              fontSize: pxToRem(moreMenu.headerTileFontSize),
              height: pxToRem(moreMenu.headerTileSize),
              width: pxToRem(moreMenu.headerTileSize),
            }}
          />
        )}

        <div className="min-w-0">
          <div
            className="truncate text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(moreMenu.headerNameFontSize),
              fontWeight: 600,
              lineHeight: moreMenu.headerNameLineHeight,
            }}
          >
            {name}
          </div>
          <div
            className="truncate text-[hsl(var(--text-muted))]"
            data-testid="conversation-more-menu-subtitle"
            style={{
              fontSize: pxToRem(moreMenu.headerSubFontSize),
              fontWeight: 500,
              lineHeight: 1,
              marginTop: pxToRem(moreMenu.headerSubMarginTop),
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="bg-[hsl(var(--border)/0.6)]"
        style={{
          height: hairline(),
          margin: `${pxToRem(moreMenu.headerSeparatorMarginTop)} ${pxToRem(moreMenu.headerSeparatorMarginX)} ${pxToRem(moreMenu.headerSeparatorMarginBottom)}`,
        }}
      />

      {entries.map((entry, index) => {
        if (entry.kind === "separator") {
          return (
            <ContextMenuSeparator
              // Ayırıcının kimliği yok; listedeki yeri onun kimliğidir.
              key={`separator-${index}`}
              style={{
                background: "hsl(var(--border)/0.6)",
                height: hairline(),
                margin: `${pxToRem(moreMenu.dividerMarginY)} ${pxToRem(moreMenu.dividerMarginX)}`,
                width: "auto",
              }}
            />
          );
        }

        if (entry.kind === "section") {
          return (
            <div
              className="flex items-center"
              data-testid="conversation-more-menu-section"
              key="section"
              style={{
                gap: pxToRem(moreMenu.sectionGap),
                padding: `${pxToRem(moreMenu.sectionPaddingTop)} ${pxToRem(moreMenu.sectionPaddingX)} ${pxToRem(moreMenu.sectionPaddingBottom)}`,
              }}
            >
              <span
                className={cn("uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
                style={{
                  fontSize: pxToRem(moreMenu.sectionLabelFontSize),
                  fontWeight: 600,
                  letterSpacing: moreMenu.sectionLabelTracking,
                  lineHeight: 1,
                }}
              >
                {t("messages.more.group.adminSection")}
              </span>
              <span
                aria-hidden="true"
                className="flex-1 bg-[hsl(var(--border)/0.6)]"
                style={{ height: hairline() }}
              />
            </div>
          );
        }

        const Icon = ROW_ICONS[entry.action];
        const danger = DANGER_ACTIONS.has(entry.action);
        const isMuteRow = entry.action === "mute";
        const muteRowProps: ContextMenuItemExtraProps = isMuteRow
          ? {
              "aria-controls": submenuId,
              "aria-expanded": muteSubmenuOpen,
              "aria-haspopup": "menu",
              id: muteRowId,
              onKeyDown: (event) => {
                if (muteRowKeyAction(event.key) === null) {
                  return;
                }

                // `Enter` hem `keydown` hem `click` üretir; durdurulmasaydı alt menü
                // aynı tuşta bir açılıp bir kapanırdı.
                event.preventDefault();
                event.stopPropagation();

                if (muteSubmenuOpen) {
                  document
                    .getElementById(submenuId)
                    ?.querySelector<HTMLElement>('[role="menuitemradio"]')
                    ?.focus();
                  return;
                }

                onToggleMuteSubmenu();
              },
              ref: muteRowRef,
            }
          : {};

        return (
          <React.Fragment key={entry.action}>
            <ContextMenuItem
              className={cn(
                "min-h-0 w-full",
                danger
                  ? "text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.13)]"
                  : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
              )}
              data-testid={`conversation-more-menu-${entry.action}`}
              destructive={danger}
              onClick={handlers[entry.action]}
              style={{
                borderRadius: pxToRem(moreMenu.rowRadius),
                fontSize: pxToRem(moreMenu.rowFontSize),
                fontWeight: 500,
                gap: pxToRem(moreMenu.rowGap),
                lineHeight: 1,
                padding: `${pxToRem(moreMenu.rowPaddingY)} ${pxToRem(moreMenu.rowPaddingX)}`,
              }}
              {...muteRowProps}
            >
              <Icon
                aria-hidden="true"
                style={{
                  height: pxToRem(moreMenu.rowIconSize),
                  width: pxToRem(moreMenu.rowIconSize),
                }}
              />
              {t(ROW_LABEL_KEYS[entry.action])}
              {entry.count === undefined ? null : (
                <span
                  className={cn("ml-auto text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
                  data-testid={`conversation-more-menu-${entry.action}-count`}
                  style={{
                    fontSize: pxToRem(moreMenu.counterFontSize),
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {entry.count}
                </span>
              )}
              {isMuteRow ? (
                <ChevronRight
                  aria-hidden="true"
                  className="ml-auto"
                  data-testid="conversation-more-menu-mute-chevron"
                  style={{
                    height: pxToEm(moreMenu.rowIconSize, moreMenu.rowFontSize),
                    transform: muteSubmenuOpen
                      ? `rotate(${moreMenu.submenuChevronRotation}deg)`
                      : "rotate(0deg)",
                    transition: `transform ${MESSAGES_METRICS.transition.base}s`,
                    width: pxToEm(moreMenu.rowIconSize, moreMenu.rowFontSize),
                  }}
                />
              ) : null}
            </ContextMenuItem>

            {isMuteRow ? (
              <MuteSubmenu
                id={submenuId}
                labelledById={muteRowId}
                onClose={() => {
                  onToggleMuteSubmenu();
                  muteRowRef.current?.focus();
                }}
                onSelect={onSelectMuteDuration}
                open={muteSubmenuOpen}
                value={muteDuration}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </ContextMenu>
  );
}
