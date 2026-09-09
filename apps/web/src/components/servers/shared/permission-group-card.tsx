"use client";

import React, { useId, useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import type { WorkspacePermissionKey } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import {
  type ServerPermissionGroup,
  countGroupSelected,
  getPermissionGroupSelection,
} from "@/lib/servers/permission-groups";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { cn } from "@/lib/utils";
import { ServerToggleSwitch } from "./toggle-row";
import { DISPLAY_FONT } from "./typography";

/**
 * Yetki grubu kartı — SPEC-SUNUCU §8.5.
 *
 * Başlıkta `seçili/toplam` durur ve **tamamı seçiliyse** primary olur; sayı burada
 * hesaplanmaz, `countGroupSelected` ile sözleşmeden okunur (Ş0). İki ayrı sayaç iki ayrı gerçek
 * üretirdi — `HAZIR AYARLAR` çipleri de aynı fonksiyonu okuyor.
 *
 * `yalnızca sahip` çipli satır sahip **dışına hiç render edilmez** (00 §5): pasifleştirmek
 * yetmez, çünkü kapalı bir anahtar da yetkinin varlığını duyurur.
 *
 * `alwaysOn` satır (`Geçmişi oku`) kapatılamaz. Üründe karşılığı olan bir bit yok ve
 * `permission-groups.ts` bunun gerekçesini uzun uzun yazıyor; kart yalnız o kararı çizer:
 * anahtar açık, `aria-disabled`, nedeni yanında.
 */

export type PermissionGroupCardProps = {
  group: ServerPermissionGroup;
  /** Sahip değilse `ownerOnly` satırlar çizilmez. */
  isOwner: boolean;
  onToggle: (key: WorkspacePermissionKey, next: boolean) => void;
  onToggleAll?: ((next: boolean) => void) | undefined;
  permissions: readonly WorkspacePermissionKey[];
  /** Rol düzenlenemiyorsa (yönetilen rol) anahtarlar kapalı görünür. */
  readOnly?: boolean | undefined;
};

export function PermissionGroupCard({
  group,
  isOwner,
  onToggle,
  onToggleAll,
  permissions,
  readOnly = false,
}: PermissionGroupCardProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const headingId = useId();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(true);
  const visibleRows = group.rows.filter((row) => (row.ownerOnly ? isOwner : true));
  const selected = new Set(permissions);
  const visibility = { includeOwnerOnly: isOwner } as const;
  const counts = countGroupSelected(group.id, permissions, visibility);
  const groupSelection = getPermissionGroupSelection(group.id, permissions, visibility);
  const complete = counts.selected === counts.total;
  const groupName = t(`server.settings.roles.group.${group.id}`);

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden border bg-[hsl(var(--surface-card))]"
      data-testid={`permission-group-${group.id}`}
      style={{
        borderColor: `hsl(var(--border)/${settingsSections.rolesGroupBorderAlpha})`,
        borderRadius: pxToRem(settingsSections.rolesGroupRadius),
        borderWidth: hairline(),
      }}
    >
      <div
        className="flex items-center"
        style={{
          borderBottom: expanded
            ? `${hairline()} solid hsl(var(--border)/${settingsSections.rolesGroupHeaderBorderBottomAlpha})`
            : undefined,
          gap: pxToRem(settingsSections.rolesGroupHeaderGap),
          padding: `${pxToRem(settingsSections.rolesGroupHeaderPaddingY)} ${pxToRem(settingsSections.rolesGroupHeaderPaddingX)}`,
        }}
      >
        <button
          aria-controls={bodyId}
          aria-expanded={expanded}
          aria-label={t(
            expanded
              ? "server.settings.roles.group.collapse"
              : "server.settings.roles.group.expand",
            { group: groupName },
          )}
          className="grid shrink-0 cursor-pointer place-items-center text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid={`permission-group-${group.id}-collapse`}
          onClick={() => setExpanded((current) => !current)}
          style={{
            borderRadius: pxToRem(settingsSections.rolesGroupControlRadius),
            height: pxToRem(settingsSections.rolesGroupControlSize),
            width: pxToRem(settingsSections.rolesGroupControlSize),
          }}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            style={{
              height: pxToEm(
                settingsSections.rolesGroupControlIconSize,
                settingsSections.rolesGroupTitleFontSize,
              ),
              transform: expanded ? undefined : "rotate(-90deg)",
              width: pxToEm(
                settingsSections.rolesGroupControlIconSize,
                settingsSections.rolesGroupTitleFontSize,
              ),
            }}
          />
        </button>
        <span
          className="font-semibold text-[hsl(var(--foreground))]"
          id={headingId}
          style={{ fontSize: pxToRem(settingsSections.rolesGroupTitleFontSize), lineHeight: 1 }}
        >
          {groupName}
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 font-semibold",
            complete ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--text-muted))]",
          )}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(settingsSections.rolesGroupCountFontSize),
            lineHeight: 1,
          }}
        >
          {t("server.settings.roles.groupCount", {
            selected: counts.selected,
            total: counts.total,
          })}
        </span>
        <button
          aria-checked={groupSelection.state === "mixed" ? "mixed" : groupSelection.state === "all"}
          aria-label={t("server.settings.roles.group.toggleAll", { group: groupName })}
          className={cn(
            "grid shrink-0 place-items-center border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
            readOnly || !onToggleAll ? "cursor-not-allowed opacity-55" : "cursor-pointer",
          )}
          data-selection={groupSelection.state}
          data-testid={`permission-group-${group.id}-toggle-all`}
          disabled={readOnly || !onToggleAll}
          onClick={() => onToggleAll?.(groupSelection.state !== "all")}
          role="checkbox"
          style={{
            background:
              groupSelection.state === "none"
                ? "hsl(var(--surface-base))"
                : "hsl(var(--primary)/0.14)",
            borderColor:
              groupSelection.state === "none" ? "hsl(var(--border))" : "hsl(var(--primary)/0.5)",
            borderRadius: pxToRem(settingsSections.rolesGroupControlRadius),
            color: "hsl(var(--primary))",
            height: pxToRem(settingsSections.rolesGroupControlSize),
            width: pxToRem(settingsSections.rolesGroupControlSize),
          }}
          type="button"
        >
          {groupSelection.state === "all" ? (
            <Check aria-hidden="true" size={settingsSections.rolesGroupControlIconSize} />
          ) : groupSelection.state === "mixed" ? (
            <Minus aria-hidden="true" size={settingsSections.rolesGroupControlIconSize} />
          ) : null}
        </button>
      </div>

      {expanded ? (
        <div
          className="flex flex-col"
          id={bodyId}
          style={{
            paddingBottom: pxToRem(settingsSections.rolesGroupListPaddingBottom),
            paddingInline: pxToRem(settingsSections.rolesGroupListPaddingX),
            paddingTop: pxToRem(settingsSections.rolesGroupListPaddingTop),
          }}
        >
          {visibleRows.map((row) => {
            const checked = row.alwaysOn ? true : row.key ? selected.has(row.key) : false;
            const locked = row.alwaysOn === true || readOnly;

            return (
              <PermissionRow
                alwaysOnReason={
                  row.alwaysOn ? t("server.settings.roles.permission.alwaysOn") : undefined
                }
                checked={checked}
                key={row.id}
                label={t(`server.settings.roles.permission.${row.id}`)}
                locked={locked}
                onToggle={(next) => {
                  if (locked || !row.key) {
                    return;
                  }

                  onToggle(row.key, next);
                }}
                ownerOnly={row.ownerOnly === true}
                testId={`permission-row-${row.id}`}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

type PermissionRowProps = {
  alwaysOnReason?: string | undefined;
  checked: boolean;
  label: string;
  locked: boolean;
  onToggle: (next: boolean) => void;
  ownerOnly: boolean;
  testId: string;
};

function PermissionRow({
  alwaysOnReason,
  checked,
  label,
  locked,
  onToggle,
  ownerOnly,
  testId,
}: PermissionRowProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const labelId = useId();
  const reasonId = useId();

  return (
    <div
      className="flex items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)]"
      data-testid={testId}
      style={{
        borderRadius: pxToRem(settingsSections.rolesPermissionRowRadius),
        gap: pxToRem(settingsSections.rolesPermissionRowGap),
        padding: pxToRem(settingsSections.rolesPermissionRowPadding),
      }}
    >
      <span
        className="min-w-0 flex-1 font-medium text-[hsl(var(--text-secondary))]"
        id={labelId}
        style={{
          fontSize: pxToRem(settingsSections.rolesPermissionLabelFontSize),
          lineHeight: settingsSections.rolesPermissionLabelLineHeight,
        }}
      >
        {label}
      </span>

      {ownerOnly ? (
        <span
          className="shrink-0 font-semibold text-[hsl(var(--danger))]"
          style={{
            background: `hsl(var(--danger)/${settingsSections.rolesOwnerChipBackgroundAlpha})`,
            borderRadius: pxToRem(settingsSections.rolesOwnerChipRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(settingsSections.rolesOwnerChipFontSize),
            lineHeight: 1,
            padding: `${pxToRem(settingsSections.rolesOwnerChipPaddingY)} ${pxToRem(settingsSections.rolesOwnerChipPaddingX)}`,
          }}
        >
          {t("server.settings.ownerOnly")}
        </span>
      ) : null}

      {alwaysOnReason ? (
        <span className="sr-only" id={reasonId}>
          {alwaysOnReason}
        </span>
      ) : null}

      <ServerToggleSwitch
        ariaLabelledBy={labelId}
        checked={checked}
        describedBy={alwaysOnReason ? reasonId : undefined}
        disabled={locked}
        onChange={onToggle}
        size="compact"
      />
    </div>
  );
}
