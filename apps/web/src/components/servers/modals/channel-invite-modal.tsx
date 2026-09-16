"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import type { WorkspaceServerDetail } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { OptionChipGroup } from "@/components/servers/shared/option-chip-group";
import {
  ServerModalShell,
  serverModalPlainFooterStyle,
  serverModalSecondaryButtonStyle,
} from "@/components/servers/modals/server-modal-shell";
import { fetchFriends, friendsQueryKeys } from "@/lib/friends/client";
import { renderInviteQr } from "@/lib/invites/qr";
import {
  SERVER_INVITE_DURATIONS,
  SERVER_INVITE_INITIAL_STATE,
  SERVER_INVITE_USE_LIMITS,
  buildServerInvitePayload,
  buildServerInviteUrl,
  filterInviteFriends,
  selectInviteNoticeKey,
  toServerInviteDisplayUrl,
  type InviteFriendCandidate,
  type ServerInviteDurationId,
  type ServerInviteFormState,
  type ServerInviteUseLimitId,
} from "@/lib/servers/invite-form";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { createServerInvite, workspaceQueryKeys } from "@/lib/workspace/client";

/**
 * SPEC-SUNUCU §6.3 — davet bağlantısı penceresi (480).
 *
 * **ROL alanı yoktur** — SPEC tasarımdan kaldırdı ve bu dosyada rol taşıyan tek bir alan
 * bulunmaz. Pencerenin tamamı iki karardan ibaret: `SÜRE` ve `KULLANIM`.
 *
 * K3 gereği iki yetenek daha burada: **QR** (`lib/invites/qr.ts`, istemcide çizilir, renkler
 * token'dan) ve **arkadaş seçerek davet** (`targetUserId`). İkisi de kesikli "yakında" çipi
 * değil, çalışan yollar; tablo, kolon, servis ve uç Ş3'te bağlanmıştı.
 *
 * Bağlantı tembel üretilmez: pencere açılır açılmaz bir davet oluşturulur, çünkü SPEC'in ilk
 * durumu **kopyalanabilir bir bağlantı** gösteriyor. Süre ya da kullanım değişirse bağlantı
 * yeniden üretilir — eski kod artık seçili çipleri anlatmıyor olurdu.
 */

const { inviteModal, modal } = SERVER_METRICS;

/**
 * Tasarımda QR kutusunun ölçüsü yok (Ş3 `qr.ts` başlığı); 480'lik pencerenin gövdesine oturan
 * tek ölçü. Ş13 aynı kutuyu §8.7'nin davet satırında da çizmek zorunda kaldığı için sayı
 * sözlüğe alındı; burada yalnız okunur.
 */
const QR_BOX_SIZE = inviteModal.qrBoxSize;

export type ChannelInviteModalCopy = {
  readonly channelName: string | null;
  readonly serverName: string;
};

export type ChannelInviteTab = "link" | "friends";

export type ChannelInviteModalViewProps = {
  readonly activeTab: ChannelInviteTab;
  readonly copied: boolean;
  readonly friendQuery: string;
  readonly friends: readonly InviteFriendCandidate[];
  readonly inviteCode: string | null;
  readonly inviteUrl: string | null;
  readonly invitedFriendIds: ReadonlySet<string>;
  readonly onChangeTab: (tab: ChannelInviteTab) => void;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly onFriendQueryChange: (value: string) => void;
  readonly onInviteFriend: (friendId: string) => void;
  readonly onSelectDuration: (id: ServerInviteDurationId) => void;
  readonly onSelectUseLimit: (id: ServerInviteUseLimitId) => void;
  readonly open: boolean;
  readonly pendingFriendId: string | null;
  readonly qrCanvasRef?: React.Ref<HTMLCanvasElement> | undefined;
  readonly server: ChannelInviteModalCopy;
  readonly state: ServerInviteFormState;
};

