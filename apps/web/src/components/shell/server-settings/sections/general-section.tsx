"use client";

import React, { useId, useRef, useState } from "react";

import type { ServerIconTone } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { ServerIconSwatches } from "@/components/servers/shared/server-icon-swatches";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import {
  SettingsCard,
  SettingsCardLabel,
  SettingsFieldHeader,
  SettingsGlyph,
} from "@/components/shell/server-settings/settings-primitives";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import { SERVER_METRICS, hairline, pxToRem } from "@/lib/servers/metrics";
import { getServerIconToneColor, resolveServerIconTone } from "@/lib/servers/server-icon-tone";
import {
  isServerAbbreviation,
  resolveServerAbbreviation,
} from "@/lib/servers/server-icon-presentation";
import { resolveServerVisibilityBadge } from "@/lib/servers/server-settings-model";
import { useUploadThing } from "@/lib/uploadthing";

/**
 * SPEC-SUNUCU §8.1 — `Genel`.
 *
 * İki kolon (`1fr / 286`): solda ikon kartı + form kartı, sağda canlı `Sunucu profili`
 * önizlemesi. Önizleme taslaktan beslenir, kaydedilmiş değerden değil: kullanıcı adı
 * yazarken kartın da değişmesi bu bölümün tek anlamı.
 *
 * **Sapma (rapora geçti):** SPEC ad sayacını `0/48` yazar, sözleşme (`UpdateServerFieldsSchema`)
 * `2–64` der. Sözleşme otoritedir; sayaç `0/64` yazar. 48'de kesilen bir alan, uçtan geçen bir
 * adı reddederdi.
 */

const NAME_MAX_LENGTH = 64;
const SHORT_NAME_MAX_LENGTH = 3;
const DESCRIPTION_MAX_LENGTH = 160;
const DESCRIPTION_ROWS = 3;

const UPLOAD_PATH = "M12 16V4m0 0 4 4m-4-4-4 4M4 20h16";
const TRASH_PATH = "M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13";

const { settings, settingsSections } = SERVER_METRICS;

