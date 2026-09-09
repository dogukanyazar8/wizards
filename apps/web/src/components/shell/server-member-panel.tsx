"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Check, Link2, MicOff, MonitorUp, Search } from "lucide-react";
import type { WorkspaceChannel, WorkspaceServerDetail } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { ChannelSearchPanel } from "@/components/chat/message-search-panel";
import { useRightPanelVisibility } from "@/hooks/use-right-panel-visibility";
import { useToast } from "@/hooks/use-toast";
import { useVoiceStates } from "@/hooks/use-voice-states";
import { getSocket } from "@/lib/socket/client";
import { jumpToMessageInDocument } from "@/lib/messages/jump-to-message";
import {
  buildPresenceGroups,
  buildVoiceGroups,
  buildVoicePresenceIndex,
  canInviteToVoice,
  getPresenceColor,
  getRoleBadgeColors,
  getVoiceInviteState,
  markVoiceInviteSent,
  type MemberPanelGroup,
  type MemberPanelGroupKey,
  type MemberPanelRow,
} from "@/lib/servers/member-panel-model";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  setServerRightPanelContent,
  useServerRightPanelContent,
} from "@/lib/servers/right-panel-store";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Sağ panel (326) — SPEC-SUNUCU §4.
 *
 * Panel üç içerikten **birini** gösterir ve üçü de aynı kabuğu paylaşır: aynı başlık, aynı
 * kapatma düğmesi, aynı kolon genişliği. Kabuk tek yerde durduğu için "arama paneli üye
 * panelinden 2px dar" gibi bir sapma doğamaz.
 *
 * | İçerik | Ne zaman | Kaynak |
 * | --- | --- | --- |
 * | `members` | yazı kanalı | SPEC §4.1 — `ÇEVRİMİÇİ` / `ÇEVRİMDIŞI` |
 * | `voice` | ses kanalı | SPEC §4.2 — `BU KANALDA` / `KANALDA DEĞİL` |
 * | `search` | başlıktaki `ara` düğmesi | SPEC §4.3 |
 *
 * `voice` bir **seçim değil**, kanal türünden türetilir (`right-panel-store.ts`'in gerekçesi).
 *
 * **Kaldırılanlar.** Bugünkü `ServerInfoCard`, `ActiveVoiceCard`, `QuickAccessCard` ve
 * `DesktopDownloadCard` SPEC §4'te yok ve panelden çıktı. Kaybolan yetenek yok:
 * sunucu adı/açıklaması kanal kenar çubuğunun başlığında ve sunucu ayarlarının Genel
 * bölümünde, aktif ses kanalları kenar çubuğunun kanal satırlarında ve bağlı ses şeridinde,
 * hızlı eylemler (`Sunucu ayarları` · `Kanal oluştur` · `Davet bağlantısı`) sunucu menüsünde,
 * masaüstü indirme bağlantısı ise Ayarlar › Hakkında'da yaşıyor.
 *
 * Rol bazlı beş gruplama da SPEC'in iki grubuna indi; rol bilgisi satırın içindeki rozete
 * taşındı (`member-panel-model.ts`).
 */

type ServerMemberPanelProps = {
  detail: WorkspaceServerDetail;
  onClose?: () => void;
  variant?: "sidebar" | "drawer";
};

export type ServerMemberPanelContent = "members" | "search" | "voice";

const GROUP_LABEL_KEYS: Record<MemberPanelGroupKey, string> = {
  inChannel: "server.panel.group.inChannel",
  notInChannel: "server.panel.group.notInChannel",
  offline: "server.panel.group.offline",
  online: "server.panel.group.online",
};

function getServerChannels(detail: WorkspaceServerDetail): WorkspaceChannel[] {
  return [
    ...detail.ungroupedChannels,
    ...detail.categories.flatMap((category) => category.channels),
  ];
}

/* ------------------------------------------------------------------------------------------ */
/* Sunum katmanı — kancasız, sağlayıcısız test edilebilir                                       */
/* ------------------------------------------------------------------------------------------ */

function GroupHeader({ group }: { group: MemberPanelGroup }) {
  const { t } = useI18n();
  const { rightPanel } = SERVER_METRICS;
  const dotColor = group.key === "online" || group.key === "inChannel" ? "success" : "text-muted";

  return (
    <div
      className="flex items-center"
      style={{
        gap: pxToRem(rightPanel.groupHeaderGap),
        padding: `0 ${pxToRem(rightPanel.groupHeaderPaddingX)} ${pxToRem(
          rightPanel.groupHeaderPaddingBottom,
        )}`,
      }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full"
        style={{
          background: `hsl(var(--${dotColor}))`,
          height: pxToRem(rightPanel.groupDotSize),
          width: pxToRem(rightPanel.groupDotSize),
        }}
      />
      <span
        style={{
          color: "hsl(var(--text-muted))",
          font: `600 ${pxToRem(rightPanel.groupLabelFontSize)}/1 ${DISPLAY_FONT}`,
          letterSpacing: `${rightPanel.groupLabelLetterSpacing}em`,
          textTransform: "uppercase",
        }}
      >
        {t(GROUP_LABEL_KEYS[group.key])}
      </span>
      <span
        className="ml-auto shrink-0"
        style={{
          color: "hsl(var(--text-muted))",
          font: `600 ${pxToRem(rightPanel.groupCountFontSize)}/1 ${DISPLAY_FONT}`,
        }}
      >
        {group.rows.length}
      </span>
    </div>
  );
}

function StatusIcons({ row }: { row: MemberPanelRow }) {
  const { t } = useI18n();
  const { rightPanel } = SERVER_METRICS;

  if (!row.screenSharing && !row.deafened) {
    return null;
  }

  const size = pxToEm(rightPanel.statusIconSize, rightPanel.nameFontSize);

  return (
    <span
      className="flex shrink-0 items-center"
      style={{ gap: pxToRem(rightPanel.statusIconsGap) }}
    >
      {row.screenSharing ? (
        <MonitorUp
          aria-label={t("server.panel.status.screenSharing")}
          role="img"
          style={{ color: "hsl(var(--primary))", height: size, width: size }}
        />
      ) : null}
      {row.deafened ? (
        <MicOff
          aria-label={t("server.panel.status.deafened")}
          role="img"
          style={{ color: "hsl(var(--danger))", height: size, width: size }}
        />
      ) : null}
    </span>
  );
}

function VoiceInviteButton({
  onInvite,
  row,
  sent,
}: {
  onInvite: (row: MemberPanelRow) => void;
  row: MemberPanelRow;
  sent: boolean;
}) {
  const { t } = useI18n();
  const { rightPanel } = SERVER_METRICS;
  const iconSize = pxToEm(rightPanel.statusIconSize, rightPanel.inviteButtonFontSize);

  return (
    <button
      aria-disabled={sent || undefined}
      className={cn(
        "flex shrink-0 items-center whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        sent ? "cursor-default" : "cursor-pointer",
      )}
      data-invite-state={sent ? "sent" : "idle"}
      data-testid={`server-voice-invite-${row.username}`}
      onClick={() => {
        if (!sent) {
          onInvite(row);
        }
      }}
      style={{
        background: sent ? "hsl(var(--success)/0.14)" : "hsl(var(--surface-card))",
        border: `${hairline()} solid ${sent ? "hsl(var(--success)/0.45)" : "hsl(var(--border))"}`,
        borderRadius: pxToRem(rightPanel.inviteButtonRadius),
        color: sent ? "hsl(var(--success))" : "hsl(var(--primary))",
        font: `600 ${pxToRem(rightPanel.inviteButtonFontSize)}/1 var(--font-sans), sans-serif`,
        gap: pxToRem(rightPanel.inviteButtonGap),
        height: pxToRem(rightPanel.inviteButtonHeight),
        padding: `0 ${pxToRem(rightPanel.inviteButtonPaddingX)}`,
      }}
      type="button"
    >
      {sent ? <Check aria-hidden="true" style={{ height: iconSize, width: iconSize }} /> : null}
      <span>{sent ? t("server.panel.voice.invited") : t("server.panel.voice.invite")}</span>
    </button>
  );
}

function MemberRow({
  invitable,
  onInvite,
  row,
  sent,
}: {
  invitable: boolean;
  onInvite: (row: MemberPanelRow) => void;
  row: MemberPanelRow;
  sent: boolean;
}) {
  const { rightPanel } = SERVER_METRICS;
  const offline = row.presence === "OFFLINE";
  const badgeColors = row.roleBadge ? getRoleBadgeColors(row.roleBadge) : null;

  return (
    <li
      className="flex items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)]"
      data-testid={`server-member-${row.username}`}
      style={{
        borderRadius: pxToRem(rightPanel.memberRowRadius),
        gap: pxToRem(rightPanel.memberRowGap),
        opacity: offline ? rightPanel.memberOfflineOpacity : 1,
        padding: `${pxToRem(rightPanel.memberRowPaddingY)} ${pxToRem(
          rightPanel.memberRowPaddingX,
        )}`,
      }}
    >
      <div className="relative shrink-0">
        <Avatar
          alt={row.displayName}
          fallback={row.displayName}
          src={row.avatarUrl}
          style={{
            fontSize: pxToRem(rightPanel.avatarFontSize),
            height: pxToRem(rightPanel.avatarSize),
            width: pxToRem(rightPanel.avatarSize),
          }}
        />
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            background: getPresenceColor(row.presence),
            border: `${pxToRem(rightPanel.presenceDotBorderWidth)} solid hsl(var(--surface-panel))`,
            bottom: pxToRem(rightPanel.presenceDotOffset),
            height: pxToRem(rightPanel.presenceDotSize),
            right: pxToRem(rightPanel.presenceDotOffset),
            width: pxToRem(rightPanel.presenceDotSize),
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center" style={{ gap: pxToRem(rightPanel.nameGap) }}>
          <span
            className="min-w-0 truncate"
            style={{
              color: offline ? "hsl(var(--text-secondary))" : "hsl(var(--foreground))",
              font: `600 ${pxToRem(rightPanel.nameFontSize)}/${
                rightPanel.nameLineHeight
              } var(--font-sans), sans-serif`,
            }}
          >
            {row.displayName}
          </span>
          {row.roleBadge && badgeColors ? (
            <span
              className="shrink-0"
              data-testid={`server-member-role-${row.username}`}
              style={{
                background: badgeColors.background,
                borderRadius: pxToRem(rightPanel.roleChipRadius),
                color: badgeColors.foreground,
                font: `600 ${pxToRem(rightPanel.roleChipFontSize)}/1 ${DISPLAY_FONT}`,
                padding: `${pxToRem(rightPanel.roleChipPaddingY)} ${pxToRem(
                  rightPanel.roleChipPaddingX,
                )}`,
              }}
            >
              {row.roleBadge.label}
            </span>
          ) : null}
        </div>
        <div
          className="truncate"
          style={{
            color: "hsl(var(--text-muted))",
            font: `500 ${pxToRem(rightPanel.subtitleFontSize)}/${
              rightPanel.subtitleLineHeight
            } var(--font-sans), sans-serif`,
            marginTop: pxToRem(rightPanel.subtitleMarginTop),
          }}
        >
          {row.subtitle}
        </div>
      </div>

      {invitable ? <VoiceInviteButton onInvite={onInvite} row={row} sent={sent} /> : null}
      <StatusIcons row={row} />
    </li>
  );
}

export type ServerMemberPanelViewProps = {
  /**
   * `Davet bağlantısı kopyala` düğmesinin kapısı. `false` ise düğme **hiç çizilmez**
   * (00 §5): sunucu `Üyeler davet edebilir` kapalıyken davet yalnız yöneticinin işidir ve
   * pasif bir düğme, kullanıcıya olmayan bir yetkiyi vaat ederdi.
   */
  readonly canCopyInviteLink: boolean;
  readonly content: ServerMemberPanelContent;
  readonly groups: readonly MemberPanelGroup[];
  readonly invitedUserIds: ReadonlySet<string>;
  readonly memberCount: number;
  readonly onClose: () => void;
  readonly onCopyInviteLink: () => void;
  readonly onInviteToVoice: (row: MemberPanelRow) => void;
  readonly onQueryChange: (query: string) => void;
  readonly query: string;
  /** SPEC §4.3'ün içeriği; kabuk onu yalnız yerleştirir. */
  readonly searchSlot?: React.ReactNode;
  /**
   * SPEC §11: `<1400px`'te panel akıştan çıkar ve içeriğin üstüne biner. Eşiğin **hangi
   * tarafında** olunduğunu kanca ölçer; görünüm yalnız sonucu uygular, böylece bu davranış
   * `viewportWidth` taklidi olmadan test edilebilir.
   */
  readonly overlay: boolean;
  readonly variant: "drawer" | "sidebar";
  readonly voiceParticipantCount: number;
};

export function ServerMemberPanelView({
  canCopyInviteLink,
  content,
  groups,
  invitedUserIds,
  memberCount,
  onClose,
  onCopyInviteLink,
  onInviteToVoice,
  onQueryChange,
  overlay,
  query,
  searchSlot,
  variant,
  voiceParticipantCount,
}: ServerMemberPanelViewProps) {
  const { t } = useI18n();
  const { layout, rightPanel, textHeader } = SERVER_METRICS;
  const isDrawer = variant === "drawer";
  const isOverlay = overlay && !isDrawer;
  const isVoice = content === "voice";
  const isSearch = content === "search";
  const title = isSearch
    ? t("server.panel.search.title")
    : isVoice
      ? t("server.panel.voice.title")
      : t("server.panel.members.title", { count: memberCount });

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col",
        !isOverlay && "h-full",
        isDrawer ? "w-full" : "shrink-0",
        isOverlay && "absolute right-0 bottom-0",
      )}
      data-shortcut-region="support"
      data-panel-content={content}
      data-panel-overlay={isOverlay ? "true" : undefined}
      data-testid={isDrawer ? "server-member-panel-drawer" : "server-member-panel"}
      tabIndex={-1}
      style={{
        background: "hsl(var(--surface-panel))",
        borderLeft: isDrawer
          ? undefined
          : `${hairline(layout.columnBorderWidth)} solid hsl(var(--border)/${layout.rightPanelBorderAlpha})`,
        boxShadow: isOverlay
          ? `0 ${pxToRem(24)} ${pxToRem(60)} ${pxToRem(-30)} hsl(var(--shadow-color))`
          : undefined,
        top: isOverlay
          ? pxToRem(
              textHeader.paddingY * 2 +
                textHeader.nameFontSize * textHeader.nameLineHeight +
                textHeader.subtitleMarginTop +
                textHeader.subtitleFontSize * textHeader.subtitleLineHeight,
            )
          : undefined,
        width: isDrawer ? undefined : pxToRem(layout.rightPanelWidth),
        zIndex: isOverlay ? layout.rightPanelOverlayZIndex : undefined,
      }}
      suppressHydrationWarning
    >
      <div
        className="flex items-center"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/${rightPanel.headerBorderBottomAlpha})`,
          gap: pxToRem(rightPanel.headerGap),
          padding: `${pxToRem(rightPanel.headerPaddingTop)} ${pxToRem(
            rightPanel.headerPaddingX,
          )} ${pxToRem(rightPanel.headerPaddingBottom)}`,
        }}
      >
        {isSearch ? (
          <Search
            aria-hidden="true"
            className="shrink-0"
            style={{
              color: "hsl(var(--primary))",
              height: pxToEm(rightPanel.titleIconSize, rightPanel.titleFontSize),
              width: pxToEm(rightPanel.titleIconSize, rightPanel.titleFontSize),
            }}
          />
        ) : null}
        <h2
          className="min-w-0 flex-1 truncate"
          style={{
            color: "hsl(var(--foreground))",
            font: `600 ${pxToRem(rightPanel.titleFontSize)}/${
              rightPanel.titleLineHeight
            } ${DISPLAY_FONT}`,
            letterSpacing: DISPLAY_TRACKING,
          }}
        >
          {title}
        </h2>
        {isVoice ? (
          <span
            className="shrink-0"
            data-testid="server-panel-joined-chip"
            style={{
              background: "hsl(var(--success)/0.16)",
              borderRadius: pxToRem(rightPanel.joinedChipRadius),
              color: "hsl(var(--success))",
              font: `600 ${pxToRem(rightPanel.joinedChipFontSize)}/1 ${DISPLAY_FONT}`,
              padding: `${pxToRem(rightPanel.joinedChipPaddingY)} ${pxToRem(
                rightPanel.joinedChipPaddingX,
              )}`,
              textTransform: "uppercase",
            }}
          >
            {t("server.panel.voice.joined", { count: voiceParticipantCount })}
          </span>
        ) : null}
        <WindowCloseButton
          aria-label={t("server.panel.close")}
          onClick={onClose}
          testId="server-panel-close"
        />
      </div>

      {isSearch ? (
        searchSlot
      ) : (
        <>
          {!isVoice ? (
            <div
              style={{
                padding: `${pxToRem(rightPanel.searchWrapperPaddingTop)} ${pxToRem(
                  rightPanel.searchWrapperPaddingX,
                )} 0`,
              }}
            >
              <label
                className="flex items-center"
                style={{
                  background: "hsl(var(--surface-card))",
                  border: `${hairline()} solid hsl(var(--border)/${rightPanel.searchBorderAlpha})`,
                  borderRadius: pxToRem(rightPanel.searchRadius),
                  gap: pxToRem(rightPanel.searchGap),
                  padding: `${pxToRem(rightPanel.searchPaddingY)} ${pxToRem(
                    rightPanel.searchPaddingX,
                  )}`,
                }}
              >
                <Search
                  aria-hidden="true"
                  className="shrink-0 text-app-muted"
                  style={{
                    height: pxToEm(rightPanel.searchIconSize, rightPanel.searchFontSize),
                    width: pxToEm(rightPanel.searchIconSize, rightPanel.searchFontSize),
                  }}
                />
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent text-app-foreground outline-hidden placeholder:text-app-muted"
                  data-testid="server-member-search"
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder={t("server.panel.members.searchPlaceholder")}
                  style={{ fontSize: pxToRem(rightPanel.searchFontSize) }}
                  value={query}
                />
              </label>
            </div>
          ) : null}

          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{
              padding: `${pxToRem(rightPanel.listPaddingTop)} ${pxToRem(
                rightPanel.listPaddingX,
              )} ${pxToRem(rightPanel.listPaddingBottom)}`,
            }}
          >
            {groups.map((group) => (
              <section
                key={group.key}
                style={{ marginBottom: pxToRem(rightPanel.groupMarginBottom) }}
              >
                <GroupHeader group={group} />
                <ul>
                  {group.rows.map((row) => (
                    <MemberRow
                      invitable={group.key === "notInChannel" && canInviteToVoice(row)}
                      key={row.userId}
                      onInvite={onInviteToVoice}
                      row={row}
                      sent={getVoiceInviteState(invitedUserIds, row.userId) === "sent"}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {isVoice && canCopyInviteLink ? (
            <div
              style={{
                borderTop: `${hairline()} solid hsl(var(--border)/${rightPanel.footerBorderTopAlpha})`,
                padding: `${pxToRem(rightPanel.footerPaddingY)} ${pxToRem(
                  rightPanel.footerPaddingX,
                )} ${pxToRem(rightPanel.footerPaddingBottom)}`,
              }}
            >
              <button
                className="flex w-full cursor-pointer items-center justify-center transition-colors hover:bg-[hsl(var(--primary)/0.24)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid="server-panel-copy-invite"
                onClick={onCopyInviteLink}
                style={{
                  background: `hsl(var(--primary)/${rightPanel.copyLinkBackgroundAlpha})`,
                  border: `${hairline()} solid hsl(var(--primary)/${rightPanel.copyLinkBorderAlpha})`,
                  borderRadius: pxToRem(rightPanel.copyLinkRadius),
                  color: "hsl(var(--primary))",
                  font: `600 ${pxToRem(rightPanel.copyLinkFontSize)}/1 var(--font-sans), sans-serif`,
                  gap: pxToRem(rightPanel.copyLinkGap),
                  height: pxToRem(rightPanel.copyLinkHeight),
                }}
                type="button"
              >
                <Link2
                  aria-hidden="true"
                  style={{
                    height: pxToEm(rightPanel.copyLinkIconSize, rightPanel.copyLinkFontSize),
                    width: pxToEm(rightPanel.copyLinkIconSize, rightPanel.copyLinkFontSize),
                  }}
                />
                {t("server.panel.voice.copyInvite")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Kancalar                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export function ServerMemberPanel({
  detail,
  onClose,
  variant = "sidebar",
}: ServerMemberPanelProps) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const activeChannelId = useAppStore((state) => state.activeChannelId);
  const rightPanel = useRightPanelVisibility();
  const panelContent = useServerRightPanelContent();
  const voiceStatesQuery = useVoiceStates(detail.server.id);
  const [query, setQuery] = useState("");
  const [invitedUserIds, setInvitedUserIds] = useState<ReadonlySet<string>>(() => new Set());
  const [searchChannelId, setSearchChannelId] = useState<string | null>(null);

  const channels = useMemo(() => getServerChannels(detail), [detail]);
  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels],
  );
  const isVoiceChannel = activeChannel?.type === "VOICE";
  const content: ServerMemberPanelContent = isVoiceChannel
    ? "voice"
    : panelContent === "search"
      ? "search"
      : "members";

  const channelNameById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel.name])),
    [channels],
  );
  // `?? []` her render'da yeni bir dizi üretir; aşağıdaki iki `useMemo` ona bağlı olduğu için
  // referans sabitlenmezse ikisi de her karede yeniden koşardı.
  const voiceStates = useMemo(() => voiceStatesQuery.data ?? [], [voiceStatesQuery.data]);
  const voiceIndex = useMemo(
    () => buildVoicePresenceIndex(voiceStates, channelNameById),
    [channelNameById, voiceStates],
  );
  const labels = useMemo(
    () => ({
      admin: t("server.panel.role.admin"),
      deafened: t("server.panel.status.deafened"),
      owner: t("server.panel.role.owner"),
      screenSharing: t("server.panel.status.screenSharing"),
      separator: t("server.panel.subtitleSeparator"),
    }),
    [t],
  );
  const participantIds = useMemo(
    () =>
      new Set(
        (activeChannel
          ? (voiceStates.find((state) => state.channelId === activeChannel.id)?.participants ?? [])
          : []
        ).map((participant) => participant.userId),
      ),
    [activeChannel, voiceStates],
  );

  const groups = useMemo(() => {
    const input = {
      labels,
      locale,
      members: detail.members,
      query,
      roles: detail.roles,
      voiceIndex,
    };

    return isVoiceChannel
      ? buildVoiceGroups({ ...input, participantIds })
      : buildPresenceGroups(input);
  }, [
    detail.members,
    detail.roles,
    isVoiceChannel,
    labels,
    locale,
    participantIds,
    query,
    voiceIndex,
  ]);

  const textChannels = useMemo(
    () =>
      channels
        .filter((channel) => channel.type === "TEXT")
        .map((channel) => ({ id: channel.id, name: channel.name })),
    [channels],
  );
  const memberOptions = useMemo(
    () =>
      detail.members.map((member) => ({
        // Uç `author`ı `username`/`displayName` üstünde eşleştiriyor; değer olarak `username`
        // gider çünkü görünen ad iki üyede aynı olabilir.
        id: member.username,
        name: member.displayName,
      })),
    [detail.members],
  );

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }

    setServerRightPanelContent("members");
    rightPanel.setOpen(false);
  }, [onClose, rightPanel]);

  const handleInviteToVoice = useCallback(
    (row: MemberPanelRow) => {
      if (!activeChannel) {
        return;
      }

      // SPEC §4.2: geçiş tek yönlü. İyimser yazım kasıtlı — soket `ack` döndürmüyor ve
      // düğmenin `Davet et`e geri dönmesi kullanıcıya daveti iki kez göndertirdi.
      setInvitedUserIds((current) => markVoiceInviteSent(current, row.userId));
      getSocket().emit("voice:invite:send", {
        channelId: activeChannel.id,
        serverId: detail.server.id,
        targetUserId: row.userId,
      });
    },
    [activeChannel, detail.server.id],
  );

  const handleCopyInviteLink = useCallback(() => {
    const code = detail.server.inviteCode;
    if (!code || typeof window === "undefined" || !navigator.clipboard) {
      toast.show({ message: t("server.panel.voice.copyInviteError"), tone: "danger" });
      return;
    }

    void navigator.clipboard
      .writeText(new URL(`/invite/${code}`, window.location.origin).toString())
      .then(() => {
        toast.show({ message: t("server.panel.voice.copyInviteDone") });
      })
      .catch(() => {
        toast.show({ message: t("server.panel.voice.copyInviteError"), tone: "danger" });
      });
  }, [detail.server.inviteCode, t, toast]);

  const isDrawer = variant === "drawer";
  if (!isDrawer && !rightPanel.isOpen) {
    return null;
  }

  const searchChannel = searchChannelId ?? activeChannel?.id ?? textChannels[0]?.id ?? null;

  return (
    <ServerMemberPanelView
      canCopyInviteLink={detail.server.isAdmin || detail.server.allowMemberAdds}
      content={content}
      groups={groups}
      invitedUserIds={invitedUserIds}
      memberCount={detail.server.memberCount}
      onClose={handleClose}
      onCopyInviteLink={handleCopyInviteLink}
      onInviteToVoice={handleInviteToVoice}
      onQueryChange={setQuery}
      overlay={rightPanel.isOverlay}
      query={query}
      searchSlot={
        content === "search" && searchChannel ? (
          <ChannelSearchPanel
            channelId={searchChannel}
            channelOptions={textChannels}
            memberOptions={memberOptions}
            onChannelChange={setSearchChannelId}
            onJumpToMessage={jumpToMessageInDocument}
          />
        ) : null
      }
      variant={variant}
      voiceParticipantCount={participantIds.size}
    />
  );
}
