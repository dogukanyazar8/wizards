"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { WorkspacePermissionKey, WorkspaceRole } from "@wizards/types";
import { Button } from "@wizards/ui";

import { useI18n } from "@/components/providers/locale-provider";
import type { ServerSettingsSectionProps } from "../section-props";
import { Modal } from "@/components/ui/modal";
import { PermissionGroupCard } from "@/components/servers/shared/permission-group-card";
import { ToggleRow } from "@/components/servers/shared/toggle-row";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import { viewerCan } from "@/lib/servers/viewer-permissions";
import {
  SERVER_PERMISSION_GROUPS,
  type ServerRolePresetId,
  countSelected,
  setPermissionGroupSelection,
} from "@/lib/servers/permission-groups";
import {
  SERVER_ROLE_TONES,
  type ServerRoleTone,
  getRoleToneColor,
  roleToneToColor,
} from "@/lib/servers/role-color";
import {
  ROLE_NAME_MAX_LENGTH,
  SERVER_ROLE_PRESETS,
  type ServerRoleDraft,
  type ServerRoleGuardCopy,
  type ServerRoleSelection,
  applyRolePreset,
  canDeleteRole,
  canSubmitRoleDraft,
  clampRoleName,
  countRoleMembers,
  createRoleDraft,
  getRoleGuardCopy,
  isProtectedRole,
  matchRolePreset,
  sortRolesForSettings,
  toRoleDraft,
  togglePermission,
} from "@/lib/servers/role-editor";
import {
  createWorkspaceRoleRequest,
  deleteWorkspaceRoleRequest,
  updateWorkspaceRoleRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { cn } from "@/lib/utils";

/**
 * Sunucu ayarları › **Roller ve Yetkiler** — SPEC-SUNUCU §8.5.
 *
 * Rol oluşturma **ayrı bir pencere değil**: sol listeye `TASLAK` satırı düşer, sağ panel boş
 * taslağa geçer ve `Rolü sil` kartının yerini `Vazgeç` / `Rol oluştur` çubuğu alır. Bu yüzden
 * sağ panel iki ayrı bileşen değil tek bir bileşendir ve neyi çizeceğini `selection`'dan
 * okur — iki kopya, "ad girilince başlık ada döner" gibi küçük kuralların birinde unutulması
 * demekti.
 *
 * **Korunan roller.** `@everyone`, yönetilen roller ve yüksek yetkili roller uçta hem
 * güncellemeye hem silmeye kapalı (`role-service.ts` → `403 PROTECTED_ROLE`). Panel bunu
 * bilerek çizer: anahtarlar `readOnly`, ad ve renk kilitli, kartın yerinde guard rozeti.
 * Kapıyı yalnız uçta bırakmak, kullanıcıyı her dokunuşta boş bir hataya göndermek olurdu.
 *
 * `Yönetici` satırı ve `Rolü sil` kartı sahip **dışına hiç render edilmez** (00 §5).
 */

export type RolesSectionViewProps = {
  draft: ServerRoleDraft;
  guard: ServerRoleGuardCopy | null;
  isOwner: boolean;
  onCancelDraft: () => void;
  onDeleteRole: () => void;
  onDraftChange: (next: ServerRoleDraft) => void;
  onNameCommit: () => void;
  onSelectRole: (roleId: string) => void;
  onStartDraft: () => void;
  onSubmitDraft: () => void;
  /** Korunan rol seçili; girdiler ve anahtarlar kilitli. */
  readOnly: boolean;
  roleMemberCounts: Readonly<Record<string, number>>;
  roles: readonly WorkspaceRole[];
  selection: ServerRoleSelection;
  submitting: boolean;
};

export function RolesSectionView({
  draft,
  guard,
  isOwner,
  onCancelDraft,
  onDeleteRole,
  onDraftChange,
  onNameCommit,
  onSelectRole,
  onStartDraft,
  onSubmitDraft,
  readOnly,
  roleMemberCounts,
  roles,
  selection,
  submitting,
}: RolesSectionViewProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const isDraft = selection.kind === "draft";
  const selectedRole =
    selection.kind === "role" ? (roles.find((role) => role.id === selection.roleId) ?? null) : null;
  const permissionCount = countSelected(draft.permissions);
  const activePreset = matchRolePreset(draft.permissions);
  const draftReady = canSubmitRoleDraft(draft);

  return (
    <div
      className="grid items-start"
      data-testid="server-settings-roles"
      style={{
        gap: pxToRem(settingsSections.rolesGridGap),
        gridTemplateColumns: `${pxToRem(settingsSections.rolesListColumnWidth)} minmax(0,1fr)`,
      }}
    >
      <div
        aria-label={t("server.settings.roles.listLabel")}
        className="border bg-[hsl(var(--surface-card))]"
        role="group"
        style={{
          borderColor: `hsl(var(--border)/${settingsSections.rolesGroupBorderAlpha})`,
          borderRadius: pxToRem(settingsSections.channelsCardRadius),
          borderWidth: hairline(),
          padding: pxToRem(settingsSections.rolesListPadding),
        }}
      >
        {roles.map((role) => {
          const active = !isDraft && selectedRole?.id === role.id;

          return (
            <button
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full cursor-pointer items-center border-0 text-left transition-colors",
                active
                  ? "text-[hsl(var(--primary))]"
                  : "bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))]",
              )}
              data-testid={`settings-role-${role.id}`}
              key={role.id}
              onClick={() => onSelectRole(role.id)}
              style={{
                background: active
                  ? `hsl(var(--primary)/${settingsSections.rolesRowActiveAlpha})`
                  : undefined,
                borderRadius: pxToRem(settingsSections.rolesRowRadius),
                fontWeight: active ? 600 : 500,
                gap: pxToRem(settingsSections.rolesRowGap),
                marginBottom: pxToRem(settingsSections.rolesRowMarginBottom),
                padding: `${pxToRem(settingsSections.rolesRowPaddingY)} ${pxToRem(settingsSections.rolesRowPaddingX)}`,
              }}
              type="button"
            >
              <RoleDot role={role} size={settingsSections.rolesDotSize} />
              <span
                className="min-w-0 flex-1 truncate"
                style={{
                  fontSize: pxToRem(settingsSections.rolesRowFontSize),
                  lineHeight: 1.2,
                }}
              >
                {role.name}
              </span>
              <span
                aria-label={t("server.settings.roles.memberCountLabel", {
                  count: roleMemberCounts[role.id] ?? 0,
                })}
                className="shrink-0 font-semibold text-[hsl(var(--text-muted))]"
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(settingsSections.rolesCountFontSize),
                  lineHeight: 1,
                }}
              >
                {roleMemberCounts[role.id] ?? 0}
              </span>
            </button>
          );
        })}

        {isDraft ? (
          <div
            className="flex items-center text-[hsl(var(--primary))]"
            data-testid="settings-role-draft-row"
            style={{
              background: `hsl(var(--primary)/${settingsSections.rolesRowActiveAlpha})`,
              borderRadius: pxToRem(settingsSections.rolesRowRadius),
              gap: pxToRem(settingsSections.rolesRowGap),
              marginBottom: pxToRem(settingsSections.rolesRowMarginBottom),
              padding: `${pxToRem(settingsSections.rolesRowPaddingY)} ${pxToRem(settingsSections.rolesRowPaddingX)}`,
            }}
          >
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{
                background: getRoleToneColor(draft.tone),
                height: pxToRem(settingsSections.rolesDotSize),
                width: pxToRem(settingsSections.rolesDotSize),
              }}
            />
            <span
              className="min-w-0 flex-1 truncate font-semibold"
              style={{ fontSize: pxToRem(settingsSections.rolesRowFontSize), lineHeight: 1.2 }}
            >
              {draft.name.trim() || t("server.settings.roles.newRoleName")}
            </span>
            <span
              className="shrink-0 font-semibold text-[hsl(var(--primary))]"
              style={{
                background: "hsl(var(--primary)/0.22)",
                borderRadius: pxToRem(settingsSections.rolesDraftChipRadius),
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(settingsSections.rolesDraftChipFontSize),
                lineHeight: 1,
                padding: `${pxToRem(settingsSections.rolesDraftChipPaddingY)} ${pxToRem(settingsSections.rolesDraftChipPaddingX)}`,
              }}
            >
              {t("server.settings.roles.draftBadge")}
            </span>
          </div>
        ) : null}

        <button
          className="flex w-full cursor-pointer items-center justify-center border border-dashed font-semibold text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/0.08)]"
          data-testid="settings-role-create"
          onClick={onStartDraft}
          style={{
            background: isDraft ? "hsl(var(--primary)/0.1)" : "transparent",
            borderColor: isDraft ? "hsl(var(--primary)/0.55)" : "hsl(var(--border))",
            borderRadius: pxToRem(settingsSections.rolesCreateButtonRadius),
            borderWidth: hairline(),
            fontSize: pxToRem(settingsSections.rolesCreateButtonFontSize),
            gap: pxToRem(settingsSections.rolesCreateButtonGap),
            lineHeight: 1,
            marginTop: pxToRem(settingsSections.rolesCreateButtonMarginTop),
            paddingBlock: pxToRem(settingsSections.rolesCreateButtonPaddingY),
          }}
          type="button"
        >
          <Plus
            aria-hidden="true"
            style={{
              height: pxToEm(
                settingsSections.rolesCreateButtonGlyphSize,
                settingsSections.rolesCreateButtonFontSize,
              ),
              width: pxToEm(
                settingsSections.rolesCreateButtonGlyphSize,
                settingsSections.rolesCreateButtonFontSize,
              ),
            }}
          />
          {t("server.settings.roles.createRole")}
        </button>
      </div>

      {selection.kind === "empty" ? (
        <p
          className="text-[hsl(var(--text-muted))]"
          style={{ fontSize: pxToRem(settingsSections.rolesMentionDescriptionFontSize) }}
        >
          {t("server.settings.roles.empty")}
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: pxToRem(settingsSections.rolesDetailGap) }}>
          <div
            className="border bg-[hsl(var(--surface-card))]"
            style={{
              borderColor: `hsl(var(--border)/${settingsSections.rolesGroupBorderAlpha})`,
              borderRadius: pxToRem(settingsSections.channelsCardRadius),
              borderWidth: hairline(),
              padding: pxToRem(SERVER_METRICS.settings.cardPadding),
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: pxToRem(settingsSections.rolesHeaderGap) }}
            >
              <span
                aria-hidden="true"
                className="shrink-0 rounded-full"
                style={{
                  background: getRoleToneColor(draft.tone),
                  height: pxToRem(settingsSections.rolesHeaderDotSize),
                  width: pxToRem(settingsSections.rolesHeaderDotSize),
                }}
              />
              <span
                className={cn(
                  "font-semibold",
                  isDraft && !draft.name.trim()
                    ? "text-[hsl(var(--text-muted))]"
                    : "text-[hsl(var(--foreground))]",
                )}
                data-testid="settings-role-heading"
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(settingsSections.rolesHeaderNameFontSize),
                  letterSpacing: DISPLAY_TRACKING,
                  lineHeight: 1.2,
                }}
              >
                {isDraft
                  ? draft.name.trim() || t("server.settings.roles.newRoleName")
                  : selectedRole?.name}
              </span>
              {isDraft ? (
                <span
                  className="shrink-0 font-semibold text-[hsl(var(--primary))]"
                  style={{
                    background: "hsl(var(--primary)/0.16)",
                    borderRadius: pxToRem(settingsSections.rolesNewChipRadius),
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settingsSections.rolesNewChipFontSize),
                    lineHeight: 1,
                    padding: `${pxToRem(settingsSections.rolesNewChipPaddingY)} ${pxToRem(settingsSections.rolesNewChipPaddingX)}`,
                  }}
                >
                  {t("server.settings.roles.newRoleBadge")}
                </span>
              ) : null}
              <span
                className="ml-auto shrink-0 font-semibold text-[hsl(var(--primary))]"
                data-testid="settings-role-permission-count"
                style={{
                  background: `hsl(var(--primary)/${settingsSections.rolesRowActiveAlpha})`,
                  borderRadius: pxToRem(settingsSections.rolesSelectedChipRadius),
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(settingsSections.rolesSelectedChipFontSize),
                  lineHeight: 1,
                  padding: `${pxToRem(settingsSections.rolesSelectedChipPaddingY)} ${pxToRem(settingsSections.rolesSelectedChipPaddingX)}`,
                }}
              >
                {t("server.settings.roles.selectedCount", { count: permissionCount })}
              </span>
            </div>

            {guard ? (
              <p
                className="text-[hsl(var(--text-muted))]"
                data-testid="settings-role-guard"
                style={{
                  fontSize: pxToRem(settingsSections.rolesMentionDescriptionFontSize),
                  lineHeight: 1.4,
                  marginTop: pxToRem(settingsSections.rolesMentionDescriptionMarginTop),
                }}
              >
                <strong className="font-semibold text-[hsl(var(--text-secondary))]">
                  {t(guard.labelKey)}
                </strong>{" "}
                {t(guard.descriptionKey)}
              </p>
            ) : null}

            <div
              className="grid items-start"
              style={{
                gap: pxToRem(settingsSections.rolesFieldGridGap),
                gridTemplateColumns: "minmax(0,1fr) auto",
                marginTop: pxToRem(settingsSections.rolesFieldGridMarginTop),
              }}
            >
              <div>
                <FieldLabel htmlFor="settings-role-name">
                  {t("server.settings.roles.nameLabel")}
                </FieldLabel>
                <input
                  className="w-full border bg-[hsl(var(--surface-base))] font-medium text-[hsl(var(--foreground))] outline-hidden focus-visible:border-[hsl(var(--primary)/0.7)] disabled:cursor-not-allowed disabled:text-[hsl(var(--text-muted))]"
                  data-testid="settings-role-name"
                  disabled={readOnly}
                  id="settings-role-name"
                  maxLength={ROLE_NAME_MAX_LENGTH}
                  onBlur={onNameCommit}
                  onChange={(event) =>
                    onDraftChange({ ...draft, name: clampRoleName(event.target.value) })
                  }
                  placeholder={t("server.settings.roles.namePlaceholder")}
                  style={{
                    borderColor: "hsl(var(--border))",
                    borderRadius: pxToRem(settingsSections.rolesInputRadius),
                    borderWidth: hairline(),
                    boxSizing: "border-box",
                    fontSize: pxToRem(settingsSections.rolesInputFontSize),
                    lineHeight: 1,
                    marginTop: pxToRem(settingsSections.rolesInputMarginTop),
                    padding: `${pxToRem(settingsSections.rolesInputPaddingY)} ${pxToRem(settingsSections.rolesInputPaddingX)}`,
                  }}
                  type="text"
                  value={draft.name}
                />
              </div>
              <div>
                <FieldLabel>{t("server.settings.roles.colorLabel")}</FieldLabel>
                <div
                  aria-label={t("server.settings.roles.colorLabel")}
                  className="flex"
                  role="radiogroup"
                  style={{
                    gap: pxToRem(settingsSections.rolesSwatchGap),
                    marginTop: pxToRem(settingsSections.rolesSwatchMarginTop),
                  }}
                >
                  {SERVER_ROLE_TONES.map((tone) => (
                    <button
                      aria-checked={draft.tone === tone}
                      aria-label={t(`server.settings.roles.color.${tone}`)}
                      className={cn(
                        "border p-0",
                        readOnly ? "cursor-not-allowed" : "cursor-pointer",
                      )}
                      data-testid={`settings-role-swatch-${tone}`}
                      disabled={readOnly}
                      key={tone}
                      onClick={() => onDraftChange({ ...draft, tone })}
                      role="radio"
                      style={{
                        background: getRoleToneColor(tone),
                        borderColor: draft.tone === tone ? "hsl(var(--foreground))" : "transparent",
                        borderRadius: pxToRem(settingsSections.rolesSwatchRadius),
                        borderWidth: pxToRem(settingsSections.rolesSwatchBorderWidth),
                        height: pxToRem(settingsSections.rolesSwatchSize),
                        width: pxToRem(settingsSections.rolesSwatchSize),
                      }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: pxToRem(settingsSections.rolesMentionRowMarginTop) }}>
              <ToggleRow
                checked={draft.mentionable}
                description={t("server.settings.roles.mentionable.description")}
                disabled={readOnly}
                disabledReason={guard ? t(guard.descriptionKey) : undefined}
                onChange={(next) => onDraftChange({ ...draft, mentionable: next })}
                testId="settings-role-mentionable"
                title={t("server.settings.roles.mentionable.title")}
              />
            </div>

            <div
              className="flex items-center"
              style={{
                gap: pxToRem(settingsSections.rolesPresetsGap),
                marginTop: pxToRem(settingsSections.rolesPresetsMarginTop),
              }}
            >
              <span
                className="shrink-0 font-semibold uppercase text-[hsl(var(--text-muted))]"
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(SERVER_METRICS.settings.sectionLabelFontSize),
                  letterSpacing: `${SERVER_METRICS.settings.sectionLabelLetterSpacing}em`,
                  lineHeight: 1,
                }}
              >
                {t("server.settings.roles.presetsLabel")}
              </span>
              <div className="flex" style={{ gap: pxToRem(settingsSections.rolesPresetChipsGap) }}>
                {SERVER_ROLE_PRESETS.filter((preset) => isOwner || preset !== "admin").map(
                  (preset) => (
                    <PresetChip
                      active={activePreset === preset}
                      disabled={readOnly}
                      key={preset}
                      label={t(`server.settings.roles.preset.${preset}`)}
                      onClick={() =>
                        onDraftChange({
                          ...draft,
                          permissions: applyRolePreset(draft.permissions, preset),
                        })
                      }
                      preset={preset}
                    />
                  ),
                )}
              </div>
            </div>
          </div>

          {SERVER_PERMISSION_GROUPS.filter((group) =>
            group.rows.some((row) => isOwner || !row.ownerOnly),
          ).map((group) => (
            <PermissionGroupCard
              group={group}
              isOwner={isOwner}
              key={group.id}
              onToggle={(key: WorkspacePermissionKey, next: boolean) =>
                onDraftChange({
                  ...draft,
                  permissions: togglePermission(draft.permissions, key, next),
                })
              }
              onToggleAll={(next) =>
                onDraftChange({
                  ...draft,
                  permissions: setPermissionGroupSelection(draft.permissions, group.id, next, {
                    includeOwnerOnly: isOwner,
                  }),
                })
              }
              permissions={draft.permissions}
              readOnly={readOnly}
            />
          ))}

          {isDraft ? (
            <div
              className="flex flex-wrap items-center border bg-[hsl(var(--surface-card))]"
              data-testid="settings-role-draft-bar"
              style={{
                borderColor: `hsl(var(--primary)/${settingsSections.rolesDraftBarBorderAlpha})`,
                borderRadius: pxToRem(settingsSections.rolesDraftBarRadius),
                borderWidth: hairline(),
                gap: pxToRem(settingsSections.rolesDraftBarGap),
                padding: `${pxToRem(settingsSections.rolesDraftBarPaddingY)} ${pxToRem(settingsSections.rolesDraftBarPaddingX)}`,
              }}
            >
              <span
                className={cn(
                  "flex-1 text-pretty",
                  draftReady ? "text-[hsl(var(--text-secondary))]" : "text-[hsl(var(--warning))]",
                )}
                data-testid="settings-role-draft-note"
                style={{
                  fontSize: pxToRem(settingsSections.rolesDraftNoteFontSize),
                  lineHeight: 1.45,
                  minWidth: pxToRem(settingsSections.rolesDraftNoteMinWidth),
                }}
              >
                {draftReady
                  ? t("server.settings.roles.draft.summary", { count: permissionCount })
                  : t("server.settings.roles.draft.hint")}
              </span>
              <button
                className="shrink-0 cursor-pointer whitespace-nowrap border bg-transparent font-semibold text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))]"
                data-testid="settings-role-draft-cancel"
                onClick={onCancelDraft}
                style={{
                  borderColor: "hsl(var(--border))",
                  borderRadius: pxToRem(settingsSections.rolesDraftCancelRadius),
                  borderWidth: hairline(),
                  fontSize: pxToRem(settingsSections.rolesDraftCancelFontSize),
                  height: pxToRem(settingsSections.rolesDraftCancelHeight),
                  lineHeight: 1,
                  paddingInline: pxToRem(settingsSections.rolesDraftCancelPaddingX),
                }}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                aria-disabled={!draftReady || submitting}
                className={cn(
                  "shrink-0 whitespace-nowrap border-0 font-semibold transition-[filter]",
                  draftReady && !submitting
                    ? "cursor-pointer bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-110"
                    : "cursor-not-allowed bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-muted))]",
                )}
                data-testid="settings-role-draft-submit"
                onClick={() => {
                  if (!draftReady || submitting) {
                    return;
                  }

                  onSubmitDraft();
                }}
                style={{
                  borderRadius: pxToRem(settingsSections.rolesDraftSubmitRadius),
                  boxShadow:
                    draftReady && !submitting ? "0 12px 26px -18px hsl(var(--primary))" : "none",
                  fontSize: pxToRem(settingsSections.rolesDraftCancelFontSize),
                  height: pxToRem(settingsSections.rolesDraftSubmitHeight),
                  lineHeight: 1,
                  paddingInline: pxToRem(settingsSections.rolesDraftSubmitPaddingX),
                }}
                type="button"
              >
                {t("server.settings.roles.createRole")}
              </button>
            </div>
          ) : null}

          {!isDraft && isOwner && selectedRole ? (
            <div
              className="flex items-center border"
              data-testid="settings-role-delete-card"
              style={{
                background: `hsl(var(--danger)/${settingsSections.rolesDeleteCardBackgroundAlpha})`,
                borderColor: `hsl(var(--danger)/${settingsSections.rolesDeleteCardBorderAlpha})`,
                borderRadius: pxToRem(settingsSections.rolesDeleteCardRadius),
                borderWidth: hairline(),
                gap: pxToRem(settingsSections.rolesDeleteCardGap),
                padding: `${pxToRem(settingsSections.rolesDeleteCardPaddingY)} ${pxToRem(settingsSections.rolesDeleteCardPaddingX)}`,
              }}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="font-semibold text-[hsl(var(--danger))]"
                  style={{
                    fontSize: pxToRem(settingsSections.rolesDeleteTitleFontSize),
                    lineHeight: 1.2,
                  }}
                >
                  {t("server.settings.roles.delete.title")}
                </div>
                <div
                  className="text-[hsl(var(--text-muted))]"
                  style={{
                    fontSize: pxToRem(settingsSections.rolesDeleteDescriptionFontSize),
                    lineHeight: 1.4,
                    marginTop: pxToRem(settingsSections.rolesDeleteDescriptionMarginTop),
                  }}
                >
                  {canDeleteRole(selectedRole, isOwner)
                    ? t("server.settings.roles.delete.description")
                    : t("server.settings.roles.delete.protected")}
                </div>
              </div>
              <span
                className="shrink-0 font-semibold text-[hsl(var(--danger))]"
                style={{
                  background: `hsl(var(--danger)/${settingsSections.rolesOwnerChipBackgroundAlpha})`,
                  borderRadius: pxToRem(settingsSections.rolesNewChipRadius),
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(settingsSections.rolesNewChipFontSize),
                  lineHeight: 1,
                  padding: `${pxToRem(settingsSections.rolesNewChipPaddingY)} ${pxToRem(settingsSections.rolesNewChipPaddingX)}`,
                }}
              >
                {t("server.settings.ownerOnly")}
              </span>
              <button
                aria-disabled={!canDeleteRole(selectedRole, isOwner) || undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap border bg-transparent font-semibold text-[hsl(var(--danger))] transition-colors",
                  canDeleteRole(selectedRole, isOwner)
                    ? "cursor-pointer hover:bg-[hsl(var(--danger)/0.14)]"
                    : "cursor-not-allowed opacity-60",
                )}
                data-testid="settings-role-delete"
                onClick={() => {
                  if (!canDeleteRole(selectedRole, isOwner)) {
                    return;
                  }

                  onDeleteRole();
                }}
                style={{
                  borderColor: "hsl(var(--danger)/0.4)",
                  borderRadius: pxToRem(settingsSections.rolesDeleteButtonRadius),
                  borderWidth: hairline(),
                  fontSize: pxToRem(settingsSections.rolesDeleteButtonFontSize),
                  height: pxToRem(settingsSections.rolesDeleteButtonHeight),
                  lineHeight: 1,
                  paddingInline: pxToRem(settingsSections.rolesDeleteButtonPaddingX),
                }}
                type="button"
              >
                {t("server.settings.roles.delete.action")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RoleDot({ role, size }: { role: WorkspaceRole; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{
        background: getRoleToneColor(roleToneFor(role)),
        height: pxToRem(size),
        width: pxToRem(size),
      }}
    />
  );
}

function roleToneFor(role: WorkspaceRole): ServerRoleTone {
  return toRoleDraft(role).tone;
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      className="block font-semibold uppercase text-[hsl(var(--text-muted))]"
      htmlFor={htmlFor}
      style={{
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(SERVER_METRICS.settings.sectionLabelFontSize),
        letterSpacing: `${SERVER_METRICS.settings.sectionLabelLetterSpacing}em`,
        lineHeight: 1,
      }}
    >
      {children}
    </label>
  );
}

