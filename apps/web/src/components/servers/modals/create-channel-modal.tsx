"use client";

import React, { useId, useRef } from "react";
import { Check, EyeOff, Globe, Hash, Lock, Users, Volume2 } from "lucide-react";
import type {
  WorkspaceChannel,
  WorkspaceChannelPermissionPreset,
  WorkspaceServerDetail,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToRem } from "@/lib/servers/metrics";
import { channelFooterSummary, isCounterWarning } from "@/lib/servers/modal-form-model";
import { cn } from "@/lib/utils";
import { ChannelAdvancedSettingsFields } from "./channel-advanced-settings";
import type { ChannelAdvancedSettings } from "./channel-form-model";
import {
  ServerModalShell,
  serverModalFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "./server-modal-shell";

/**
 * Kanal oluştur / düzenle — SPEC-SUNUCU §6.2, 660 px, dört adım.
 *
 * Adımlar bir sihirbaz **değil**: dördü de tek kaydırılan gövdede, numaralı başlıklarla alt
 * alta durur (referansın kendi düzeni). İleri/geri düğmesi yok, çünkü tasarımda yok.
 *
 * **Numaralar sıradan türetilir.** Referans hep dört adım çiziyor, ama 00 §5 `Erişim` adımını
 * yalnız yönetici/sahibe render ettiriyor. Üye rolünde sabit numaraları korumak ekranda
 * `1 · 2 · 4` bırakırdı; numara bir sıra göstergesi olduğu için görünen adımlardan sayılıyor.
 *
 * `edit` kipi korunuyor: aynı pencere düzenlemeyi de yapar (mağazadaki `channelModal.mode`).
 * Düzenlerken kanal türü kartları kilitli — mevcut bir kanalın türü değiştirilemez ve uç zaten
 * kabul etmez.
 */

type ChannelWizardStep = "kind" | "basics" | "access" | "advanced";

const CHANNEL_NAME_MAX = 48;
const CHANNEL_TOPIC_MAX = 120;
const CHANNEL_TEXT_ICON_PATH = "M10 3 8 21M16 3l-2 18M3.5 8.5h17M3 15.5h17";
const CHANNEL_VOICE_ICON_PATH =
  "M11 5 6 9H3v6h3l5 4z M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13";

/** Referans HTML: özel yol, 19×19 çizim, 1.9 stroke. */
export function ChannelModalHeaderIcon({ type }: { readonly type: WorkspaceChannel["type"] }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToRem(SERVER_METRICS.modal.iconBoxGlyphSize)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={pxToRem(SERVER_METRICS.modal.iconBoxGlyphSize)}
    >
      <path d={type === "VOICE" ? CHANNEL_VOICE_ICON_PATH : CHANNEL_TEXT_ICON_PATH} />
    </svg>
  );
}

export function channelModalBodyStyle(): React.CSSProperties {
  const { channelWizard } = SERVER_METRICS;
  const height = `min(${pxToRem(channelWizard.bodyHeight)}, calc(100dvh - ${pxToRem(
    channelWizard.bodyViewportReserve,
  )}))`;

  return {
    flex: `0 1 ${height}`,
    height,
  };
}

const ACCESS_PRESETS = [
  { icon: Globe, id: "PUBLIC" },
  { icon: Lock, id: "LOCKED_VISIBLE" },
  { icon: EyeOff, id: "PRIVATE" },
  { icon: Users, id: "ROLE_GATED" },
] as const satisfies readonly { icon: typeof Globe; id: WorkspaceChannelPermissionPreset }[];