export function GeneralSection({
  counts,
  detail,
  draft,
  flush,
  patch,
  patchDeferred,
  uploadthingEnabled,
}: ServerSettingsSectionProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const nameId = useId();
  const shortNameId = useId();
  const descriptionId = useId();

  const { isUploading, startUpload } = useUploadThing("serverIconUploader", {
    onClientUploadComplete: (result) => {
      const nextUrl = result[0]?.serverData?.url ?? result[0]?.url ?? null;
      setUploadError(null);
      patch({ iconUrl: nextUrl });
    },
    onUploadError: (error) => {
      setUploadError(error.message);
    },
  });

  const shortNameView = resolveServerAbbreviation(draft.name, draft.shortName || null);
  const shortNameValid = isServerAbbreviation(draft.shortName);
  const tone = resolveServerIconTone(draft.iconColor, shortNameView);
  const badge = resolveServerVisibilityBadge(draft);

  return (
    <div
      className="grid items-start [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_var(--server-settings-preview-width)]"
      data-testid="server-settings-general"
      style={{
        ["--server-settings-preview-width" as string]: pxToRem(
          settingsSections.generalPreviewColumnWidth,
        ),
        gap: pxToRem(settingsSections.generalGridGap),
      }}
    >
      <div className="flex min-w-0 flex-col" style={{ gap: pxToRem(settings.cardGap) }}>
        {/* Sunucu ikonu */}
        <SettingsCard testId="server-settings-icon-card">
          <SettingsCardLabel>{t("server.settings.general.iconLabel")}</SettingsCardLabel>
          <div
            className="flex items-center"
            style={{
              gap: pxToRem(settingsSections.generalIconRowGap),
              marginTop: pxToRem(settingsSections.generalIconRowMarginTop),
            }}
          >
            <span
              aria-hidden="true"
              className="grid flex-none place-items-center overflow-hidden font-semibold text-[hsl(var(--primary-foreground))]"
              style={{
                background: draft.iconUrl
                  ? `center / cover no-repeat url(${JSON.stringify(draft.iconUrl)})`
                  : getServerIconToneColor(tone),
                borderRadius: pxToRem(settingsSections.generalIconRadius),
                boxShadow: `${pxToRem(settingsSections.generalIconShadow.x)} ${pxToRem(
                  settingsSections.generalIconShadow.y,
                )} ${pxToRem(settingsSections.generalIconShadow.blur)} ${pxToRem(
                  settingsSections.generalIconShadow.spread,
                )} hsl(var(--shadow-color))`,
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(settingsSections.generalIconFontSize),
                height: pxToRem(settingsSections.generalIconSize),
                lineHeight: 1,
                width: pxToRem(settingsSections.generalIconSize),
              }}
            >
              {draft.iconUrl ? "" : shortNameView}
            </span>

            <div className="min-w-0 flex-1">
              <ServerIconSwatches
                onSelect={(next: ServerIconTone) => patch({ iconColor: next })}
                shortName={shortNameView}
                testId="server-settings-swatches"
                toneLabel={(item) => t(`server.create.icon.tone.${item}`)}
                value={draft.iconColor}
                variant="settings"
              />

              <div
                className="flex flex-wrap"
                style={{
                  gap: pxToRem(settingsSections.generalUploadRowGap),
                  marginTop: pxToRem(settingsSections.generalUploadRowMarginTop),
                }}
              >
                <input
                  aria-invalid={!shortNameValid}
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];

                    if (!file || !uploadthingEnabled) {
                      return;
                    }

                    setUploadError(null);
                    await startUpload([file]);
                  }}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="flex items-center border font-semibold whitespace-nowrap transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid="server-settings-icon-upload"
                  disabled={isUploading || !uploadthingEnabled}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: "hsl(var(--surface-base))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: pxToRem(settingsSections.generalUploadRadius),
                    borderWidth: hairline(),
                    color: "hsl(var(--text-secondary))",
                    cursor: isUploading || !uploadthingEnabled ? "not-allowed" : "pointer",
                    fontSize: pxToRem(settingsSections.generalUploadFontSize),
                    gap: pxToRem(settingsSections.generalUploadGap),
                    height: pxToRem(settingsSections.generalUploadHeight),
                    lineHeight: 1,
                    paddingInline: pxToRem(settingsSections.generalUploadPaddingX),
                  }}
                  type="button"
                >
                  <SettingsGlyph
                    path={UPLOAD_PATH}
                    size={settingsSections.generalUploadGlyphSize}
                  />
                  {isUploading ? t("common.saving") : t("server.settings.general.iconUpload")}
                </button>
                <button
                  className="flex items-center border font-semibold whitespace-nowrap transition hover:bg-[hsl(var(--danger)/0.1)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid="server-settings-icon-remove"
                  onClick={() => patch({ iconColor: null, iconUrl: null })}
                  style={{
                    background: "transparent",
                    borderColor: `hsl(var(--danger)/${settingsSections.generalRemoveBorderAlpha})`,
                    borderRadius: pxToRem(settingsSections.generalUploadRadius),
                    borderWidth: hairline(),
                    color: "hsl(var(--danger))",
                    fontSize: pxToRem(settingsSections.generalUploadFontSize),
                    gap: pxToRem(settingsSections.generalUploadGap),
                    height: pxToRem(settingsSections.generalUploadHeight),
                    lineHeight: 1,
                    paddingInline: pxToRem(settingsSections.generalUploadPaddingX),
                  }}
                  type="button"
                >
                  <SettingsGlyph path={TRASH_PATH} size={settingsSections.generalUploadGlyphSize} />
                  {t("server.settings.general.iconRemove")}
                </button>
              </div>

              <p
                className="text-pretty text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(settingsSections.generalIconHintFontSize),
                  lineHeight: settingsSections.generalNoteLineHeight,
                  marginTop: pxToRem(settingsSections.generalIconHintMarginTop),
                }}
              >
                {t("server.settings.general.iconHint")}
              </p>

              {uploadError ? (
                <p
                  className="text-[hsl(var(--danger))]"
                  role="alert"
                  style={{
                    fontSize: pxToRem(settingsSections.generalIconHintFontSize),
                    lineHeight: settingsSections.generalNoteLineHeight,
                    marginTop: pxToRem(settingsSections.generalIconHintMarginTop),
                  }}
                >
                  {uploadError}
                </p>
              ) : null}
              {!uploadthingEnabled ? (
                <p
                  className="text-[hsl(var(--warning))]"
                  style={{
                    fontSize: pxToRem(settingsSections.generalIconHintFontSize),
                    lineHeight: settingsSections.generalNoteLineHeight,
                    marginTop: pxToRem(settingsSections.generalIconHintMarginTop),
                  }}
                >
                  {t("workspace.modal.serverIconUploadsDisabled")}
                </p>
              ) : null}
            </div>
          </div>
        </SettingsCard>

        {/* Ad · kısaltma · açıklama */}
        <SettingsCard testId="server-settings-identity-card">
          <div className="flex flex-col" style={{ gap: pxToRem(settings.cardGap) }}>
            <div
              className="grid [grid-template-columns:minmax(0,1fr)_var(--server-settings-short-name-width)]"
              style={{
                ["--server-settings-short-name-width" as string]: pxToRem(
                  settingsSections.generalFormShortNameColumnWidth,
                ),
                gap: pxToRem(settingsSections.generalFormGridGap),
              }}
            >
              <div className="min-w-0">
                <SettingsFieldHeader
                  htmlFor={nameId}
                  label={t("server.settings.general.nameLabel")}
                  length={draft.name.length}
                  max={NAME_MAX_LENGTH}
                />
                <input
                  className="w-full border font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
                  data-testid="server-settings-name-input"
                  id={nameId}
                  maxLength={NAME_MAX_LENGTH}
                  onBlur={flush}
                  onChange={(event) => patchDeferred({ name: event.target.value })}
                  placeholder={t("server.settings.general.namePlaceholder")}
                  style={inputStyle()}
                  value={draft.name}
                />
              </div>
              <div className="min-w-0">
                <SettingsFieldHeader
                  htmlFor={shortNameId}
                  label={t("server.settings.general.shortNameLabel")}
                  length={draft.shortName.length}
                  max={SHORT_NAME_MAX_LENGTH}
                />
                <input
                  className="w-full border text-center font-semibold text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
                  data-testid="server-settings-short-name-input"
                  id={shortNameId}
                  maxLength={SHORT_NAME_MAX_LENGTH}
                  onBlur={flush}
                  onChange={(event) =>
                    patchDeferred({
                      shortName: Array.from(event.target.value.toLocaleUpperCase("tr-TR"))
                        .slice(0, SHORT_NAME_MAX_LENGTH)
                        .join(""),
                    })
                  }
                  placeholder={t("server.settings.general.shortNamePlaceholder")}
                  style={{
                    ...inputStyle(),
                    borderColor: shortNameValid ? "hsl(var(--border))" : "hsl(var(--danger))",
                    fontFamily: DISPLAY_FONT,
                    letterSpacing: `${settingsSections.generalShortNameLetterSpacing}em`,
                  }}
                  value={draft.shortName}
                />
              </div>
            </div>

            <div>
              <SettingsFieldHeader
                htmlFor={descriptionId}
                label={t("server.settings.general.descriptionLabel")}
                length={draft.description.length}
                max={DESCRIPTION_MAX_LENGTH}
              />
              <textarea
                className="w-full resize-none border font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
                data-testid="server-settings-description-input"
                id={descriptionId}
                maxLength={DESCRIPTION_MAX_LENGTH}
                onBlur={flush}
                onChange={(event) => patchDeferred({ description: event.target.value })}
                placeholder={t("server.settings.general.descriptionPlaceholder")}
                rows={DESCRIPTION_ROWS}
                style={{
                  ...inputStyle(),
                  fontSize: pxToRem(settingsSections.generalTextareaFontSize),
                  lineHeight: settingsSections.generalTextareaLineHeight,
                }}
                value={draft.description}
              />
            </div>
          </div>
        </SettingsCard>
      </div>

      {/* Sunucu profili önizlemesi */}
      <SettingsCard testId="server-settings-profile-preview">
        <SettingsCardLabel>{t("server.settings.general.previewLabel")}</SettingsCardLabel>
        <div
          className="flex items-center"
          style={{
            gap: pxToRem(settingsSections.generalProfileIconRowGap),
            marginTop: pxToRem(settingsSections.generalIconRowMarginTop),
          }}
        >
          <span
            aria-hidden="true"
            className="grid flex-none place-items-center overflow-hidden font-semibold text-[hsl(var(--primary-foreground))]"
            style={{
              background: draft.iconUrl
                ? `center / cover no-repeat url(${JSON.stringify(draft.iconUrl)})`
                : getServerIconToneColor(tone),
              borderRadius: pxToRem(settingsSections.generalProfileIconRadius),
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(settingsSections.generalProfileIconFontSize),
              height: pxToRem(settingsSections.generalProfileIconSize),
              lineHeight: 1,
              width: pxToRem(settingsSections.generalProfileIconSize),
            }}
          >
            {draft.iconUrl ? "" : shortNameView}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-semibold text-[hsl(var(--foreground))]"
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(settingsSections.generalProfileNameFontSize),
                letterSpacing: DISPLAY_TRACKING,
                lineHeight: settingsSections.visibilityTitleLineHeight,
              }}
            >
              {draft.name}
            </div>
            <div
              className="flex items-center"
              style={{
                gap: pxToRem(settingsSections.generalProfileBadgeGap),
                marginTop: pxToRem(settingsSections.generalProfileBadgeMarginTop),
              }}
            >
              <VisibilityChip
                badge={badge}
                label={t(`server.settings.visibility.badge.${badge}`)}
              />
              <span
                className="font-medium text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(settings.serverMetaFontSize),
                  lineHeight: 1,
                }}
              >
                {t("server.settings.memberCount", { count: detail.server.memberCount })}
              </span>
            </div>
          </div>
        </div>

        <p
          className="text-pretty text-[hsl(var(--text-secondary))]"
          style={{
            fontSize: pxToRem(settingsSections.generalProfileDescriptionFontSize),
            lineHeight: settingsSections.generalProfileDescriptionLineHeight,
            marginTop: pxToRem(settingsSections.generalProfileDescriptionMarginTop),
          }}
        >
          {draft.description || t("server.settings.general.descriptionEmpty")}
        </p>

        <div
          className="flex flex-col"
          style={{
            borderTop: `${hairline()} solid hsl(var(--border)/${settingsSections.generalStatsBorderTopAlpha})`,
            gap: pxToRem(settingsSections.generalStatsGap),
            marginTop: pxToRem(settingsSections.generalStatsMarginTop),
            paddingTop: pxToRem(settingsSections.generalStatsPaddingTop),
          }}
        >
          <PreviewStat
            label={t("server.settings.general.statMembers")}
            value={String(detail.server.memberCount)}
          />
          <PreviewStat
            label={t("server.settings.general.statChannels")}
            value={String(counts.channels ?? 0)}
          />
          <PreviewStat
            label={t("server.settings.general.statRoles")}
            value={String(counts.roles ?? 0)}
          />
          <PreviewStat
            label={t("server.settings.general.statVisibility")}
            value={t(`server.settings.visibility.badge.${badge}`)}
          />
        </div>

        <p
          className="text-pretty text-[hsl(var(--text-muted))]"
          style={{
            background: `hsl(var(--surface-soft)/${settingsSections.generalNoteBackgroundAlpha})`,
            borderRadius: pxToRem(settingsSections.generalNoteRadius),
            fontSize: pxToRem(settingsSections.generalNoteFontSize),
            lineHeight: settingsSections.generalNoteLineHeight,
            marginTop: pxToRem(settingsSections.generalNoteMarginTop),
            padding: `${pxToRem(settingsSections.generalNotePaddingY)} ${pxToRem(
              settingsSections.generalNotePaddingX,
            )}`,
          }}
        >
          {t("server.settings.general.previewNote")}
        </p>
      </SettingsCard>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "hsl(var(--surface-base))",
    borderColor: "hsl(var(--border))",
    borderRadius: pxToRem(settingsSections.generalInputRadius),
    borderWidth: hairline(),
    fontSize: pxToRem(settingsSections.generalInputFontSize),
    lineHeight: 1,
    marginTop: pxToRem(settingsSections.generalInputMarginTop),
    paddingBlock: pxToRem(settingsSections.generalInputPaddingY),
    paddingInline: pxToRem(settingsSections.generalInputPaddingX),
  };
}