function sectionLabelStyle(): React.CSSProperties {
  return {
    color: "hsl(var(--text-muted))",
    fontFamily: "var(--font-display)",
    fontSize: pxToRem(inviteModal.cardLabelFontSize),
    fontWeight: 600,
    letterSpacing: `${inviteModal.cardLabelLetterSpacing}em`,
    lineHeight: 1,
    textTransform: "uppercase",
  };
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "hsl(var(--primary)/0.16)" : "transparent",
    borderColor: active ? "hsl(var(--primary))" : `hsl(var(--border)/0.7)`,
    borderRadius: pxToRem(inviteModal.copyRadius),
    borderWidth: hairline(),
    color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
    fontSize: pxToRem(inviteModal.copyFontSize),
    height: pxToRem(inviteModal.copyHeight),
    paddingInline: pxToRem(inviteModal.copyPaddingX),
  };
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(19)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={pxToEm(19)}
    >
      <path d="M9 15l6-6M8.5 6.5 10 5a4.2 4.2 0 0 1 6 6l-1.5 1.5M15.5 17.5 14 19a4.2 4.2 0 0 1-6-6L9.5 11.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(12, 12.5)}
      stroke="hsl(var(--text-muted))"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={pxToEm(12, 12.5)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Gövde ayrı dışa aktarılır: `Modal` gövdeye portallanıyor ve `document` olmayan bir ortamda
 * `null` döndürüyor — testler kabuğun içinden hiçbir şey doğrulayamazdı.
 */
export function ChannelInviteModalView({
  activeTab,
  copied,
  friendQuery,
  friends,
  inviteUrl,
  invitedFriendIds,
  onChangeTab,
  onClose,
  onCopy,
  onFriendQueryChange,
  onInviteFriend,
  onSelectDuration,
  onSelectUseLimit,
  pendingFriendId,
  qrCanvasRef,
  server,
  state,
}: ChannelInviteModalViewProps) {
  const { t } = useI18n();
  const durationOptions = SERVER_INVITE_DURATIONS.map((option) => ({
    label: t(`server.modal.invite.duration.${option.id}`),
    value: option.id,
  }));
  const useLimitOptions = SERVER_INVITE_USE_LIMITS.map((option) => ({
    label: t(`server.modal.invite.uses.${option.id}`),
    value: option.id,
  }));
  const durationLabel = t(`server.modal.invite.duration.${state.durationId}`);
  const useLimitLabel = t(`server.modal.invite.uses.${state.useLimitId}`);
  const [openCard, setOpenCard] = useState<"duration" | "uses" | null>(null);

  return (
    <div data-testid="server-invite-modal-body">
      <div className="flex" style={{ gap: pxToRem(inviteModal.cardsGap) }}>
        {(["link", "friends"] as const).map((tab) => (
          <button
            aria-pressed={activeTab === tab}
            className="font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid={`server-invite-tab-${tab}`}
            key={tab}
            onClick={() => onChangeTab(tab)}
            style={tabStyle(activeTab === tab)}
            type="button"
          >
            {t(`server.modal.invite.tab.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "link" ? (
        <>
          <div
            className="flex items-center"
            style={{
              background: "hsl(var(--surface-base))",
              borderColor: "hsl(var(--border))",
              borderRadius: pxToRem(inviteModal.linkRowRadius),
              borderWidth: hairline(),
              gap: pxToRem(inviteModal.linkRowGap),
              marginTop: pxToRem(inviteModal.cardsMarginTop),
              paddingBlock: pxToRem(inviteModal.linkRowPaddingY),
              paddingInline: pxToRem(inviteModal.linkRowPaddingX),
            }}
          >
            <span
              // Monospace `font-mono` yardımcı sınıfından gelir (Tailwind `--font-mono`);
              // `message-item.tsx`in kod parçasıyla aynı kaynak. Satır içi bir yığın yazmak
              // dördüncü bir yazı ailesini token dışında tanımlamak olurdu (00 §2.7).
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono font-medium text-[hsl(var(--foreground))]"
              data-testid="server-invite-link"
              style={{
                fontSize: pxToRem(inviteModal.linkFontSize),
                lineHeight: inviteModal.linkLineHeight,
              }}
            >
              {inviteUrl
                ? toServerInviteDisplayUrl(inviteUrl)
                : t("server.modal.invite.link.pending")}
            </span>
            <button
              className="flex flex-none items-center border-0 font-semibold text-[hsl(var(--primary-foreground))] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="server-invite-copy"
              disabled={!inviteUrl}
              onClick={onCopy}
              style={{
                background: "hsl(var(--primary))",
                borderRadius: pxToRem(inviteModal.copyRadius),
                boxShadow: `${pxToRem(inviteModal.copyShadow.x)} ${pxToRem(
                  inviteModal.copyShadow.y,
                )} ${pxToRem(inviteModal.copyShadow.blur)} ${pxToRem(
                  inviteModal.copyShadow.spread,
                )} hsl(var(--primary))`,
                fontSize: pxToRem(inviteModal.copyFontSize),
                gap: pxToRem(inviteModal.copyGap),
                height: pxToRem(inviteModal.copyHeight),
                paddingInline: pxToRem(inviteModal.copyPaddingX),
              }}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height={pxToEm(14, 12)}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
                width={pxToEm(14, 12)}
              >
                <rect height="11" rx="2.5" width="11" x="9" y="9" />
                <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15" />
              </svg>
              {copied ? t("server.modal.invite.copied") : t("server.modal.invite.copy")}
            </button>
          </div>

          <div
            className="flex items-center"
            style={{
              gap: pxToRem(inviteModal.linkRowGap),
              marginTop: pxToRem(inviteModal.cardsMarginTop),
            }}
          >
            <canvas
              aria-label={t("server.modal.invite.qr.label")}
              data-testid="server-invite-qr"
              height={QR_BOX_SIZE}
              ref={qrCanvasRef}
              role="img"
              style={{
                borderRadius: pxToRem(inviteModal.cardRadius),
                height: pxToRem(QR_BOX_SIZE),
                width: pxToRem(QR_BOX_SIZE),
              }}
              width={QR_BOX_SIZE}
            />
            <p
              className="min-w-0 flex-1 text-[hsl(var(--text-muted))]"
              style={{
                fontSize: pxToRem(inviteModal.infoFontSize),
                lineHeight: inviteModal.infoLineHeight,
              }}
            >
              {t("server.modal.invite.qr.hint")}
            </p>
          </div>

          <div
            className="flex"
            style={{
              gap: pxToRem(inviteModal.cardsGap),
              marginTop: pxToRem(inviteModal.cardsMarginTop),
            }}
          >
            {(
              [
                ["duration", t("server.modal.invite.duration.label"), durationLabel],
                ["uses", t("server.modal.invite.uses.label"), useLimitLabel],
              ] as const
            ).map(([card, label, value]) => (
              <button
                aria-expanded={openCard === card}
                className="flex-1 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid={`server-invite-card-${card}`}
                key={card}
                onClick={() => setOpenCard((current) => (current === card ? null : card))}
                style={{
                  background: "hsl(var(--surface-base))",
                  borderColor: `hsl(var(--border)/${inviteModal.cardBorderAlpha})`,
                  borderRadius: pxToRem(inviteModal.cardRadius),
                  borderWidth: hairline(),
                  paddingBlock: pxToRem(inviteModal.cardPaddingY),
                  paddingInline: pxToRem(inviteModal.cardPaddingX),
                }}
                type="button"
              >
                <span className="block" style={sectionLabelStyle()}>
                  {label}
                </span>
                <span
                  className="flex items-center"
                  style={{
                    gap: pxToRem(inviteModal.cardValueGap),
                    marginTop: pxToRem(inviteModal.cardValueMarginTop),
                  }}
                >
                  <span
                    className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[hsl(var(--foreground))]"
                    style={{ fontSize: pxToRem(inviteModal.cardValueFontSize), lineHeight: 1 }}
                  >
                    {value}
                  </span>
                  <ChevronIcon />
                </span>
              </button>
            ))}
          </div>

          {openCard === "duration" ? (
            <div style={{ marginTop: pxToRem(inviteModal.cardsGap) }}>
              <OptionChipGroup
                onChange={onSelectDuration}
                options={durationOptions}
                testId="server-invite-duration-group"
                title={t("server.modal.invite.duration.label")}
                value={state.durationId}
                variant="settings"
              />
            </div>
          ) : null}

          {openCard === "uses" ? (
            <div style={{ marginTop: pxToRem(inviteModal.cardsGap) }}>
              <OptionChipGroup
                onChange={onSelectUseLimit}
                options={useLimitOptions}
                testId="server-invite-uses-group"
                title={t("server.modal.invite.uses.label")}
                value={state.useLimitId}
                variant="settings"
              />
            </div>
          ) : null}

          <div
            className="flex items-center"
            data-testid="server-invite-notice"
            style={{
              background: `hsl(var(--success)/${inviteModal.infoBackgroundAlpha})`,
              borderColor: `hsl(var(--success)/${inviteModal.infoBorderAlpha})`,
              borderRadius: pxToRem(inviteModal.infoRadius),
              borderWidth: hairline(),
              gap: pxToRem(inviteModal.infoGap),
              marginTop: pxToRem(inviteModal.infoMarginTop),
              paddingBlock: pxToRem(inviteModal.infoPaddingY),
              paddingInline: pxToRem(inviteModal.infoPaddingX),
            }}
          >
            <svg
              aria-hidden="true"
              className="flex-none"
              fill="none"
              height={pxToEm(15, 12)}
              stroke="hsl(var(--success))"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
              width={pxToEm(15, 12)}
            >
              <path d="M4 12.5 9 17.5 20 6.5" />
            </svg>
            <span
              className="text-[hsl(var(--text-secondary))]"
              style={{
                fontSize: pxToRem(inviteModal.infoFontSize),
                lineHeight: inviteModal.infoLineHeight,
              }}
            >
              {t(selectInviteNoticeKey(state.durationId, copied), { duration: durationLabel })}
            </span>
          </div>
        </>
      ) : (
        <div style={{ marginTop: pxToRem(inviteModal.cardsMarginTop) }}>
          <label className="block" style={sectionLabelStyle()} htmlFor="server-invite-friend-query">
            {t("server.modal.invite.friends.label")}
          </label>
          <input
            className="w-full border bg-[hsl(var(--surface-base))] font-medium text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-invite-friend-search"
            id="server-invite-friend-query"
            onChange={(event) => onFriendQueryChange(event.target.value)}
            placeholder={t("server.modal.invite.friends.placeholder")}
            style={{
              borderColor: "hsl(var(--border))",
              borderRadius: pxToRem(inviteModal.linkRowRadius),
              borderWidth: hairline(),
              fontSize: pxToRem(inviteModal.linkFontSize),
              marginTop: pxToRem(modal.inputMarginTop),
              paddingBlock: pxToRem(inviteModal.linkRowPaddingY),
              paddingInline: pxToRem(inviteModal.linkRowPaddingX),
            }}
            type="search"
            value={friendQuery}
          />

          {friends.length === 0 ? (
            <p
              className="text-[hsl(var(--text-muted))]"
              data-testid="server-invite-friends-empty"
              style={{
                fontSize: pxToRem(inviteModal.infoFontSize),
                lineHeight: inviteModal.infoLineHeight,
                marginTop: pxToRem(inviteModal.cardsMarginTop),
              }}
            >
              {t("server.modal.invite.friends.empty")}
            </p>
          ) : (
            <ul
              className="flex flex-col"
              style={{
                gap: pxToRem(inviteModal.cardsGap),
                marginTop: pxToRem(inviteModal.cardsMarginTop),
              }}
            >
              {friends.map((friend) => {
                const sent = invitedFriendIds.has(friend.id);

                return (
                  <li
                    className="flex items-center"
                    key={friend.id}
                    style={{
                      background: "hsl(var(--surface-base))",
                      borderColor: `hsl(var(--border)/${inviteModal.cardBorderAlpha})`,
                      borderRadius: pxToRem(inviteModal.cardRadius),
                      borderWidth: hairline(),
                      gap: pxToRem(inviteModal.linkRowGap),
                      paddingBlock: pxToRem(inviteModal.cardPaddingY),
                      paddingInline: pxToRem(inviteModal.cardPaddingX),
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[hsl(var(--foreground))]"
                        style={{
                          fontSize: pxToRem(inviteModal.cardValueFontSize),
                          lineHeight: 1.2,
                        }}
                      >
                        {friend.displayName}
                      </span>
                      <span
                        className="block text-[hsl(var(--text-muted))]"
                        style={{
                          fontSize: pxToRem(inviteModal.cardLabelFontSize),
                          marginTop: pxToRem(3),
                        }}
                      >
                        @{friend.username}
                      </span>
                    </span>
                    <button
                      className="flex-none font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed"
                      data-testid={`server-invite-friend-${friend.id}`}
                      disabled={sent || pendingFriendId === friend.id}
                      onClick={() => onInviteFriend(friend.id)}
                      style={{
                        background: sent ? "hsl(var(--success)/0.16)" : "hsl(var(--primary)/0.16)",
                        borderColor: sent ? "hsl(var(--success))" : "hsl(var(--primary))",
                        borderRadius: pxToRem(inviteModal.copyRadius),
                        borderWidth: hairline(),
                        color: sent ? "hsl(var(--success))" : "hsl(var(--primary))",
                        fontSize: pxToRem(inviteModal.copyFontSize),
                        height: pxToRem(inviteModal.copyHeight),
                        paddingInline: pxToRem(inviteModal.copyPaddingX),
                      }}
                      type="button"
                    >
                      {sent
                        ? t("server.modal.invite.friends.sent")
                        : t("server.modal.invite.friends.send")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end" style={serverModalPlainFooterStyle()}>
        <button
          className="border font-semibold transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="server-invite-close"
          onClick={onClose}
          style={serverModalSecondaryButtonStyle()}
          type="button"
        >
          {t("common.close")}
        </button>
      </div>

      <span className="sr-only">{server.channelName ?? server.serverName}</span>
    </div>
  );
}

export type ChannelInviteModalProps = {
  readonly channelId?: string | null;
  readonly detail: WorkspaceServerDetail;
  /**
   * Ş13 — `Sunucu ayarları › Davetler`in `Arkadaş seçerek davet` düğmesi pencereyi doğrudan
   * arkadaş sekmesinde açar. `null`/verilmezse pencere kendi varsayılanıyla (`link`) açılır.
   */
  readonly initialTab?: ChannelInviteTab | null;
  readonly onClose: () => void;
  readonly open: boolean;
};

export function ChannelInviteModal({
  channelId = null,
  detail,
  initialTab = null,
  onClose,
  open,
}: ChannelInviteModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { resolvedTheme, theme } = useTheme();
  const [state, setState] = useState<ServerInviteFormState>(SERVER_INVITE_INITIAL_STATE);
  const [activeTab, setActiveTab] = useState<ChannelInviteTab>(initialTab ?? "link");
  const [copied, setCopied] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [invitedFriendIds, setInvitedFriendIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingFriendId, setPendingFriendId] = useState<string | null>(null);
  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const serverId = detail.server.id;

  /**
   * Bağlantı bir **sorgu** olarak tutuluyor ama gövdesi bir `POST`. Bu yüzden üç varsayılan
   * kapatıldı: `retry` (başarısız bir davet isteği sessizce üç davet üretebilirdi),
   * `refetchOnWindowFocus` ve `refetchOnMount`. Anahtar seçili çipleri taşıyor: süre ya da
   * kullanım değişince yeni bir davet üretilir, aynı çiftle ikinci kez üretilmez.
   */
  const inviteQuery = useQuery({
    enabled: open,
    queryFn: () => createServerInvite(serverId, buildServerInvitePayload(state, { channelId })),
    queryKey: [
      "workspace",
      "server",
      serverId,
      "invite-draft",
      channelId ?? "default",
      state.durationId,
      state.useLimitId,
    ],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });

  const friendsQuery = useQuery({
    enabled: open && activeTab === "friends",
    queryFn: fetchFriends,
    queryKey: friendsQueryKeys.list,
    staleTime: 30_000,
  });

  const inviteUrl = useMemo(() => {
    const code = inviteQuery.data?.code;

    if (!code || typeof window === "undefined") {
      return null;
    }

    return buildServerInviteUrl(window.location.origin, code);
  }, [inviteQuery.data?.code]);

  /**
   * Sekme dönüşünde ve portal açıldığında yeni canvas oluşur. Çizimi gerçek canvas'a
   * bağla; önbellekteki bağlantı aynı kalsa da yeniden çizilsin. Tema değişimi de
   * CSS token'larından okunan renkleri yeniler.
   */
  useEffect(() => {
    if (!open || !inviteUrl || !qrCanvas) {
      return;
    }

    void renderInviteQr(qrCanvas, inviteUrl, { width: QR_BOX_SIZE });
  }, [inviteUrl, open, qrCanvas, resolvedTheme, theme]);

  const targetedMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      createServerInvite(serverId, buildServerInvitePayload(state, { channelId, targetUserId })),
    onSettled: () => setPendingFriendId(null),
    onSuccess: (_invite, targetUserId) => {
      setInvitedFriendIds((current) => new Set(current).add(targetUserId));
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
    },
  });

  const friends = useMemo<readonly InviteFriendCandidate[]>(() => {
    const rows = (friendsQuery.data ?? []).map((friend) => ({
      avatarUrl: friend.avatarUrl,
      // `displayName` sözleşmede `null` olabiliyor; satır boş bir ada düşmesin diye
      // kullanıcı adına iner — arama da iki alanı birden tarıyor.
      displayName: friend.displayName ?? friend.username,
      id: friend.id,
      username: friend.username,
    }));

    return filterInviteFriends(rows, friendQuery);
  }, [friendQuery, friendsQuery.data]);

  const handleCopy = () => {
    if (!inviteUrl) {
      return;
    }

    void navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
  };

  const channelName =
    [
      ...detail.ungroupedChannels,
      ...detail.categories.flatMap((category) => category.channels),
    ].find((channel) => channel.id === channelId)?.name ?? null;

  return (
    <ServerModalShell
      closeLabel={t("common.close")}
      description={
        channelName
          ? t("server.modal.invite.descriptionChannel", {
              channel: channelName,
              server: detail.server.name,
            })
          : t("server.modal.invite.description", { server: detail.server.name })
      }
      icon={<LinkIcon />}
      onClose={onClose}
      open={open}
      title={t("server.modal.invite.title")}
      tone="primary"
      width="invite"
    >
      <ChannelInviteModalView
        activeTab={activeTab}
        copied={copied}
        friendQuery={friendQuery}
        friends={friends}
        inviteCode={inviteQuery.data?.code ?? null}
        inviteUrl={inviteUrl}
        invitedFriendIds={invitedFriendIds}
        onChangeTab={setActiveTab}
        onClose={onClose}
        onCopy={handleCopy}
        onFriendQueryChange={setFriendQuery}
        onInviteFriend={(friendId) => {
          setPendingFriendId(friendId);
          targetedMutation.mutate(friendId);
        }}
        onSelectDuration={(durationId) => {
          setCopied(false);
          setState((current) => ({ ...current, durationId }));
        }}
        onSelectUseLimit={(useLimitId) => {
          setCopied(false);
          setState((current) => ({ ...current, useLimitId }));
        }}
        open={open}
        pendingFriendId={pendingFriendId}
        qrCanvasRef={setQrCanvas}
        server={{ channelName, serverName: detail.server.name }}
        state={state}
      />
    </ServerModalShell>
  );
}