function PresetChip({
  active,
  disabled,
  label,
  onClick,
  preset,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  preset: ServerRolePresetId;
}) {
  const { settingsSections } = SERVER_METRICS;

  return (
    <button
      aria-pressed={active}
      className={cn(
        "whitespace-nowrap border font-semibold transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--text-secondary))]",
      )}
      data-testid={`settings-role-preset-${preset}`}
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active ? "hsl(var(--primary)/0.16)" : "hsl(var(--surface-card))",
        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)",
        borderRadius: pxToRem(settingsSections.rolesPresetChipRadius),
        borderWidth: hairline(),
        fontSize: pxToRem(settingsSections.rolesPresetChipFontSize),
        lineHeight: 1,
        padding: `${pxToRem(settingsSections.rolesPresetChipPaddingY)} ${pxToRem(settingsSections.rolesPresetChipPaddingX)}`,
      }}
      type="button"
    >
      {label}
    </button>
  );
}

/** Taslak satırının kimliği; hiçbir rol kimliği bu değeri alamaz. */
const DRAFT_KEY = "__draft__";

type RoleEditingState = {
  draft: ServerRoleDraft;
  key: string;
  /** `Vazgeç`in döneceği rol (SPEC §8.5). Taslak dışında kullanılmaz. */
  restoreKey?: string | undefined;
};

