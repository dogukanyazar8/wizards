"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ServerPendingInvite, WorkspaceInvite } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import {
  ChipRadioGroup,
  CollapsibleEmpty,
  CollapsibleList,
  SectionCardTitle,
  SectionLabel,
} from "@/components/shell/server-settings/section-parts";
import { renderInviteQr } from "@/lib/invites/qr";
import {
  SERVER_INVITE_DURATIONS,
  SERVER_INVITE_USE_LIMITS,
  type ServerInviteDurationId,
  type ServerInviteUseLimitId,
  buildServerInviteUrl,
  selectInviteUseLimit,
} from "@/lib/servers/invite-form";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  type ServerInviteChannelOption,
  type ServerSettingsInviteState,
  buildServerInviteSummaryParts,
  buildServerSettingsInvitePayload,
  formatInviteRemaining,
  formatInviteUses,
  initialServerSettingsInviteState,
  resolveInviteChannelName,
  toServerInviteChannelOptions,
} from "@/lib/servers/settings-invites";
import { viewerCan } from "@/lib/servers/viewer-permissions";
import { useAppStore } from "@/lib/store";
import {
  createServerInvite,
  fetchServerInvites,
  revokeServerInvite,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

/**
 * `Sunucu ayarları › Davetler` — SPEC-SUNUCU §8.7 + **K3**.
 *
 * SPEC'in kesikli "sonraki özellikler" çipleri (`QR kod · Arkadaş seçerek davet ·
 * Bekleyen davetler`) **kaldırıldı**; üçü de gerçek yüzey oldu:
 *
 * - `QR kod` satır başına açılıp kapanan bir panel; Ş3'ün `renderInviteQr`'ı canvas'a çiziyor
 *   ve renkleri çalışma anında token'dan okuyor, bu yüzden tema değişince yeniden çiziliyor.
 * - `Arkadaş seçerek davet` Ş9'un penceresini **arkadaş sekmesinde** açar; hedefli davet akışı
 *   orada zaten uçtan uca yazılı, ikinci bir kopya çıkarmadık.
 * - `Bekleyen davetler (N)` `?pending=1` ucundan besleniyor ve satırın `İptal et`i mevcut
 *   iptal ucunu çağırıyor (hedefin bildirimi Ş3 §3.9'da temizleniyor).
 *
 * Yetki: `MANAGE_INVITES` yoksa bölüm **hiç** render edilmez (00 §5).
 */

const LINK_ICON_PATH =
  "M9 15l6-6M8.5 6.5 10 5a4.2 4.2 0 0 1 6 6l-1.5 1.5M15.5 17.5 14 19a4.2 4.2 0 0 1-6-6L9.5 11.5";
const COPY_ICON_PATH =
  "M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15M11.5 9h7A2.5 2.5 0 0 1 21 11.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 9 18.5v-7A2.5 2.5 0 0 1 11.5 9z";
const QR_ICON_PATH =
  "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z";
const FRIEND_ICON_PATH =
  "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6";

export type InvitesSectionViewProps = {
  readonly channels: readonly ServerInviteChannelOption[];
  readonly copiedInviteId: string | null;
  readonly creating: boolean;
  readonly error: string | null;
  readonly invites: readonly WorkspaceInvite[];
  readonly nowMs: number;
  readonly onChange: (patch: Partial<ServerSettingsInviteState>) => void;
  readonly onCopy: (invite: WorkspaceInvite) => void;
  readonly onCreate: () => void;
  readonly onInviteFriend: () => void;
  readonly onRevoke: (inviteId: string) => void;
  readonly onToggleQr: (inviteId: string | null) => void;
  readonly onTogglePending: () => void;
  readonly openQrInviteId: string | null;
  readonly pendingExpanded: boolean;
  readonly pendingInvites: readonly ServerPendingInvite[];
  readonly qrCanvasRef?: React.RefObject<HTMLCanvasElement | null> | undefined;
  readonly state: ServerSettingsInviteState;
};

function expiryLabel(
  t: (key: string, values?: Record<string, number | string>) => string,
  expiresAt: string | null,
  nowMs: number,
): string {
  const remaining = formatInviteRemaining(expiresAt, nowMs);

  if (remaining.kind === "never") {
    return t("server.settings.invites.expiry.never");
  }

  if (remaining.kind === "expired") {
    return t("server.settings.invites.expiry.expired");
  }

  return t(`server.settings.invites.expiry.${remaining.unit}`, { count: remaining.value });
}

export function InvitesSectionView({
  channels,
  copiedInviteId,
  creating,
  error,
  invites,
  nowMs,
  onChange,
  onCopy,
  onCreate,
  onInviteFriend,
  onRevoke,
  onTogglePending,
  onToggleQr,
  openQrInviteId,
  pendingExpanded,
  pendingInvites,
  qrCanvasRef,
  state,
}: InvitesSectionViewProps) {
  const { t } = useI18n();
  const { inviteModal, settingsSections } = SERVER_METRICS;
  const summary = buildServerInviteSummaryParts(state, channels);
  const useLimit = selectInviteUseLimit(summary.useLimitId);
  const chipMetrics = {
    chipFontSize: settingsSections.invitesChipFontSize,
    chipGap: settingsSections.invitesChipsGap,
    chipPaddingX: settingsSections.invitesChipPaddingX,
    chipPaddingY: settingsSections.invitesChipPaddingY,
    chipRadius: settingsSections.invitesChipRadius,
  };

  const summaryText = t("server.settings.invites.summary", {
    channel: summary.channelName
      ? `# ${summary.channelName}`
      : t("server.settings.invites.summary.noChannel"),
    duration: t(`server.modal.invite.duration.${summary.durationId}`),
    uses:
      useLimit.maxUses === null
        ? t("server.settings.invites.summary.unlimited")
        : t("server.settings.invites.summary.uses", { count: useLimit.maxUses }),
  });

  return (
    <div data-testid="server-settings-invites">
      <section
        className="border bg-[hsl(var(--surface-card))]"
        style={{
          borderColor: `hsl(var(--border)/${SERVER_METRICS.settings.cardBorderAlpha})`,
          borderRadius: pxToRem(SERVER_METRICS.settings.cardSectionRadius),
          padding: pxToRem(SERVER_METRICS.settings.cardPadding),
        }}
      >
        <SectionCardTitle fontSize={settingsSections.invitesTitleFontSize}>
          {t("server.settings.invites.new")}
        </SectionCardTitle>
        <div
          className="flex flex-col"
          style={{
            gap: pxToRem(settingsSections.invitesGroupsGap),
            marginTop: pxToRem(settingsSections.invitesGroupsMarginTop),
          }}
        >
          <ChipRadioGroup
            label={t("server.settings.invites.field.channel")}
            metrics={chipMetrics}
            onChange={(channelId) => onChange({ channelId })}
            options={channels.map((channel) => ({
              label: `# ${channel.name}`,
              value: channel.id,
            }))}
            testId="server-settings-invite-channels"
            value={state.channelId ?? ""}
          />
          <ChipRadioGroup
            label={t("server.settings.invites.field.duration")}
            metrics={chipMetrics}
            onChange={(durationId: ServerInviteDurationId) => onChange({ durationId })}
            options={SERVER_INVITE_DURATIONS.map((option) => ({
              label: t(`server.modal.invite.duration.${option.id}`),
              value: option.id,
            }))}
            testId="server-settings-invite-durations"
            value={state.durationId}
          />
          <ChipRadioGroup
            label={t("server.settings.invites.field.uses")}
            metrics={chipMetrics}
            onChange={(useLimitId: ServerInviteUseLimitId) => onChange({ useLimitId })}
            options={SERVER_INVITE_USE_LIMITS.map((option) => ({
              label: t(`server.modal.invite.uses.${option.id}`),
              value: option.id,
            }))}
            testId="server-settings-invite-uses"
            value={state.useLimitId}
          />
        </div>

        <div
          className="flex flex-wrap items-center"
          style={{
            borderTop: `1px solid hsl(var(--border)/${settingsSections.invitesSummaryBorderTopAlpha})`,
            gap: pxToRem(settingsSections.invitesSummaryGap),
            marginTop: pxToRem(settingsSections.invitesSummaryMarginTop),
            paddingTop: pxToRem(settingsSections.invitesSummaryPaddingTop),
          }}
        >
          <span
            className="flex-1 text-[hsl(var(--text-secondary))]"
            data-testid="server-settings-invite-summary"
            style={{
              fontSize: pxToRem(settingsSections.invitesSummaryFontSize),
              fontWeight: 600,
              lineHeight: settingsSections.invitesSummaryLineHeight,
              minWidth: pxToRem(settingsSections.invitesSummaryMinWidth),
            }}
          >
            {summaryText}
          </span>
          <button
            className="flex flex-none items-center border-0 text-[hsl(var(--primary-foreground))] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-settings-invite-create"
            disabled={creating}
            onClick={onCreate}
            style={{
              background: "hsl(var(--primary))",
              borderRadius: pxToRem(settingsSections.invitesCreateRadius),
              boxShadow: "0 12px 26px -18px hsl(var(--primary))",
              fontSize: pxToRem(settingsSections.invitesCreateFontSize),
              fontWeight: 600,
              gap: pxToRem(settingsSections.invitesCreateGap),
              height: pxToRem(settingsSections.invitesCreateHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(settingsSections.invitesCreatePaddingX)}`,
            }}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height={pxToEm(14, settingsSections.invitesCreateFontSize)}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              viewBox="0 0 24 24"
              width={pxToEm(14, settingsSections.invitesCreateFontSize)}
            >
              <path d={LINK_ICON_PATH} />
            </svg>
            {t("server.settings.invites.create")}
          </button>
        </div>
      </section>

      <div style={{ marginTop: pxToRem(settingsSections.invitesListMarginTop) }}>
        <SectionLabel>{t("server.settings.invites.existing")}</SectionLabel>
      </div>
      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(settingsSections.invitesRowsGap),
          marginTop: pxToRem(settingsSections.invitesRowsMarginTop),
        }}
      >
        {invites.length === 0 ? (
          <CollapsibleEmpty>{t("server.settings.invites.empty")}</CollapsibleEmpty>
        ) : null}
        {invites.map((invite) => {
          const channelName = resolveInviteChannelName(invite.channelId, channels);
          const qrOpen = openQrInviteId === invite.id;

          return (
            <div key={invite.id}>
              <div
                className="flex flex-wrap items-center border bg-[hsl(var(--surface-card))]"
                data-testid={`server-settings-invite-${invite.id}`}
                style={{
                  borderColor: `hsl(var(--border)/${settingsSections.membersRowBorderAlpha})`,
                  borderRadius: pxToRem(settingsSections.invitesRowRadius),
                  gap: pxToRem(settingsSections.invitesRowGap),
                  padding: `${pxToRem(settingsSections.invitesRowPaddingY)} ${pxToRem(
                    settingsSections.invitesRowPaddingX,
                  )}`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="flex items-center"
                    style={{ gap: pxToRem(settingsSections.invitesCodeGap) }}
                  >
                    <span
                      // Monospace `font-mono`'dan; satır içi yığın yok (00 §2.7).
                      className="font-mono text-[hsl(var(--foreground))]"
                      style={{
                        fontSize: pxToRem(settingsSections.invitesCodeFontSize),
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      {invite.code}
                    </span>
                    {channelName ? (
                      <span
                        className="flex-none bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))]"
                        style={{
                          borderRadius: pxToRem(settingsSections.invitesChannelChipRadius),
                          fontFamily: DISPLAY_FONT,
                          fontSize: pxToRem(settingsSections.invitesChannelChipFontSize),
                          fontWeight: 600,
                          lineHeight: 1,
                          padding: `${pxToRem(
                            settingsSections.invitesChannelChipPaddingY,
                          )} ${pxToRem(settingsSections.invitesChannelChipPaddingX)}`,
                        }}
                      >
                        # {channelName}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="text-[hsl(var(--text-muted))]"
                    style={{
                      fontSize: pxToRem(settingsSections.invitesMetaFontSize),
                      fontWeight: 500,
                      lineHeight: 1,
                      marginTop: pxToRem(settingsSections.invitesMetaMarginTop),
                    }}
                  >
                    {t("server.settings.invites.meta", {
                      expiry: expiryLabel(t, invite.expiresAt, nowMs),
                      name: invite.createdByDisplayName,
                    })}
                  </div>
                </div>
                <span
                  className="flex-none bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))]"
                  style={{
                    borderRadius: pxToRem(settingsSections.invitesUsesChipRadius),
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settingsSections.invitesUsesChipFontSize),
                    fontWeight: 600,
                    lineHeight: 1,
                    padding: `${pxToRem(settingsSections.invitesUsesChipPaddingY)} ${pxToRem(
                      settingsSections.invitesUsesChipPaddingX,
                    )}`,
                  }}
                >
                  {formatInviteUses({ limit: invite.maxUses, uses: invite.uses })}
                </span>
                <button
                  aria-pressed={qrOpen}
                  className="flex flex-none items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid={`server-settings-invite-qr-${invite.id}`}
                  onClick={() => onToggleQr(qrOpen ? null : invite.id)}
                  style={{
                    borderRadius: pxToRem(settingsSections.invitesActionRadius),
                    fontSize: pxToRem(settingsSections.invitesActionFontSize),
                    fontWeight: 600,
                    gap: pxToRem(settingsSections.invitesActionGap),
                    height: pxToRem(settingsSections.invitesActionHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(settingsSections.invitesActionPaddingX)}`,
                    whiteSpace: "nowrap",
                  }}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height={pxToEm(14, settingsSections.invitesActionFontSize)}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.7}
                    viewBox="0 0 24 24"
                    width={pxToEm(14, settingsSections.invitesActionFontSize)}
                  >
                    <path d={QR_ICON_PATH} />
                  </svg>
                  {qrOpen ? t("server.settings.invites.qr.hide") : t("server.settings.invites.qr")}
                </button>
                <button
                  className="flex flex-none items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid={`server-settings-invite-copy-${invite.id}`}
                  onClick={() => onCopy(invite)}
                  style={{
                    borderRadius: pxToRem(settingsSections.invitesActionRadius),
                    fontSize: pxToRem(settingsSections.invitesActionFontSize),
                    fontWeight: 600,
                    gap: pxToRem(settingsSections.invitesActionGap),
                    height: pxToRem(settingsSections.invitesActionHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(settingsSections.invitesActionPaddingX)}`,
                    whiteSpace: "nowrap",
                  }}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height={pxToEm(14, settingsSections.invitesActionFontSize)}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    width={pxToEm(14, settingsSections.invitesActionFontSize)}
                  >
                    <path d={COPY_ICON_PATH} />
                  </svg>
                  {copiedInviteId === invite.id
                    ? t("server.settings.invites.copied")
                    : t("server.settings.invites.copy")}
                </button>
                <button
                  className="flex-none border text-[hsl(var(--danger))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid={`server-settings-invite-revoke-${invite.id}`}
                  onClick={() => onRevoke(invite.id)}
                  style={{
                    background: "transparent",
                    borderColor: "hsl(var(--danger)/0.35)",
                    borderRadius: pxToRem(settingsSections.invitesActionRadius),
                    fontSize: pxToRem(settingsSections.invitesActionFontSize),
                    fontWeight: 600,
                    height: pxToRem(settingsSections.invitesActionHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(settingsSections.invitesActionPaddingX)}`,
                    whiteSpace: "nowrap",
                  }}
                  type="button"
                >
                  {t("server.settings.invites.revoke")}
                </button>
              </div>
              {qrOpen ? (
                <div
                  className="flex items-center border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))]"
                  data-testid={`server-settings-invite-qr-panel-${invite.id}`}
                  style={{
                    borderRadius: pxToRem(settingsSections.invitesQrPanelRadius),
                    gap: pxToRem(settingsSections.invitesQrPanelGap),
                    marginTop: pxToRem(settingsSections.invitesQrPanelMarginTop),
                    padding: pxToRem(settingsSections.invitesQrPanelPadding),
                  }}
                >
                  <canvas
                    aria-label={t("server.settings.invites.qr.alt", { code: invite.code })}
                    className="flex-none rounded-[inherit]"
                    height={inviteModal.qrBoxSize}
                    ref={qrCanvasRef}
                    role="img"
                    style={{
                      height: pxToRem(inviteModal.qrBoxSize),
                      width: pxToRem(inviteModal.qrBoxSize),
                    }}
                    width={inviteModal.qrBoxSize}
                  />
                  <span
                    className="min-w-0 flex-1 text-[hsl(var(--text-secondary))]"
                    style={{
                      fontSize: pxToRem(settingsSections.invitesQrCaptionFontSize),
                      lineHeight: settingsSections.invitesQrCaptionLineHeight,
                    }}
                  >
                    {t("server.settings.invites.qr.caption")}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center"
        style={{
          gap: pxToRem(settingsSections.invitesSecondaryGap),
          marginTop: pxToRem(settingsSections.invitesSecondaryMarginTop),
        }}
      >
        <button
          className="flex items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="server-settings-invite-friends"
          onClick={onInviteFriend}
          style={{
            borderRadius: pxToRem(settingsSections.invitesActionRadius),
            fontSize: pxToRem(settingsSections.invitesActionFontSize),
            fontWeight: 600,
            gap: pxToRem(settingsSections.invitesActionGap),
            height: pxToRem(settingsSections.invitesActionHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(settingsSections.invitesActionPaddingX)}`,
            whiteSpace: "nowrap",
          }}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height={pxToEm(14, settingsSections.invitesActionFontSize)}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.9}
            viewBox="0 0 24 24"
            width={pxToEm(14, settingsSections.invitesActionFontSize)}
          >
            <path d={FRIEND_ICON_PATH} />
          </svg>
          {t("server.settings.invites.friends")}
        </button>
      </div>

      <CollapsibleList
        expanded={pendingExpanded}
        label={t("server.settings.invites.pending.toggle", { count: pendingInvites.length })}
        onToggle={onTogglePending}
        testId="server-settings-invites-pending-toggle"
      >
        {pendingInvites.length === 0 ? (
          <CollapsibleEmpty>{t("server.settings.invites.pending.empty")}</CollapsibleEmpty>
        ) : (
          <div
            className="flex flex-col"
            style={{ gap: pxToRem(settingsSections.collapsibleRowsGap) }}
          >
            {pendingInvites.map((invite) => {
              const channelName = resolveInviteChannelName(invite.channelId, channels);

              return (
                <div
                  className="flex flex-wrap items-center border bg-[hsl(var(--surface-card))]"
                  data-testid={`server-settings-pending-invite-${invite.id}`}
                  key={invite.id}
                  style={{
                    borderColor: `hsl(var(--border)/${settingsSections.membersRowBorderAlpha})`,
                    borderRadius: pxToRem(settingsSections.invitesRowRadius),
                    gap: pxToRem(settingsSections.invitesRowGap),
                    padding: `${pxToRem(settingsSections.invitesRowPaddingY)} ${pxToRem(
                      settingsSections.invitesRowPaddingX,
                    )}`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[hsl(var(--foreground))]"
                      style={{
                        fontSize: pxToRem(settingsSections.membersNameFontSize),
                        fontWeight: 600,
                        lineHeight: 1.2,
                      }}
                    >
                      {invite.targetUser.displayName ?? invite.targetUser.username}
                    </div>
                    <div
                      className="text-[hsl(var(--text-muted))]"
                      style={{
                        fontSize: pxToRem(settingsSections.invitesMetaFontSize),
                        fontWeight: 500,
                        lineHeight: 1,
                        marginTop: pxToRem(settingsSections.invitesMetaMarginTop),
                      }}
                    >
                      {t("server.settings.invites.pending.meta", {
                        channel: channelName
                          ? `# ${channelName}`
                          : t("server.settings.invites.pending.noChannel"),
                        expiry: expiryLabel(t, invite.expiresAt, nowMs),
                      })}
                    </div>
                  </div>
                  <button
                    className="flex-none border text-[hsl(var(--danger))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid={`server-settings-pending-revoke-${invite.id}`}
                    onClick={() => onRevoke(invite.id)}
                    style={{
                      background: "transparent",
                      borderColor: "hsl(var(--danger)/0.35)",
                      borderRadius: pxToRem(settingsSections.invitesActionRadius),
                      fontSize: pxToRem(settingsSections.invitesActionFontSize),
                      fontWeight: 600,
                      height: pxToRem(settingsSections.invitesActionHeight),
                      lineHeight: 1,
                      padding: `0 ${pxToRem(settingsSections.invitesActionPaddingX)}`,
                      whiteSpace: "nowrap",
                    }}
                    type="button"
                  >
                    {t("server.settings.invites.revoke")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleList>

      {error ? (
        <div
          className="text-[hsl(var(--danger))]"
          role="alert"
          style={{
            fontSize: pxToRem(settingsSections.invitesMetaFontSize),
            lineHeight: 1.45,
            marginTop: pxToRem(settingsSections.invitesSecondaryMarginTop),
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** 00 §5 · lane §2 — `MANAGE_INVITES` kapısı **kancalardan önce** (gerekçe: `danger-section`). */
export function InvitesSection(props: ServerSettingsSectionProps) {
  if (!viewerCan(props.permissions, "MANAGE_INVITES")) {
    return null;
  }

  return <InvitesSectionContent {...props} />;
}

function InvitesSectionContent({ detail }: ServerSettingsSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { resolvedTheme, theme } = useTheme();
  const openInviteModal = useAppStore((store) => store.openInviteModal);
  const serverId = detail.server.id;
  const channels = useMemo(() => toServerInviteChannelOptions(detail), [detail]);
  const [state, setState] = useState<ServerSettingsInviteState>(() =>
    initialServerSettingsInviteState(channels),
  );
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [openQrInviteId, setOpenQrInviteId] = useState<string | null>(null);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * "Şimdi" render sırasında okunmaz: `Date.now()` saf olmayan bir çağrı ve satırın kalan
   * süresi her yeniden çizimde başka bir sayı verirdi. Değer bir kez alınır, dakikada iki kez
   * tazelenir — en kısa aralık `dakika` olduğu için bu yeterli.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);

    return () => clearInterval(timer);
  }, []);

  const invitesQuery = useQuery({
    queryFn: () => fetchServerInvites(serverId),
    queryKey: workspaceQueryKeys.serverInvites(serverId),
    staleTime: 15_000,
  });

  const pendingQuery = useQuery({
    enabled: pendingExpanded,
    queryFn: () => fetchServerInvites(serverId, { pending: true }),
    queryKey: workspaceQueryKeys.serverPendingInvites(serverId),
    staleTime: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.serverInvites(serverId) });
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
  };

  const createMutation = useMutation({
    mutationFn: () => createServerInvite(serverId, buildServerSettingsInvitePayload(state)),
    onError: () => setError(t("server.settings.invites.error")),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokeServerInvite(serverId, inviteId),
    onError: () => setError(t("server.settings.invites.error")),
    onSuccess: () => {
      setError(null);
      setOpenQrInviteId(null);
      invalidate();
    },
  });

  const invites = invitesQuery.data?.invites ?? detail.invites;

  /**
   * QR yeniden çizilir hem seçili satır hem de **tema** değiştiğinde: renkler çalışma anında
   * `--foreground` / `--surface-card` token'ından okunuyor ve tema değişimi token'ın değerini
   * değiştiriyor, bileşenin girdilerini değil (Ş3 §3.6).
   */
  useEffect(() => {
    if (!openQrInviteId || typeof window === "undefined") {
      return;
    }

    const invite = invites.find((row) => row.id === openQrInviteId);

    if (!invite) {
      return;
    }

    void renderInviteQr(
      qrCanvasRef.current,
      buildServerInviteUrl(window.location.origin, invite.code),
      { width: SERVER_METRICS.inviteModal.qrBoxSize },
    );
  }, [invites, openQrInviteId, resolvedTheme, theme]);

  return (
    <InvitesSectionView
      channels={channels}
      copiedInviteId={copiedInviteId}
      creating={createMutation.isPending}
      error={error}
      invites={invites}
      nowMs={nowMs}
      onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
      onCopy={(invite) => {
        if (typeof window === "undefined") {
          return;
        }

        void navigator.clipboard
          .writeText(buildServerInviteUrl(window.location.origin, invite.code))
          .then(() => setCopiedInviteId(invite.id))
          .catch(() => setError(t("server.settings.invites.error")));
      }}
      onCreate={() => createMutation.mutate()}
      onInviteFriend={() =>
        openInviteModal(serverId, { channelId: state.channelId, tab: "friends" })
      }
      onRevoke={(inviteId) => revokeMutation.mutate(inviteId)}
      onTogglePending={() => setPendingExpanded((current) => !current)}
      onToggleQr={setOpenQrInviteId}
      openQrInviteId={openQrInviteId}
      pendingExpanded={pendingExpanded}
      pendingInvites={pendingQuery.data?.invites ?? []}
      qrCanvasRef={qrCanvasRef}
      state={state}
    />
  );
}

export default InvitesSection;