/**
 * Görünürlük rozeti — sol kolondaki sunucu kartıyla **aynı** kutu. `Özel` nötr, `Herkese açık`
 * success, `Keşfet'te` primary (`Sunucu.dc.html:2521`).
 */
export function VisibilityChip({
  badge,
  label,
}: {
  badge: "discoverable" | "private" | "public";
  label: string;
}) {
  const tone = badge === "discoverable" ? "primary" : badge === "public" ? "success" : null;

  return (
    <span
      className="flex-none font-semibold whitespace-nowrap"
      data-badge={badge}
      data-testid="server-settings-visibility-badge"
      style={{
        background: tone
          ? `hsl(var(--${tone})/${settingsSections.visibilityIconBackgroundAlpha})`
          : "hsl(var(--surface-tertiary))",
        borderRadius: pxToRem(settings.visibilityChipRadius),
        color: tone ? `hsl(var(--${tone}))` : "hsl(var(--text-muted))",
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(settings.visibilityChipFontSize),
        lineHeight: 1,
        padding: `${pxToRem(settings.visibilityChipPaddingY)} ${pxToRem(
          settings.visibilityChipPaddingX,
        )}`,
      }}
    >
      {label}
    </span>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: pxToRem(settingsSections.generalStatRowGap),
        paddingBlock: pxToRem(settingsSections.generalStatRowPaddingY),
      }}
    >
      <span
        className="min-w-0 flex-1 truncate font-medium text-[hsl(var(--text-muted))]"
        style={{ fontSize: pxToRem(settingsSections.generalStatLabelFontSize), lineHeight: 1 }}
      >
        {label}
      </span>
      <span
        className="flex-none font-semibold text-[hsl(var(--foreground))]"
        style={{ fontSize: pxToRem(settingsSections.generalStatValueFontSize), lineHeight: 1 }}
      >
        {value}
      </span>
    </div>
  );
}

export default GeneralSection;