/** Kabuğun ortak sözleşmesi (`section-props.ts`, Ş11); rol yazmaları kendi uçlarına gider. */
export function RolesSection({ detail, permissions }: ServerSettingsSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const serverId = detail.server.id;
  const isOwner = detail.server.isOwner;
  const roles = useMemo(() => sortRolesForSettings(detail.roles), [detail.roles]);
  /**
   * Düzenlenen şeyin **kimliği** durumda tutuluyor: rolün kimliği ya da taslak işareti.
   * `null` = "hiçbir şeye dokunulmadı, listenin ilkini göster".
   *
   * Seçili rol listeden düşerse (silindi, başka bir istemci değiştirdi) kimlik artık
   * eşleşmez ve panel **render sırasında** ilk role döner. Aynı işi bir `useEffect` +
   * `setState` çiftiyle yapmak fazladan bir render turu ve React'in "cascading render"
   * uyarısı demekti; düşen bir rol için düzeltilecek bir durum yok, türetilecek bir görüntü var.
   */
  const [editing, setEditing] = useState<RoleEditingState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const isDraft = editing?.key === DRAFT_KEY;
  const selectedRole = isDraft
    ? null
    : (roles.find((role) => role.id === editing?.key) ?? roles[0] ?? null);
  const selection: ServerRoleSelection = isDraft
    ? { kind: "draft" }
    : selectedRole
      ? { kind: "role", roleId: selectedRole.id }
      : { kind: "empty" };
  const draft =
    editing && (isDraft || editing.key === selectedRole?.id)
      ? editing.draft
      : selectedRole
        ? toRoleDraft(selectedRole)
        : createRoleDraft();

  const roleMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const role of roles) {
      counts[role.id] = countRoleMembers(role, detail.members, detail.server.memberCount);
    }

    return counts;
  }, [detail.members, detail.server.memberCount, roles]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.roles(serverId) });
  }, [queryClient, serverId]);

  const updateRoleMutation = useMutation({
    scope: { id: `server-role-update:${serverId}` },
    onMutate: () => setSaveError(false),
    onError: () => {
      setSaveError(true);
      setEditing(null);
    },
    mutationFn: (input: {
      patch: Parameters<typeof updateWorkspaceRoleRequest>[2];
      roleId: string;
    }) => updateWorkspaceRoleRequest(serverId, input.roleId, input.patch),
    onSettled: invalidate,
  });

  const createRoleMutation = useMutation({
    onMutate: () => setSaveError(false),
    onError: () => setSaveError(true),
    mutationFn: (input: ServerRoleDraft) =>
      createWorkspaceRoleRequest(serverId, {
        color: roleToneToColor(input.tone),
        mentionable: input.mentionable,
        name: input.name.trim(),
        permissions: [...input.permissions],
      }),
    onSuccess: (role) => {
      setEditing({ draft: toRoleDraft(role), key: role.id });
    },
    onSettled: invalidate,
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => deleteWorkspaceRoleRequest(serverId, roleId),
    onSuccess: () => {
      setConfirmDelete(false);
      // Kimlik bırakılır; silinen rol listeden düşünce panel kendiliğinden ilk role döner.
      setEditing(null);
    },
    onSettled: invalidate,
  });

  /**
   * `MANAGE_ROLES` yoksa bölüm **hiç** çizilmez (00 §5) — §8.4'ün `MANAGE_CHANNELS` kapısıyla
   * aynı kural. Kaplama zaten yalnız yönetici/sahibe açılıyor; bu, yetkisi daraltılmış bir
   * yönetici rolünün rol paneline düşmemesi için.
   */
  const canManageRoles = viewerCan(permissions, "MANAGE_ROLES");
  const readOnly = !canManageRoles || (selectedRole ? isProtectedRole(selectedRole) : false);
  const guard = selectedRole ? getRoleGuardCopy(selectedRole) : null;

  /** Onay penceresi yığına girer; `Esc` yalnız onu kapatır, altındaki ayarları değil (K11). */
  useLayerStack({
    id: "server-settings-role-delete",
    kind: "modal",
    onClose: () => {
      if (!deleteRoleMutation.isPending) setConfirmDelete(false);
    },
    open: confirmDelete,
  });

  const handleDraftChange = useCallback(
    (next: ServerRoleDraft) => {
      setEditing((current) => ({
        draft: next,
        key: current?.key ?? selectedRole?.id ?? DRAFT_KEY,
        restoreKey: current?.restoreKey,
      }));

      if (isDraft || !selectedRole || isProtectedRole(selectedRole)) {
        return;
      }

      // Ad `onBlur`'da yazılır; renk, etiketlenebilirlik ve yetkiler anında. Her tuş vuruşunda
      // `PATCH` atmak, 32 karakterlik bir ad için 32 istek demekti.
      const patch: Parameters<typeof updateWorkspaceRoleRequest>[2] = {};

      if (next.tone !== draft.tone) {
        patch.color = roleToneToColor(next.tone);
      }

      if (next.mentionable !== draft.mentionable) {
        patch.mentionable = next.mentionable;
      }

      if (next.permissions !== draft.permissions) {
        patch.permissions = [...next.permissions];
      }

      if (Object.keys(patch).length > 0) {
        updateRoleMutation.mutate({ patch, roleId: selectedRole.id });
      }
    },
    [draft, isDraft, selectedRole, updateRoleMutation],
  );

  const handleNameCommit = useCallback(() => {
    if (isDraft || !selectedRole || isProtectedRole(selectedRole)) {
      return;
    }

    const name = draft.name.trim();

    if (!name || name === selectedRole.name) {
      return;
    }

    updateRoleMutation.mutate({ patch: { name }, roleId: selectedRole.id });
  }, [draft.name, isDraft, selectedRole, updateRoleMutation]);

  if (!canManageRoles) {
    return null;
  }

  return (
    <>
      {saveError ? (
        <p role="alert" className="mb-4 text-sm text-[hsl(var(--danger))]">
          {t("server.settings.members.error")}
        </p>
      ) : null}
      <RolesSectionView
        draft={draft}
        guard={guard}
        isOwner={isOwner}
        onCancelDraft={() => {
          const previous = roles.find((role) => role.id === editing?.restoreKey);
          setEditing(previous ? { draft: toRoleDraft(previous), key: previous.id } : null);
        }}
        onDeleteRole={() => {
          deleteRoleMutation.reset();
          setConfirmDelete(true);
        }}
        onDraftChange={handleDraftChange}
        onNameCommit={handleNameCommit}
        onSelectRole={(roleId) => {
          const role = roles.find((entry) => entry.id === roleId);

          if (!role) {
            return;
          }

          setEditing({ draft: toRoleDraft(role), key: role.id });
        }}
        onStartDraft={() => {
          setEditing({
            draft: createRoleDraft(),
            key: DRAFT_KEY,
            restoreKey: selectedRole?.id,
          });
        }}
        onSubmitDraft={() => {
          if (!createRoleMutation.isPending) createRoleMutation.mutate(draft);
        }}
        readOnly={readOnly}
        roleMemberCounts={roleMemberCounts}
        roles={roles}
        selection={selection}
        submitting={createRoleMutation.isPending}
      />

      <Modal
        onClose={() => {
          if (!deleteRoleMutation.isPending) setConfirmDelete(false);
        }}
        open={confirmDelete}
        title={t("server.settings.roles.delete.confirmTitle", { name: selectedRole?.name ?? "" })}
        description={t("server.settings.roles.delete.description")}
      >
        {deleteRoleMutation.isError ? (
          <p role="alert" className="mb-4 text-sm text-[hsl(var(--danger))]">
            {t("server.settings.members.error")}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="h-11 rounded-2xl"
            disabled={deleteRoleMutation.isPending}
            onClick={() => setConfirmDelete(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11 rounded-2xl border border-[hsl(var(--danger)/0.32)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)]"
            disabled={deleteRoleMutation.isPending || !selectedRole}
            onClick={() => {
              if (selectedRole) {
                deleteRoleMutation.mutate(selectedRole.id);
              }
            }}
            type="button"
            variant="outline"
          >
            {t("server.settings.roles.delete.action")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default RolesSection;
