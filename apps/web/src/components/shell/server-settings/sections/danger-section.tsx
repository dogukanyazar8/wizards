"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import React, { useId, useMemo, useState } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { ServerToggleSwitch } from "@/components/servers/shared/toggle-row";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import {
  OwnerOnlyChip,
  SectionCardTitle,
  SectionLabel,
} from "@/components/shell/server-settings/section-parts";
import {
  TRANSFER_OWNERSHIP_INITIAL_STATE,
  type TransferOwnershipCandidate,
  type TransferOwnershipState,
  canDeleteServer,
  canTransferOwnership,
  listTransferCandidates,
  selectTransferNote,
} from "@/lib/servers/danger-zone";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { selectPrimaryRoleName } from "@/lib/servers/member-moderation";
import { useAppStore } from "@/lib/store";
import {
  deleteServerRequest,
  transferServerOwnership,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

/**
 * `Sunucu ayarları › Tehlike bölgesi` — SPEC-SUNUCU §8.9.
 *
 * **Bölümün tamamı yalnız sahibe render edilir** (00 §5). Kapı `DangerSection`'da: sahip
 * olmayan için `null` döner ve DOM'a hiçbir şey yazılmaz. Pasifleştirmek yetmezdi — devre dışı
 * bir `Sunucuyu kalıcı olarak sil` düğmesi hâlâ okunabilir bir tehdit ve yetkisiz kullanıcıya
 * gösterilecek bir bilgi değil. Negatif testi `danger-section.test.tsx` içinde.
 *
 * İki uç da mevcut: sahiplik devri Ş1'in `POST .../transfer-ownership`'ı, silme mevcut
 * `DELETE /servers/[serverId]`. Yeni uç yazılmadı.
 */

const TRANSFER_ICON_PATH =
  "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 7l4 4-4 4";
const DELETE_ICON_PATH =
  "M10.3 4.3 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9v4.5M12 17h.01";
const CHECK_PATH = "M4 12.5 9 17.5 20 6.5";

function initials(value: string): string {
  const token = value.trim();

  return token.length === 0 ? "??" : token.slice(0, 2).toLocaleUpperCase("tr");
}

export type DangerSectionViewProps = {
  readonly candidates: readonly TransferOwnershipCandidate[];
  readonly candidateRoleName: (userId: string) => string;
  readonly confirmation: string;
  readonly deleting: boolean;
  readonly error: string | null;
  readonly onConfirmationChange: (value: string) => void;
  readonly onDelete: () => void;
  readonly onToggleAcknowledged: () => void;
  readonly onSelectTarget: (userId: string) => void;
  readonly onTransfer: () => void;
  readonly serverName: string;
  readonly transfer: TransferOwnershipState;
  readonly transferring: boolean;
};

export function DangerSectionView({
  candidates,
  candidateRoleName,
  confirmation,
  deleting,
  error,
  onConfirmationChange,
  onDelete,
  onSelectTarget,
  onToggleAcknowledged,
  onTransfer,
  serverName,
  transfer,
  transferring,
}: DangerSectionViewProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const transferLabelId = useId();
  const deleteInputId = useId();
  const note = selectTransferNote(transfer);
  const transferReady = canTransferOwnership(transfer);
  const deleteReady = canDeleteServer(confirmation, serverName);
  const targetName =
    candidates.find((candidate) => candidate.userId === transfer.targetUserId)?.displayName ?? "";

  return (
    <div
      className="flex flex-col"
      data-testid="server-settings-danger"
      style={{ gap: pxToRem(settingsSections.dangerCardsGap) }}
    >
      <section
        style={{
          background: `hsl(var(--warning)/${settingsSections.dangerCardBackgroundAlpha})`,
          border: `1px solid hsl(var(--warning)/${settingsSections.dangerCardBorderAlpha})`,
          borderRadius: pxToRem(settingsSections.dangerCardRadius),
          padding: pxToRem(settingsSections.dangerCardPadding),
        }}
      >
        <div
          className="flex items-center"
          style={{ gap: pxToRem(settingsSections.dangerHeaderGap) }}
        >
          <span
            className="grid flex-none place-items-center"
            style={{
              background: `hsl(var(--warning)/${settingsSections.dangerIconBackgroundAlpha})`,
              borderRadius: pxToRem(settingsSections.dangerIconRadius),
              color: "hsl(var(--warning))",
              height: pxToRem(settingsSections.dangerIconSize),
              width: pxToRem(settingsSections.dangerIconSize),
            }}
          >
            <svg
              aria-hidden="true"
              fill="none"
              height={pxToEm(17)}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.9}
              viewBox="0 0 24 24"
              width={pxToEm(17)}
            >
              <path d={TRANSFER_ICON_PATH} />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <SectionCardTitle fontSize={settingsSections.dangerTitleFontSize}>
              {t("server.settings.danger.transfer.title")}
            </SectionCardTitle>
            <div
              className="text-[hsl(var(--text-secondary))]"
              style={{
                fontSize: pxToRem(settingsSections.dangerDescriptionFontSize),
                lineHeight: settingsSections.dangerDescriptionLineHeight,
                marginTop: pxToRem(settingsSections.dangerDescriptionMarginTop),
              }}
            >
              {t("server.settings.danger.transfer.description")}
            </div>
          </div>
        </div>

        <div style={{ marginTop: pxToRem(settingsSections.dangerLabelMarginTop) }}>
          <span id={transferLabelId}>
            <SectionLabel>{t("server.settings.danger.transfer.label")}</SectionLabel>
          </span>
        </div>

        {candidates.length === 0 ? (
          <div
            className="text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(settingsSections.transferNoteFontSize),
              lineHeight: 1.45,
              marginTop: pxToRem(settingsSections.transferOptionsMarginTop),
            }}
          >
            {t("server.settings.danger.transfer.empty")}
          </div>
        ) : (
          <div
            aria-labelledby={transferLabelId}
            className="flex flex-col"
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                return;
              }

              event.preventDefault();
              const index = candidates.findIndex(
                (candidate) => candidate.userId === transfer.targetUserId,
              );
              const delta = event.key === "ArrowDown" ? 1 : -1;
              const next =
                candidates[
                  ((index < 0 ? 0 : index + delta) + candidates.length) % candidates.length
                ];

              if (next) {
                onSelectTarget(next.userId);
              }
            }}
            role="radiogroup"
            style={{
              gap: pxToRem(settingsSections.transferOptionsGap),
              marginTop: pxToRem(settingsSections.transferOptionsMarginTop),
            }}
          >
            {candidates.map((candidate) => {
              const selected = candidate.userId === transfer.targetUserId;

              return (
                <button
                  aria-checked={selected}
                  className="flex items-center text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  key={candidate.userId}
                  onClick={() => onSelectTarget(candidate.userId)}
                  role="radio"
                  style={{
                    background: selected ? "hsl(var(--warning)/0.1)" : "hsl(var(--surface-card))",
                    border: `${settingsSections.transferOptionBorderWidth}px solid ${
                      selected ? "hsl(var(--warning))" : "hsl(var(--border)/0.7)"
                    }`,
                    borderRadius: pxToRem(settingsSections.transferOptionRadius),
                    gap: pxToRem(settingsSections.transferOptionGap),
                    padding: `${pxToRem(settingsSections.transferOptionPaddingY)} ${pxToRem(
                      settingsSections.transferOptionPaddingX,
                    )}`,
                  }}
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  <span
                    className="grid flex-none place-items-center rounded-full"
                    style={{
                      background: "hsl(var(--primary)/0.2)",
                      color: "hsl(var(--primary))",
                      fontFamily: DISPLAY_FONT,
                      fontSize: pxToRem(settingsSections.transferAvatarFontSize),
                      fontWeight: 600,
                      height: pxToRem(settingsSections.transferAvatarSize),
                      lineHeight: 1,
                      width: pxToRem(settingsSections.transferAvatarSize),
                    }}
                  >
                    {initials(candidate.displayName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[hsl(var(--foreground))]"
                      style={{
                        fontSize: pxToRem(settingsSections.transferNameFontSize),
                        fontWeight: 600,
                        lineHeight: 1.2,
                      }}
                    >
                      {candidate.displayName}
                    </span>
                    <span
                      className="block truncate text-[hsl(var(--text-muted))]"
                      style={{
                        fontSize: pxToRem(settingsSections.transferMetaFontSize),
                        fontWeight: 500,
                        lineHeight: 1,
                        marginTop: pxToRem(settingsSections.transferMetaMarginTop),
                      }}
                    >
                      {t("server.settings.danger.transfer.candidate", {
                        role: candidateRoleName(candidate.userId),
                        username: candidate.username,
                      })}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="grid flex-none place-items-center rounded-full"
                    style={{
                      background: selected ? "hsl(var(--warning))" : "transparent",
                      border: `${settingsSections.transferRadioBorderWidth}px solid ${
                        selected ? "hsl(var(--warning))" : "hsl(var(--border))"
                      }`,
                      color: "hsl(var(--warning-foreground))",
                      height: pxToRem(settingsSections.transferRadioSize),
                      width: pxToRem(settingsSections.transferRadioSize),
                    }}
                  >
                    {selected ? (
                      <svg
                        fill="none"
                        height={pxToEm(11)}
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                        width={pxToEm(11)}
                      >
                        <path d={CHECK_PATH} />
                      </svg>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div
          className="flex items-center bg-[hsl(var(--surface-card))]"
          style={{
            borderRadius: pxToRem(settingsSections.transferAckRadius),
            gap: pxToRem(settingsSections.transferAckGap),
            marginTop: pxToRem(settingsSections.transferAckMarginTop),
            padding: `${pxToRem(settingsSections.transferAckPaddingY)} ${pxToRem(
              settingsSections.transferAckPaddingX,
            )}`,
          }}
        >
          <span
            className="min-w-0 flex-1 text-[hsl(var(--text-secondary))]"
            id="server-danger-ack-label"
            style={{
              fontSize: pxToRem(settingsSections.transferAckFontSize),
              fontWeight: 500,
              lineHeight: settingsSections.transferAckLineHeight,
            }}
          >
            {t("server.settings.danger.transfer.ack")}
          </span>
          <ServerToggleSwitch
            ariaLabelledBy="server-danger-ack-label"
            checked={transfer.acknowledged}
            onChange={onToggleAcknowledged}
            testId="server-danger-ack"
          />
        </div>

        <div
          className="flex flex-wrap items-center"
          style={{
            gap: pxToRem(settingsSections.transferActionGap),
            marginTop: pxToRem(settingsSections.transferActionMarginTop),
          }}
        >
          <span
            aria-live="polite"
            className="flex-1"
            style={{
              color: transferReady ? "hsl(var(--text-secondary))" : "hsl(var(--warning))",
              fontSize: pxToRem(settingsSections.transferNoteFontSize),
              lineHeight: 1.45,
              minWidth: pxToRem(settingsSections.transferNoteMinWidth),
            }}
          >
            {note === "ready"
              ? t("server.settings.danger.transfer.note.ready", { name: targetName })
              : t(`server.settings.danger.transfer.note.${note}`)}
          </span>
          <button
            aria-disabled={!transferReady || transferring}
            className="flex-none border-0 transition-[filter] hover:brightness-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-danger-transfer-submit"
            onClick={() => {
              if (transferReady && !transferring) {
                onTransfer();
              }
            }}
            style={{
              background: transferReady ? "hsl(var(--warning))" : "hsl(var(--surface-tertiary))",
              borderRadius: pxToRem(settingsSections.transferButtonRadius),
              color: transferReady ? "hsl(var(--warning-foreground))" : "hsl(var(--text-muted))",
              cursor: transferReady && !transferring ? "pointer" : "not-allowed",
              fontSize: pxToRem(settingsSections.transferButtonFontSize),
              fontWeight: 600,
              height: pxToRem(settingsSections.transferButtonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(settingsSections.transferButtonPaddingX)}`,
            }}
            type="button"
          >
            {t("server.settings.danger.transfer.submit")}
          </button>
        </div>
      </section>

      <section
        style={{
          background: `hsl(var(--danger)/${settingsSections.dangerCardBackgroundAlpha})`,
          border: `1px solid hsl(var(--danger)/${settingsSections.dangerCardBorderAlpha})`,
          borderRadius: pxToRem(settingsSections.dangerCardRadius),
          padding: pxToRem(settingsSections.dangerCardPadding),
        }}
      >
        <div
          className="flex items-center"
          style={{ gap: pxToRem(settingsSections.dangerHeaderGap) }}
        >
          <span
            className="grid flex-none place-items-center"
            style={{
              background: `hsl(var(--danger)/${settingsSections.dangerIconBackgroundAlpha})`,
              borderRadius: pxToRem(settingsSections.dangerIconRadius),
              color: "hsl(var(--danger))",
              height: pxToRem(settingsSections.dangerIconSize),
              width: pxToRem(settingsSections.dangerIconSize),
            }}
          >
            <svg
              aria-hidden="true"
              fill="none"
              height={pxToEm(17)}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.9}
              viewBox="0 0 24 24"
              width={pxToEm(17)}
            >
              <path d={DELETE_ICON_PATH} />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <SectionCardTitle fontSize={settingsSections.dangerTitleFontSize} tone="danger">
              {t("server.settings.danger.delete.title")}
            </SectionCardTitle>
            <div
              className="text-[hsl(var(--text-secondary))]"
              style={{
                fontSize: pxToRem(settingsSections.dangerDescriptionFontSize),
                lineHeight: settingsSections.dangerDescriptionLineHeight,
                marginTop: pxToRem(settingsSections.dangerDescriptionMarginTop),
              }}
            >
              {t("server.settings.danger.delete.description")}
            </div>
          </div>
          <OwnerOnlyChip label={t("server.settings.ownerOnly")} />
        </div>

        <div style={{ marginTop: pxToRem(settingsSections.dangerLabelMarginTop) }}>
          <label htmlFor={deleteInputId}>
            <SectionLabel>{t("server.settings.danger.delete.label")}</SectionLabel>
          </label>
        </div>
        <div
          className="flex flex-wrap items-center"
          style={{
            gap: pxToRem(settingsSections.deleteRowGap),
            marginTop: pxToRem(settingsSections.deleteRowMarginTop),
          }}
        >
          <input
            aria-describedby="server-danger-delete-hint"
            className="min-w-0 flex-1 bg-[hsl(var(--surface-base))] text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-danger-delete-input"
            id={deleteInputId}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder={serverName}
            style={{
              border: `1px solid ${deleteReady ? "hsl(var(--danger))" : "hsl(var(--border))"}`,
              borderRadius: pxToRem(settingsSections.deleteInputRadius),
              boxSizing: "border-box",
              fontSize: pxToRem(settingsSections.deleteInputFontSize),
              fontWeight: 500,
              lineHeight: 1,
              minWidth: pxToRem(settingsSections.deleteInputMinWidth),
              padding: `${pxToRem(settingsSections.deleteInputPaddingY)} ${pxToRem(
                settingsSections.deleteInputPaddingX,
              )}`,
            }}
            value={confirmation}
          />
          <button
            aria-disabled={!deleteReady || deleting}
            className="flex-none border-0 transition-[filter] hover:brightness-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-danger-delete-submit"
            onClick={() => {
              if (deleteReady && !deleting) {
                onDelete();
              }
            }}
            style={{
              background: deleteReady ? "hsl(var(--danger))" : "hsl(var(--surface-tertiary))",
              borderRadius: pxToRem(settingsSections.deleteButtonRadius),
              boxShadow: deleteReady ? "0 12px 26px -16px hsl(var(--danger))" : "none",
              color: deleteReady ? "hsl(var(--danger-foreground))" : "hsl(var(--text-muted))",
              cursor: deleteReady && !deleting ? "pointer" : "not-allowed",
              fontSize: pxToRem(settingsSections.deleteButtonFontSize),
              fontWeight: 600,
              height: pxToRem(settingsSections.deleteButtonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(settingsSections.deleteButtonPaddingX)}`,
            }}
            type="button"
          >
            {t("server.settings.danger.delete.submit")}
          </button>
        </div>
        <div
          className="text-[hsl(var(--text-muted))]"
          id="server-danger-delete-hint"
          style={{
            fontSize: pxToRem(settingsSections.transferNoteFontSize),
            lineHeight: 1.45,
            marginTop: pxToRem(settingsSections.deleteRowMarginTop),
          }}
        >
          {t("server.settings.danger.delete.hint")}
        </div>
        {error ? (
          <div
            className="text-[hsl(var(--danger))]"
            role="alert"
            style={{
              fontSize: pxToRem(settingsSections.transferNoteFontSize),
              lineHeight: 1.45,
              marginTop: pxToRem(settingsSections.deleteRowMarginTop),
            }}
          >
            {error}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * 00 §5 · SPEC §8.9 — kapı **kancalardan önce**.
 *
 * Erken dönüş gövdenin içinde olsaydı sahip olmayan kullanıcı için de üç mutation ve bir
 * router aboneliği kurulurdu; ve daha önemlisi bölümün "hiç render edilmediği" ancak bir
 * sağlayıcı ağacı kurularak test edilebilirdi. Kapı burada olunca negatif test sağlayıcısız
 * koşar ve tam olarak sözleşmeyi ölçer: DOM'da hiçbir şey yok.
 */
export function DangerSection(props: ServerSettingsSectionProps) {
  if (!props.detail.server.isOwner) {
    return null;
  }

  return <DangerSectionOwner {...props} />;
}

function DangerSectionOwner({ detail }: ServerSettingsSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const closeServerSettings = useAppStore((state) => state.closeServerSettings);
  const [transfer, setTransfer] = useState<TransferOwnershipState>(
    TRANSFER_OWNERSHIP_INITIAL_STATE,
  );
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () =>
      listTransferCandidates(
        detail.members.map((member) => ({
          accessLevel: member.accessLevel,
          avatarUrl: member.avatarUrl,
          displayName: member.displayName,
          userId: member.userId,
          username: member.username,
        })),
      ),
    [detail.members],
  );

  const candidateRoleName = (userId: string): string => {
    const member = detail.members.find((row) => row.userId === userId);

    if (!member) {
      return t("server.settings.members.badge.member");
    }

    return (
      selectPrimaryRoleName(
        member.roles.map((role) => role.id),
        detail.roles,
      ) ??
      t(
        member.accessLevel === "ADMIN"
          ? "server.settings.members.badge.admin"
          : "server.settings.members.badge.member",
      )
    );
  };

  const transferMutation = useMutation({
    mutationFn: (userId: string) => transferServerOwnership(detail.server.id, userId),
    onError: () => setError(t("server.settings.danger.error")),
    onSuccess: () => {
      setError(null);
      setTransfer(TRANSFER_OWNERSHIP_INITIAL_STATE);
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(detail.server.id) });
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers });
      // Devir bitince kullanıcı Admin görünümüne düşüyor ve bu bölüm ona artık render
      // edilmiyor; kaplamayı açık bırakmak boş bir gövde göstermek olurdu.
      closeServerSettings();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteServerRequest(detail.server.id, confirmation.trim()),
    onError: () => setError(t("server.settings.danger.error")),
    onSuccess: () => {
      setError(null);
      closeServerSettings();
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers });
      queryClient.removeQueries({ queryKey: workspaceQueryKeys.server(detail.server.id) });

      router.push("/");
    },
  });

  return (
    <DangerSectionView
      candidateRoleName={candidateRoleName}
      candidates={candidates}
      confirmation={confirmation}
      deleting={deleteMutation.isPending}
      error={error}
      onConfirmationChange={setConfirmation}
      onDelete={() => deleteMutation.mutate()}
      onSelectTarget={(userId) => setTransfer((current) => ({ ...current, targetUserId: userId }))}
      onToggleAcknowledged={() =>
        setTransfer((current) => ({ ...current, acknowledged: !current.acknowledged }))
      }
      onTransfer={() => {
        if (transfer.targetUserId) {
          transferMutation.mutate(transfer.targetUserId);
        }
      }}
      serverName={detail.server.name}
      transfer={transfer}
      transferring={transferMutation.isPending}
    />
  );
}

export default DangerSection;