export type CreateChannelModalProps = {
  advancedSettings: ChannelAdvancedSettings;
  allowedRoleIds: readonly string[];
  canSubmit: boolean;
  categoryId: string | null;
  error?: boolean;
  mode: "create" | "edit";
  name: string;
  onAdvancedSettingsChange: (settings: ChannelAdvancedSettings) => void;
  onAllowedRoleIdsChange: (roleIds: string[]) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onPresetChange: (preset: WorkspaceChannelPermissionPreset) => void;
  onSubmit: () => void;
  onTopicChange: (topic: string) => void;
  onTypeChange: (type: WorkspaceChannel["type"]) => void;
  open: boolean;
  pending: boolean;
  permissionsEditable: boolean;
  preset: WorkspaceChannelPermissionPreset;
  serverDetail: WorkspaceServerDetail | null;
  topic: string;
  type: WorkspaceChannel["type"];
};

export function CreateChannelModal(props: CreateChannelModalProps) {
  const {
    advancedSettings,
    allowedRoleIds,
    canSubmit,
    categoryId,
    error = false,
    mode,
    name,
    onAdvancedSettingsChange,
    onAllowedRoleIdsChange,
    onCategoryChange,
    onClose,
    onNameChange,
    onPresetChange,
    onSubmit,
    onTopicChange,
    onTypeChange,
    open,
    pending,
    permissionsEditable,
    preset,
    serverDetail,
    topic,
    type,
  } = props;
  const { t } = useI18n();
  const { modal } = SERVER_METRICS;
  const nameRef = useRef<HTMLInputElement | null>(null);
  const isVoice = type === "VOICE";
  const trimmedName = name.trim();
  const submitEnabled = canSubmit && !pending;

  const categoryName = categoryId
    ? (serverDetail?.categories.find((category) => category.id === categoryId)?.name ??
      t("server.modal.channel.noCategory"))
    : t("server.modal.channel.noCategory");

  // Özet üç durumlu: ad boş · yazı kanalı (adı korunmuş) · ses kanalı. Karar saf modelde,
  // cümle burada — sözlük tek yerde kalır (00 §7).
  const summary = channelFooterSummary(name, type);
  const footerNote =
    summary.kind === "empty"
      ? t("server.modal.channel.summaryEmpty")
      : summary.kind === "voice"
        ? t("server.modal.channel.summaryVoice", { category: categoryName })
        : t("server.modal.channel.summaryText", {
            category: categoryName,
            name: summary.name,
          });

  return (
    <ServerModalShell
      bodyStyle={channelModalBodyStyle()}
      closeLabel={t("common.close")}
      description={t("server.modal.channel.subtitle", {
        kind: isVoice ? t("server.modal.channel.kindVoice") : t("server.modal.channel.kindText"),
        server: serverDetail?.server.name ?? "",
      })}
      footer={
        <div className="flex flex-wrap items-center" style={serverModalFooterStyle()}>
          <span
            className={cn(
              "flex-1",
              trimmedName ? "text-[hsl(var(--text-secondary))]" : "text-[hsl(var(--warning))]",
            )}
            data-testid="channel-footer-summary"
            style={{
              fontSize: pxToRem(modal.footerNoteFontSize),
              lineHeight: modal.footerNoteLineHeight,
              minWidth: pxToRem(modal.footerNoteMinWidth),
            }}
          >
            {footerNote}
          </span>
          <button
            className="flex-none cursor-pointer border font-semibold transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onClose}
            style={serverModalSecondaryButtonStyle()}
            type="button"
          >
            {t("common.cancel")}
          </button>
          <button
            aria-disabled={!submitEnabled}
            className="flex-none border-0 font-semibold transition hover:brightness-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="channel-submit-button"
            form="channel-form"
            style={serverModalPrimaryButtonStyle(submitEnabled)}
            type="submit"
          >
            {mode === "edit" ? t("server.modal.channel.save") : t("server.modal.channel.submit")}
          </button>
        </div>
      }
      icon={<ChannelModalHeaderIcon type={type} />}
      initialFocusRef={nameRef}
      onClose={onClose}
      open={open}
      scrollBody
      title={
        mode === "edit" ? t("server.modal.channel.editTitle") : t("server.modal.channel.title")
      }
      tone={isVoice ? "success" : "primary"}
      width="channel"
    >
      <CreateChannelModalView
        advancedSettings={advancedSettings}
        allowedRoleIds={allowedRoleIds}
        categoryId={categoryId}
        error={error}
        nameRef={nameRef}
        name={name}
        onAdvancedSettingsChange={onAdvancedSettingsChange}
        onAllowedRoleIdsChange={onAllowedRoleIdsChange}
        onCategoryChange={onCategoryChange}
        onNameChange={onNameChange}
        onPresetChange={onPresetChange}
        onSubmit={onSubmit}
        onTopicChange={onTopicChange}
        onTypeChange={onTypeChange}
        permissionsEditable={permissionsEditable}
        preset={preset}
        readOnlyType={mode === "edit"}
        serverDetail={serverDetail}
        submitEnabled={submitEnabled}
        topic={topic}
        type={type}
      />
    </ServerModalShell>
  );
}

function StepHeading({
  badge,
  first = false,
  label,
  number,
}: {
  badge?: string;
  first?: boolean;
  label: string;
  number: number;
}) {
  const { channelWizard, modal } = SERVER_METRICS;

  return (
    <div
      className="flex items-center"
      style={{
        gap: pxToRem(channelWizard.stepGap),
        marginTop: first ? undefined : pxToRem(channelWizard.stepMarginTop),
      }}
    >
      <span
        aria-hidden="true"
        className="grid flex-none place-items-center font-semibold text-[hsl(var(--primary))]"
        style={{
          background: `hsl(var(--primary)/${channelWizard.stepNumberBackgroundAlpha})`,
          borderRadius: pxToRem(channelWizard.stepNumberRadius),
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(channelWizard.stepNumberFontSize),
          height: pxToRem(channelWizard.stepNumberSize),
          lineHeight: 1,
          width: pxToRem(channelWizard.stepNumberSize),
        }}
      >
        {number}
      </span>
      <span
        className="font-semibold uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(channelWizard.stepLabelFontSize),
          letterSpacing: `${channelWizard.stepLabelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      {badge ? (
        <span
          className="font-semibold text-[hsl(var(--danger))]"
          style={{
            background: `hsl(var(--danger)/${channelWizard.adminChipBackgroundAlpha})`,
            borderRadius: pxToRem(modal.badgeRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.badgeFontSize),
            lineHeight: 1,
            padding: `${pxToRem(modal.badgePaddingY)} ${pxToRem(modal.badgePaddingX)}`,
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function ChannelKindCard({
  disabled,
  kind,
  onSelect,
  selected,
}: {
  disabled: boolean;
  kind: WorkspaceChannel["type"];
  onSelect: () => void;
  selected: boolean;
}) {
  const { t } = useI18n();
  const { channelWizard } = SERVER_METRICS;
  const isVoice = kind === "VOICE";
  const Icon = isVoice ? Volume2 : Hash;
  const tone = isVoice ? "success" : "primary";

  return (
    <button
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex items-center text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      data-testid={`channel-kind-${kind.toLowerCase()}`}
      onClick={() => {
        if (disabled) {
          return;
        }

        onSelect();
      }}
      role="radio"
      style={{
        background: selected
          ? `hsl(var(--primary)/${channelWizard.kindCardSelectedBackgroundAlpha})`
          : "hsl(var(--surface-base))",
        border: `${pxToRem(channelWizard.kindCardBorderWidth)} solid ${
          selected ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)"
        }`,
        borderRadius: pxToRem(channelWizard.kindCardRadius),
        gap: pxToRem(channelWizard.kindCardGap),
        padding: `${pxToRem(channelWizard.kindCardPaddingY)} ${pxToRem(channelWizard.kindCardPaddingX)}`,
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="grid flex-none place-items-center"
        style={{
          background: selected ? `hsl(var(--${tone})/0.16)` : "hsl(var(--surface-soft))",
          borderRadius: pxToRem(channelWizard.kindIconRadius),
          color: selected ? `hsl(var(--${tone}))` : "hsl(var(--text-muted))",
          height: pxToRem(channelWizard.kindIconSize),
          width: pxToRem(channelWizard.kindIconSize),
        }}
      >
        <Icon
          style={{
            height: pxToRem(channelWizard.kindIconGlyphSize),
            width: pxToRem(channelWizard.kindIconGlyphSize),
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block font-semibold text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(channelWizard.kindTitleFontSize),
            lineHeight: channelWizard.kindTitleLineHeight,
          }}
        >
          {t(isVoice ? "server.modal.channel.kind.voice" : "server.modal.channel.kind.text")}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(channelWizard.kindDescriptionFontSize),
            lineHeight: channelWizard.kindDescriptionLineHeight,
            marginTop: pxToRem(channelWizard.kindDescriptionMarginTop),
          }}
        >
          {t(
            isVoice
              ? "server.modal.channel.kind.voiceDescription"
              : "server.modal.channel.kind.textDescription",
          )}
        </span>
      </span>
      {selected ? (
        <span
          aria-hidden="true"
          className="grid flex-none place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          style={{
            height: pxToRem(channelWizard.kindCheckSize),
            width: pxToRem(channelWizard.kindCheckSize),
          }}
        >
          <Check
            strokeWidth={3}
            style={{
              height: pxToRem(channelWizard.kindCheckGlyphSize),
              width: pxToRem(channelWizard.kindCheckGlyphSize),
            }}
          />
        </span>
      ) : null}
    </button>
  );
}

const ChannelNameField = React.forwardRef<
  HTMLInputElement,
  { isVoice: boolean; name: string; onChange: (name: string) => void }
>(function ChannelNameField({ isVoice, name, onChange }, ref) {
  const { t } = useI18n();
  const { channelWizard, modal } = SERVER_METRICS;
  const inputId = useId();
  const hintId = useId();
  const warn = isCounterWarning(name.length, CHANNEL_NAME_MAX);

  return (
    <>
      <div
        className="flex items-center"
        style={{
          gap: pxToRem(modal.labelGap),
          marginTop: pxToRem(channelWizard.nameLabelMarginTop),
        }}
      >
        <label
          className="font-semibold uppercase text-[hsl(var(--text-muted))]"
          htmlFor={inputId}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.labelFontSize),
            letterSpacing: `${modal.labelLetterSpacing}em`,
            lineHeight: 1,
          }}
        >
          {t("server.modal.channel.nameLabel")}
        </label>
        <span
          className="font-semibold text-[hsl(var(--danger))]"
          style={{
            background: `hsl(var(--danger)/${modal.requiredBadgeBackgroundAlpha})`,
            borderRadius: pxToRem(modal.badgeRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.badgeFontSize),
            lineHeight: 1,
            padding: `${pxToRem(modal.badgePaddingY)} ${pxToRem(modal.badgePaddingX)}`,
          }}
        >
          {t("server.field.required")}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "ml-auto flex-none font-semibold",
            warn ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-muted))]",
          )}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.counterFontSize),
            lineHeight: 1,
          }}
        >
          {`${name.length}/${CHANNEL_NAME_MAX}`}
        </span>
      </div>

      <div
        className="flex items-center bg-[hsl(var(--surface-base))]"
        style={{
          border: `${hairline()} solid ${
            name.trim() ? "hsl(var(--primary)/0.5)" : "hsl(var(--border))"
          }`,
          borderRadius: pxToRem(channelWizard.nameRowRadius),
          gap: pxToRem(channelWizard.nameRowGap),
          marginTop: pxToRem(channelWizard.nameRowMarginTop),
          paddingInline: pxToRem(channelWizard.nameRowPaddingX),
        }}
      >
        {isVoice ? null : (
          <span
            aria-hidden="true"
            className="flex-none font-semibold text-[hsl(var(--text-muted))]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(channelWizard.namePrefixFontSize),
              lineHeight: 1,
            }}
          >
            #
          </span>
        )}
        <input
          aria-describedby={hintId}
          className="min-w-0 flex-1 border-0 bg-transparent font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
          id={inputId}
          maxLength={CHANNEL_NAME_MAX}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t(
            isVoice
              ? "server.modal.channel.namePlaceholderVoice"
              : "server.modal.channel.namePlaceholderText",
          )}
          ref={ref}
          style={{
            fontSize: pxToRem(channelWizard.nameInputFontSize),
            lineHeight: 1,
            paddingBlock: pxToRem(channelWizard.nameInputPaddingY),
          }}
          value={name}
        />
      </div>
      <div
        className="text-[hsl(var(--text-muted))]"
        id={hintId}
        style={{
          fontSize: pxToRem(modal.hintFontSize),
          lineHeight: modal.hintLineHeight,
          marginTop: pxToRem(modal.hintMarginTop),
        }}
      >
        {t(isVoice ? "server.modal.channel.nameHintVoice" : "server.modal.channel.nameHintText")}
      </div>
    </>
  );
});

function ChannelTopicField({
  onChange,
  topic,
}: {
  onChange: (topic: string) => void;
  topic: string;
}) {
  const { t } = useI18n();
  const { channelWizard, modal } = SERVER_METRICS;
  const inputId = useId();
  const hintId = useId();

  return (
    <>
      <div
        className="flex items-center"
        style={{
          gap: pxToRem(modal.labelGap),
          marginTop: pxToRem(channelWizard.fieldMarginTop),
        }}
      >
        <label
          className="font-semibold uppercase text-[hsl(var(--text-muted))]"
          htmlFor={inputId}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.labelFontSize),
            letterSpacing: `${modal.labelLetterSpacing}em`,
            lineHeight: 1,
          }}
        >
          {t("server.modal.channel.topicLabel")}
        </label>
        <span
          className="bg-[hsl(var(--surface-tertiary))] font-semibold text-[hsl(var(--text-muted))]"
          style={{
            borderRadius: pxToRem(modal.badgeRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.badgeFontSize),
            lineHeight: 1,
            padding: `${pxToRem(modal.badgePaddingY)} ${pxToRem(modal.badgePaddingX)}`,
          }}
        >
          {t("server.field.optional")}
        </span>
        <span
          aria-hidden="true"
          className="ml-auto flex-none font-semibold text-[hsl(var(--text-muted))]"
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.counterFontSize),
            lineHeight: 1,
          }}
        >
          {`${topic.length}/${CHANNEL_TOPIC_MAX}`}
        </span>
      </div>
      <input
        aria-describedby={hintId}
        className="box-border w-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
        id={inputId}
        maxLength={CHANNEL_TOPIC_MAX}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("server.modal.channel.topicPlaceholder")}
        style={{
          borderRadius: pxToRem(modal.inputRadius),
          borderWidth: hairline(),
          fontSize: pxToRem(channelWizard.topicInputFontSize),
          lineHeight: 1,
          marginTop: pxToRem(modal.inputMarginTop),
          padding: `${pxToRem(channelWizard.topicInputPaddingY)} ${pxToRem(modal.inputPaddingX)}`,
        }}
        value={topic}
      />
      <div
        className="text-[hsl(var(--text-muted))]"
        id={hintId}
        style={{
          fontSize: pxToRem(modal.hintFontSize),
          lineHeight: modal.hintLineHeight,
          marginTop: pxToRem(modal.hintMarginTop),
        }}
      >
        {t("server.modal.channel.topicHint")}
      </div>
    </>
  );
}

function CategoryChip({
  label,
  onSelect,
  selected,
}: {
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  const { channelWizard } = SERVER_METRICS;

  return (
    <button
      aria-checked={selected}
      className={cn(
        "cursor-pointer border font-semibold uppercase transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        selected
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]"
          : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))]",
      )}
      onClick={onSelect}
      role="radio"
      style={{
        borderRadius: pxToRem(channelWizard.categoryChipRadius),
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(channelWizard.categoryChipFontSize),
        letterSpacing: `${channelWizard.categoryChipLetterSpacing}em`,
        lineHeight: 1,
        padding: `${pxToRem(channelWizard.categoryChipPaddingY)} ${pxToRem(channelWizard.categoryChipPaddingX)}`,
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function AccessOptionRow({
  icon: Icon,
  onSelect,
  preset,
  selected,
}: {
  icon: typeof Globe;
  onSelect: () => void;
  preset: WorkspaceChannelPermissionPreset;
  selected: boolean;
}) {
  const { t } = useI18n();
  const { channelWizard } = SERVER_METRICS;

  return (
    <button
      aria-checked={selected}
      className="flex cursor-pointer items-center text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid={`channel-access-${preset}`}
      onClick={onSelect}
      role="radio"
      style={{
        background: selected
          ? `hsl(var(--primary)/${channelWizard.kindCardSelectedBackgroundAlpha})`
          : "hsl(var(--surface-base))",
        border: `${pxToRem(channelWizard.accessRowBorderWidth)} solid ${
          selected ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)"
        }`,
        borderRadius: pxToRem(channelWizard.accessRowRadius),
        gap: pxToRem(channelWizard.accessRowGap),
        padding: `${pxToRem(channelWizard.accessRowPaddingY)} ${pxToRem(channelWizard.accessRowPaddingX)}`,
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="grid flex-none place-items-center"
        style={{
          background: selected ? "hsl(var(--primary)/0.16)" : "hsl(var(--surface-soft))",
          borderRadius: pxToRem(channelWizard.accessIconRadius),
          color: selected ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
          height: pxToRem(channelWizard.accessIconSize),
          width: pxToRem(channelWizard.accessIconSize),
        }}
      >
        <Icon
          style={{
            height: pxToRem(channelWizard.accessIconGlyphSize),
            width: pxToRem(channelWizard.accessIconGlyphSize),
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block font-semibold text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(channelWizard.accessTitleFontSize),
            lineHeight: channelWizard.accessTitleLineHeight,
          }}
        >
          {t(`server.modal.channel.access.${preset}`)}
        </span>
        <span
          className="block text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(channelWizard.accessDescriptionFontSize),
            lineHeight: channelWizard.accessDescriptionLineHeight,
            marginTop: pxToRem(channelWizard.accessDescriptionMarginTop),
          }}
        >
          {t(`server.modal.channel.access.${preset}.description`)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="grid flex-none place-items-center rounded-full"
        style={{
          background: selected ? "hsl(var(--primary))" : "transparent",
          border: `${pxToRem(channelWizard.accessRadioBorderWidth)} solid ${
            selected ? "hsl(var(--primary))" : "hsl(var(--border))"
          }`,
          color: "hsl(var(--primary-foreground))",
          height: pxToRem(channelWizard.accessRadioSize),
          width: pxToRem(channelWizard.accessRadioSize),
        }}
      >
        {selected ? (
          <Check
            strokeWidth={3}
            style={{
              height: pxToRem(channelWizard.accessRadioCheckGlyphSize),
              width: pxToRem(channelWizard.accessRadioCheckGlyphSize),
            }}
          />
        ) : null}
      </span>
    </button>
  );
}

function AllowedRolesRow({
  allowedRoleIds,
  onChange,
  serverDetail,
}: {
  allowedRoleIds: readonly string[];
  onChange: (roleIds: string[]) => void;
  serverDetail: WorkspaceServerDetail | null;
}) {
  const { t } = useI18n();
  const { channelWizard } = SERVER_METRICS;
  const roles = (serverDetail?.roles ?? []).filter((role) => !role.isDefault && !role.managed);

  return (
    <div
      className="flex flex-wrap items-center"
      data-testid="channel-allowed-roles"
      style={{
        background: `hsl(var(--surface-soft)/${channelWizard.roleRowBackgroundAlpha})`,
        borderRadius: pxToRem(channelWizard.roleRowRadius),
        gap: pxToRem(channelWizard.roleRowGap),
        marginTop: pxToRem(channelWizard.roleRowMarginTop),
        padding: `${pxToRem(channelWizard.roleRowPaddingY)} ${pxToRem(channelWizard.roleRowPaddingX)}`,
      }}
    >
      <span
        className="flex-none font-semibold text-[hsl(var(--text-secondary))]"
        style={{ fontSize: pxToRem(channelWizard.roleLabelFontSize), lineHeight: 1 }}
      >
        {t("server.modal.channel.rolesLabel")}
      </span>
      {roles.length === 0 ? (
        <span
          className="text-[hsl(var(--text-muted))]"
          style={{ fontSize: pxToRem(channelWizard.roleLabelFontSize), lineHeight: 1 }}
        >
          {t("server.modal.channel.noRoles")}
        </span>
      ) : null}
      {roles.map((role) => {
        const selected = allowedRoleIds.includes(role.id);

        return (
          <button
            aria-pressed={selected}
            className={cn(
              "cursor-pointer font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
              selected
                ? "bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
                : "bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))]",
            )}
            key={role.id}
            onClick={() =>
              onChange(
                selected
                  ? allowedRoleIds.filter((roleId) => roleId !== role.id)
                  : [...allowedRoleIds, role.id],
              )
            }
            style={{
              borderRadius: pxToRem(channelWizard.roleChipRadius),
              fontSize: pxToRem(channelWizard.roleChipFontSize),
              lineHeight: 1,
              padding: `${pxToRem(channelWizard.roleChipPaddingY)} ${pxToRem(channelWizard.roleChipPaddingX)}`,
            }}
            type="button"
          >
            {role.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pencerenin dört adımlık gövdesi — kabuk olmadan. `ui/modal` hidrasyondan önce `null` döner,
 * bu yüzden adımların metinleri, numaraları ve yetki kapısı ancak kabuktan ayrı render
 * edilerek denetlenebiliyor (Ş9'un `ChannelNotificationsModalView` deseniyle aynı).
 */
export type CreateChannelModalViewProps = {
  advancedSettings: ChannelAdvancedSettings;
  allowedRoleIds: readonly string[];
  categoryId: string | null;
  error?: boolean | undefined;
  name: string;
  nameRef?: React.RefObject<HTMLInputElement | null> | undefined;
  onAdvancedSettingsChange: (settings: ChannelAdvancedSettings) => void;
  onAllowedRoleIdsChange: (roleIds: string[]) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onNameChange: (name: string) => void;
  onPresetChange: (preset: WorkspaceChannelPermissionPreset) => void;
  onSubmit: () => void;
  onTopicChange: (topic: string) => void;
  onTypeChange: (type: WorkspaceChannel["type"]) => void;
  permissionsEditable: boolean;
  preset: WorkspaceChannelPermissionPreset;
  /** `edit` kipinde kanal türü değiştirilemez; kartlar kilitli çizilir. */
  readOnlyType?: boolean | undefined;
  serverDetail: WorkspaceServerDetail | null;
  submitEnabled?: boolean | undefined;
  topic: string;
  type: WorkspaceChannel["type"];
};

export function CreateChannelModalView({
  advancedSettings,
  allowedRoleIds,
  categoryId,
  error = false,
  name,
  nameRef,
  onAdvancedSettingsChange,
  onAllowedRoleIdsChange,
  onCategoryChange,
  onNameChange,
  onPresetChange,
  onSubmit,
  onTopicChange,
  onTypeChange,
  permissionsEditable,
  preset,
  readOnlyType = false,
  serverDetail,
  submitEnabled = true,
  topic,
  type,
}: CreateChannelModalViewProps) {
  const { t } = useI18n();
  const { channelWizard, modal } = SERVER_METRICS;
  const isVoice = type === "VOICE";

  // Adım numaraları görünen adımlardan sayılır; `Erişim` gizlendiğinde 4 numara 3 olur.
  const steps: readonly ChannelWizardStep[] = permissionsEditable
    ? ["kind", "basics", "access", "advanced"]
    : ["kind", "basics", "advanced"];
  const stepNumber = (id: ChannelWizardStep) => steps.indexOf(id) + 1;

  return (
    <form
      data-testid="channel-form"
      id="channel-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (submitEnabled) {
          onSubmit();
        }
      }}
    >
      <StepHeading label={t("server.modal.channel.step.kind")} number={stepNumber("kind")} first />
      <div
        className="grid grid-cols-2"
        style={{
          gap: pxToRem(channelWizard.kindGridGap),
          marginTop: pxToRem(channelWizard.kindGridMarginTop),
        }}
      >
        {(["TEXT", "VOICE"] as const).map((kind) => (
          <ChannelKindCard
            disabled={readOnlyType}
            key={kind}
            kind={kind}
            onSelect={() => onTypeChange(kind)}
            selected={type === kind}
          />
        ))}
      </div>

      <StepHeading label={t("server.modal.channel.step.basics")} number={stepNumber("basics")} />

      <ChannelNameField isVoice={isVoice} name={name} onChange={onNameChange} ref={nameRef} />

      <ChannelTopicField onChange={onTopicChange} topic={topic} />

      <div
        className="font-semibold uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(modal.labelFontSize),
          letterSpacing: `${modal.labelLetterSpacing}em`,
          lineHeight: 1,
          marginTop: pxToRem(channelWizard.fieldMarginTop),
        }}
      >
        {t("server.modal.channel.categoryLabel")}
      </div>
      <div
        aria-label={t("server.modal.channel.categoryLabel")}
        className="flex flex-wrap"
        role="radiogroup"
        style={{
          gap: pxToRem(channelWizard.categoryChipsGap),
          marginTop: pxToRem(channelWizard.categoryChipsMarginTop),
        }}
      >
        <CategoryChip
          label={t("server.modal.channel.noCategory")}
          onSelect={() => onCategoryChange(null)}
          selected={categoryId === null}
        />
        {(serverDetail?.categories ?? []).map((category) => (
          <CategoryChip
            key={category.id}
            label={category.name}
            onSelect={() => onCategoryChange(category.id)}
            selected={categoryId === category.id}
          />
        ))}
      </div>

      {permissionsEditable ? (
        <>
          <StepHeading
            badge={t("server.modal.channel.adminOnly")}
            label={t("server.modal.channel.step.access")}
            number={stepNumber("access")}
          />
          <div
            aria-label={t("server.modal.channel.step.access")}
            className="flex flex-col"
            role="radiogroup"
            style={{
              gap: pxToRem(channelWizard.accessListGap),
              marginTop: pxToRem(channelWizard.accessListMarginTop),
            }}
          >
            {ACCESS_PRESETS.map((option) => (
              <AccessOptionRow
                icon={option.icon}
                key={option.id}
                onSelect={() => onPresetChange(option.id)}
                preset={option.id}
                selected={preset === option.id}
              />
            ))}
          </div>
          {preset === "ROLE_GATED" ? (
            <AllowedRolesRow
              allowedRoleIds={allowedRoleIds}
              onChange={onAllowedRoleIdsChange}
              serverDetail={serverDetail}
            />
          ) : null}
        </>
      ) : null}

      <StepHeading
        label={
          isVoice
            ? t("server.modal.channel.step.voiceSettings")
            : t("server.modal.channel.step.advanced")
        }
        number={stepNumber("advanced")}
      />
      <ChannelAdvancedSettingsFields
        availableRtcRegions={serverDetail?.server.availableRtcRegions ?? []}
        channelType={type}
        onChange={onAdvancedSettingsChange}
        value={advancedSettings}
      />

      {error ? (
        <p
          className="text-pretty font-semibold text-[hsl(var(--danger))]"
          data-testid="channel-error"
          role="alert"
          style={{
            fontSize: pxToRem(modal.hintFontSize),
            lineHeight: modal.hintLineHeight,
            marginTop: pxToRem(channelWizard.fieldMarginTop),
          }}
        >
          {t("server.modal.channel.error")}
        </p>
      ) : null}
    </form>
  );
}
