"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ServerIconTone } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { CreateServerPreview } from "@/components/servers/modals/create-server-preview";
import {
  ServerModalShell,
  serverModalFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "@/components/servers/modals/server-modal-shell";
import { DiscoveryTagPicker } from "@/components/servers/shared/discovery-tag-picker";
import { OptionChipGroup } from "@/components/servers/shared/option-chip-group";
import { ServerIconSwatches } from "@/components/servers/shared/server-icon-swatches";
import { ToggleRow } from "@/components/servers/shared/toggle-row";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { BugReportDiscardDialog } from "@/components/support/bug-report-overlays";
import {
  CREATE_SERVER_ACCESS_OPTIONS,
  CREATE_SERVER_DELETED_NOTICE_MINUTES,
  CREATE_SERVER_INITIAL_STATE,
  CREATE_SERVER_MESSAGE_LIMITS,
  buildCreateServerBody,
  deriveCreateServerShortName,
  isCounterWarning,
  shouldConfirmCreateServerClose,
  isCreateServerNameValid,
  isCreateServerShortNameValid,
  isDiscoveryTagBlockActive,
  resolveCreateServerShortNameView,
  selectCreateServerFooterNote,
  type CreateServerAccess,
  type CreateServerFormState,
} from "@/lib/servers/create-server-form";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  SERVER_SINGLE_COLUMN_ATTRIBUTE,
  buildServerSingleColumnCss,
} from "@/lib/servers/shell-layout";
import { getServerIconToneColor, resolveServerIconTone } from "@/lib/servers/server-icon-tone";
import { useUploadThing } from "@/lib/uploadthing";
import { createServerRequest, workspaceQueryKeys } from "@/lib/workspace/client";

/**
 * SPEC-SUNUCU §7 — "Sunucu oluştur" penceresi (940).
 *
 * Ray'deki `+` düğmesinden açılır ve eski `serverModal` **oluşturma** akışının yerini alır;
 * aynı pencerenin `edit` kipi Ş11'in `Genel` bölümüne taşınana kadar yerinde kalır
 * (`workspace-modals.tsx`).
 *
 * Gövde iki kolon: sol form (esnek, kaydırılır) + sağ önizleme (296, `surface-panel`, sol
 * kenar `border/.5`). `<1024px`'te tek kolona düşer ve önizleme forma **üstten** eklenir
 * (§11) — sıra `order-*` ile değil, ızgaranın satır sırasıyla kurulur ki DOM sırası ile
 * okuma sırası ayrışmasın.
 *
 * Karar veren hiçbir şey burada değil: kısa ad türetmesi, erişim → `isPublic`/`discoverable`
 * çevrimi, medya özeti, ayak notu ve gövde inşası `lib/servers/create-server-form.ts` içinde.
 * Bu dosya çiziyor ve `POST /api/v1/servers`'e gövdeyi veriyor.
 */

const { createServer, modal } = SERVER_METRICS;

/** §11 — tek kolon kırılımı; modül seviyesinde bir kere kurulur. */
const SINGLE_COLUMN_CSS = buildServerSingleColumnCss();

const NAME_MAX_LENGTH = 64;
const SHORT_NAME_MAX_LENGTH = 3;
const DESCRIPTION_MAX_LENGTH = 160;

const LOCK_PATH = "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z";
const GLOBE_PATH =
  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18";
const COMPASS_PATH = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5.5-5.5 2 2-5.5z";
const PLUS_PATH = "M12 5v14M5 12h14";
const UPLOAD_PATH = "M12 16V4m0 0 4 4m-4-4-4 4M4 20h16";
const TRASH_PATH = "M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13";
const CHEVRON_PATH = "m6 9 6 6 6-6";
const CHECK_PATH = "M4 12.5 9 17.5 20 6.5";

const ACCESS_ICON_PATHS: Record<CreateServerAccess, string> = {
  discover: COMPASS_PATH,
  private: LOCK_PATH,
  public: GLOBE_PATH,
};

function Glyph({
  path,
  size,
  strokeWidth = 1.9,
}: {
  path: string;
  size: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(size)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={pxToEm(size)}
    >
      <path d={path} />
    </svg>
  );
}

/** §6 ortak alan başlığı: versal etiket + isteğe bağlı çip + sağda sayaç. */
function FieldHeader({
  badge,
  badgeTone,
  counter,
  counterWarning,
  htmlFor,
  label,
}: {
  badge?: string;
  badgeTone?: "danger" | "muted";
  counter?: string;
  counterWarning?: boolean;
  htmlFor?: string;
  label: string;
}) {
  /**
   * `htmlFor` yoksa bu bir `<label>` değil: `ikon` ve `erişim` başlıkları tek bir girdiyi
   * değil bir grubu adlandırıyor. Hedefsiz `<label>` ekran okuyucuda tıklanabilir görünür
   * ama hiçbir şeye odaklanmaz.
   */
  const Tag = htmlFor ? "label" : "span";

  return (
    <div className="flex items-center" style={{ gap: pxToRem(modal.labelGap) }}>
      <Tag
        className="shrink-0 whitespace-nowrap font-semibold text-[hsl(var(--text-muted))] uppercase"
        htmlFor={htmlFor}
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(modal.labelFontSize),
          letterSpacing: `${modal.labelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {label}
      </Tag>
      {badge ? (
        <span
          className="font-semibold"
          style={{
            background:
              badgeTone === "danger" ? "hsl(var(--danger)/0.14)" : "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(modal.badgeRadius),
            color: badgeTone === "danger" ? "hsl(var(--danger))" : "hsl(var(--text-muted))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.badgeFontSize),
            lineHeight: 1,
            paddingBlock: pxToRem(modal.badgePaddingY),
            paddingInline: pxToRem(modal.badgePaddingX),
          }}
        >
          {badge}
        </span>
      ) : null}
      {counter ? (
        <span
          className="ml-auto flex-none font-semibold"
          style={{
            color: counterWarning ? "hsl(var(--warning))" : "hsl(var(--text-muted))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(modal.counterFontSize),
            lineHeight: 1,
          }}
        >
          {counter}
        </span>
      ) : null}
    </div>
  );
}

function textInputStyle(filled: boolean): React.CSSProperties {
  return {
    background: "hsl(var(--surface-base))",
    borderColor: filled ? "hsl(var(--primary)/0.5)" : "hsl(var(--border))",
    borderRadius: pxToRem(modal.inputRadius),
    borderWidth: hairline(),
    fontSize: pxToRem(modal.inputFontSize),
    marginTop: pxToRem(modal.inputMarginTop),
    paddingBlock: pxToRem(modal.inputPaddingY),
    paddingInline: pxToRem(modal.inputPaddingX),
  };
}

export type CreateServerModalProps = {
  readonly onClose: () => void;
  readonly onNavigate: (href: string) => void;
  readonly open: boolean;
  readonly uploadthingEnabled: boolean;
};

export function CreateServerModal({
  onClose,
  onNavigate,
  open,
  uploadthingEnabled,
}: CreateServerModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [state, setState] = React.useState<CreateServerFormState>(CREATE_SERVER_INITIAL_STATE);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const patch = React.useCallback((next: Partial<CreateServerFormState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

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

  const createMutation = useMutation({
    mutationFn: () => createServerRequest(buildCreateServerBody(state)),
    onSuccess: (result) => {
      const destination = result.channelId
        ? `/channels/${result.serverId}/${result.channelId}`
        : "/channels";
      onClose();
      onNavigate(destination);
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers });
    },
  });

  const shortNameView = resolveCreateServerShortNameView(state.shortName, state.name);
  const iconTone = resolveServerIconTone(state.iconColor, shortNameView);
  const tagsActive = isDiscoveryTagBlockActive(state.access);
  const nameValid = isCreateServerNameValid(state.name);
  const shortNameValid = isCreateServerShortNameValid(state.shortName);
  const submitEnabled = nameValid && shortNameValid && !createMutation.isPending;

  const requestClose = React.useCallback(() => {
    if (discardOpen) {
      setDiscardOpen(false);
      return;
    }

    if (shouldConfirmCreateServerClose(state, isUploading)) {
      setDiscardOpen(true);
      return;
    }

    onClose();
  }, [discardOpen, isUploading, onClose, state]);

  const advancedSummary = t("server.create.advanced.summary", {
    characters: t(`server.create.advanced.messageLimit.option.${state.messageCharacterLimit}`),
    notice: t(`server.create.advanced.deletedNotice.option.${state.deletedMessageNoticeMinutes}`),
  });

  return (
    <>
      <ServerModalShell
        bodyAttributes={{ [SERVER_SINGLE_COLUMN_ATTRIBUTE]: "grid" }}
        bodyClassName="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_var(--create-server-preview-width)] grid-rows-[minmax(0,1fr)]"
        bodyPaddingBottom={0}
        bodyPaddingTop={0}
        bodyPaddingX={0}
        bodyStyle={
          {
            "--create-server-divider": `hsl(var(--border)/${createServer.previewBorderLeftAlpha})`,
            "--create-server-preview-width": pxToRem(createServer.previewColumnWidth),
            "--server-single-column-hairline": hairline(),
          } as React.CSSProperties
        }
        closeLabel={t("common.close")}
        description={t("server.create.description")}
        footer={
          <div className="flex flex-wrap items-center" style={serverModalFooterStyle()}>
            <CreateServerFooterNote error={createMutation.isError} state={state} />
            <button
              className="flex-none border font-semibold whitespace-nowrap transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="create-server-cancel"
              onClick={requestClose}
              style={serverModalSecondaryButtonStyle()}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              aria-disabled={!submitEnabled}
              className="flex-none border-0 font-semibold whitespace-nowrap transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="create-server-submit"
              disabled={!submitEnabled}
              onClick={() => createMutation.mutate()}
              style={serverModalPrimaryButtonStyle(submitEnabled)}
              type="button"
            >
              {createMutation.isPending ? t("common.saving") : t("server.create.submit")}
            </button>
          </div>
        }
        icon={<Glyph path={PLUS_PATH} size={19} strokeWidth={2.4} />}
        initialFocusRef={nameInputRef}
        onClose={requestClose}
        open={open}
        title={t("server.create.title")}
        width="createServer"
      >
        <style>{SINGLE_COLUMN_CSS}</style>
        {/*
        Önizleme kolonu `<1024px`'te forma **üstten** eklenir (§11). Kırılım
        `buildServerSingleColumnCss`'ten geliyor; eşik `SERVER_METRICS.layout.modalSingleColumnBelow`
        ve **görünüm alanı pikseli** — Tailwind'in `lg:`'i `64rem`'dir ve kabuk kökü büyüttüğünde
        kayar. Genişlik CSS değişkeninden geliyor çünkü satır içi `style` medya sorgusu taşıyamaz
        ve 296 px sözlükten okunmak zorunda.
      */}
        <div
          className="order-last min-h-0 min-w-0 border-l border-[color:var(--create-server-divider)]"
          {...{ [SERVER_SINGLE_COLUMN_ATTRIBUTE]: "aside" }}
        >
          <CreateServerPreview state={state} />
        </div>

        <div
          className="flex min-h-0 flex-1 overflow-y-auto min-w-0 flex-col overflow-x-hidden"
          data-testid="create-server-form"
          {...{ [SERVER_SINGLE_COLUMN_ATTRIBUTE]: "main" }}
          style={{
            gap: pxToRem(createServer.formGap),
            paddingBottom: pxToRem(createServer.formPaddingBottom),
            paddingInline: pxToRem(createServer.formPaddingX),
            paddingTop: pxToRem(createServer.formPaddingTop),
          }}
        >
          {/* 1 · Sunucu ikonu */}
          <div>
            <FieldHeader
              badge={t("server.create.optional")}
              label={t("server.create.icon.label")}
            />
            <div
              className="flex items-center"
              style={{
                gap: pxToRem(createServer.iconRowGap),
                marginTop: pxToRem(createServer.iconRowMarginTop),
              }}
            >
              <span
                aria-hidden="true"
                className="grid flex-none place-items-center overflow-hidden font-semibold text-[hsl(var(--primary-foreground))]"
                style={{
                  background: state.iconUrl
                    ? `center / cover no-repeat url(${JSON.stringify(state.iconUrl)})`
                    : getServerIconToneColor(iconTone),
                  borderRadius: pxToRem(createServer.iconRadius),
                  boxShadow: `${pxToRem(createServer.iconShadow.x)} ${pxToRem(
                    createServer.iconShadow.y,
                  )} ${pxToRem(createServer.iconShadow.blur)} ${pxToRem(
                    createServer.iconShadow.spread,
                  )} hsl(var(--shadow-color))`,
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(createServer.iconFontSize),
                  height: pxToRem(createServer.iconSize),
                  lineHeight: 1,
                  width: pxToRem(createServer.iconSize),
                }}
              >
                {state.iconUrl ? "" : shortNameView}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[hsl(var(--text-muted))] [text-wrap:pretty]"
                  style={{
                    fontSize: pxToRem(createServer.iconHelpFontSize),
                    lineHeight: createServer.iconHelpLineHeight,
                  }}
                >
                  {t("server.create.icon.help")}
                </p>

                <ServerIconSwatches
                  onSelect={(tone: ServerIconTone) => patch({ iconColor: tone })}
                  shortName={shortNameView}
                  testId="create-server-swatches"
                  toneLabel={(tone) => t(`server.create.icon.tone.${tone}`)}
                  value={state.iconColor}
                />

                <div
                  className="flex flex-wrap"
                  style={{
                    gap: pxToRem(createServer.uploadRowGap),
                    marginTop: pxToRem(createServer.uploadRowMarginTop),
                  }}
                >
                  <input
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
                    data-testid="create-server-icon-upload"
                    disabled={isUploading || !uploadthingEnabled}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: "hsl(var(--surface-base))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: pxToRem(createServer.uploadRadius),
                      borderWidth: hairline(),
                      color: "hsl(var(--text-secondary))",
                      cursor: isUploading || !uploadthingEnabled ? "not-allowed" : "pointer",
                      fontSize: pxToRem(createServer.uploadFontSize),
                      gap: pxToRem(createServer.uploadGap),
                      height: pxToRem(createServer.uploadHeight),
                      lineHeight: 1,
                      paddingInline: pxToRem(createServer.uploadPaddingX),
                    }}
                    type="button"
                  >
                    <Glyph path={UPLOAD_PATH} size={14} />
                    {isUploading ? t("common.saving") : t("server.create.icon.upload")}
                  </button>
                  <button
                    className="flex items-center border font-semibold whitespace-nowrap transition hover:bg-[hsl(var(--danger)/0.1)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid="create-server-icon-remove"
                    onClick={() => patch({ iconColor: null, iconUrl: null })}
                    style={{
                      background: "transparent",
                      borderColor: `hsl(var(--danger)/${createServer.removeBorderAlpha})`,
                      borderRadius: pxToRem(createServer.uploadRadius),
                      borderWidth: hairline(),
                      color: "hsl(var(--danger))",
                      fontSize: pxToRem(createServer.uploadFontSize),
                      gap: pxToRem(createServer.uploadGap),
                      height: pxToRem(createServer.uploadHeight),
                      lineHeight: 1,
                      paddingInline: pxToRem(createServer.uploadPaddingX),
                    }}
                    type="button"
                  >
                    <Glyph path={TRASH_PATH} size={14} />
                    {t("server.create.icon.remove")}
                  </button>
                </div>

                {uploadError ? (
                  <p
                    className="text-[hsl(var(--danger))]"
                    role="alert"
                    style={{
                      fontSize: pxToRem(createServer.iconHelpFontSize),
                      lineHeight: createServer.iconHelpLineHeight,
                      marginTop: pxToRem(modal.hintMarginTop),
                    }}
                  >
                    {uploadError}
                  </p>
                ) : null}
                {!uploadthingEnabled ? (
                  <p
                    className="text-[hsl(var(--warning))]"
                    style={{
                      fontSize: pxToRem(createServer.iconHelpFontSize),
                      lineHeight: createServer.iconHelpLineHeight,
                      marginTop: pxToRem(modal.hintMarginTop),
                    }}
                  >
                    {t("workspace.modal.serverIconUploadsDisabled")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* 2 · Sunucu adı + kısa ad */}
          <div
            className="grid"
            style={{
              gap: pxToRem(createServer.nameGridGap),
              gridTemplateColumns: `minmax(0,1fr) ${pxToRem(createServer.shortNameColumnWidth)}`,
            }}
          >
            <div>
              <FieldHeader
                badge={t("server.create.required")}
                badgeTone="danger"
                counter={`${state.name.length}/${NAME_MAX_LENGTH}`}
                counterWarning={isCounterWarning(
                  state.name.length,
                  NAME_MAX_LENGTH,
                  modal.counterWarnRatio,
                )}
                htmlFor="create-server-name"
                label={t("server.create.name.label")}
              />
              <input
                className="w-full font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))] focus-visible:border-[hsl(var(--primary)/0.5)]"
                data-testid="create-server-name"
                id="create-server-name"
                maxLength={NAME_MAX_LENGTH}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder={t("server.create.name.placeholder")}
                ref={nameInputRef}
                style={textInputStyle(nameValid)}
                value={state.name}
              />
              <p
                className="text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(modal.hintFontSize),
                  lineHeight: createServer.iconHelpLineHeight,
                  marginTop: pxToRem(modal.hintMarginTop),
                }}
              >
                {t("server.create.name.hint")}
              </p>
            </div>
            <div>
              <FieldHeader
                counter={`${state.shortName.length}/${SHORT_NAME_MAX_LENGTH}`}
                counterWarning={isCounterWarning(
                  state.shortName.length,
                  SHORT_NAME_MAX_LENGTH,
                  modal.counterWarnRatio,
                )}
                htmlFor="create-server-short-name"
                label={t("server.create.shortName.label")}
              />
              <input
                aria-invalid={!shortNameValid}
                className="w-full text-center font-semibold text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
                data-testid="create-server-short-name"
                id="create-server-short-name"
                maxLength={SHORT_NAME_MAX_LENGTH}
                onChange={(event) =>
                  patch({
                    shortName: Array.from(event.target.value)
                      .slice(0, SHORT_NAME_MAX_LENGTH)
                      .join("")
                      .toLocaleUpperCase("tr-TR"),
                  })
                }
                placeholder={deriveCreateServerShortName(state.name)}
                style={{
                  ...textInputStyle(shortNameValid),
                  fontFamily: DISPLAY_FONT,
                  letterSpacing: `${createServer.shortNameLetterSpacing}em`,
                  paddingInline: pxToRem(createServer.shortNameInputPaddingX),
                }}
                value={state.shortName}
              />
              <p
                className="text-center text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(createServer.shortNameHintFontSize),
                  lineHeight: createServer.iconHelpLineHeight,
                  marginTop: pxToRem(createServer.shortNameHintMarginTop),
                }}
              >
                {t("server.create.shortName.hint")}
              </p>
            </div>
          </div>

          {/* 3 · Açıklama */}
          <div>
            <FieldHeader
              badge={t("server.create.optional")}
              counter={`${state.description.length}/${DESCRIPTION_MAX_LENGTH}`}
              counterWarning={isCounterWarning(
                state.description.length,
                DESCRIPTION_MAX_LENGTH,
                modal.counterWarnRatio,
              )}
              htmlFor="create-server-description"
              label={t("server.create.description.label")}
            />
            <textarea
              className="w-full resize-none font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
              data-testid="create-server-description"
              id="create-server-description"
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={t("server.create.description.placeholder")}
              rows={2}
              style={{
                ...textInputStyle(false),
                fontSize: pxToRem(modal.textareaFontSize),
                lineHeight: modal.textareaLineHeight,
                paddingBlock: pxToRem(modal.textareaPaddingY),
              }}
              value={state.description}
            />
          </div>

          {/* 4 · Erişim */}
          <div>
            <FieldHeader label={t("server.create.access.label")} />
            <div
              aria-label={t("server.create.access.label")}
              className="flex flex-col"
              onKeyDown={(event) => {
                const index = CREATE_SERVER_ACCESS_OPTIONS.indexOf(state.access);

                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                  event.preventDefault();
                  patch({
                    access:
                      CREATE_SERVER_ACCESS_OPTIONS[
                        (index + 1) % CREATE_SERVER_ACCESS_OPTIONS.length
                      ]!,
                  });
                } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  patch({
                    access:
                      CREATE_SERVER_ACCESS_OPTIONS[
                        (index - 1 + CREATE_SERVER_ACCESS_OPTIONS.length) %
                          CREATE_SERVER_ACCESS_OPTIONS.length
                      ]!,
                  });
                }
              }}
              role="radiogroup"
              style={{
                gap: pxToRem(createServer.accessListGap),
                marginTop: pxToRem(createServer.accessListMarginTop),
              }}
            >
              {CREATE_SERVER_ACCESS_OPTIONS.map((access) => {
                const selected = state.access === access;

                return (
                  <button
                    aria-checked={selected}
                    className="flex items-center text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid={`create-server-access-${access}`}
                    key={access}
                    onClick={() => patch({ access })}
                    role="radio"
                    style={{
                      background: selected
                        ? "hsl(var(--primary)/0.08)"
                        : "hsl(var(--surface-base))",
                      borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)",
                      borderRadius: pxToRem(createServer.accessRowRadius),
                      borderStyle: "solid",
                      borderWidth: pxToRem(createServer.accessRowBorderWidth),
                      gap: pxToRem(createServer.accessRowGap),
                      paddingBlock: pxToRem(createServer.accessRowPaddingY),
                      paddingInline: pxToRem(createServer.accessRowPaddingX),
                    }}
                    tabIndex={selected ? 0 : -1}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="grid flex-none place-items-center"
                      style={{
                        background: selected
                          ? "hsl(var(--primary)/0.16)"
                          : "hsl(var(--surface-soft))",
                        borderRadius: pxToRem(createServer.accessIconRadius),
                        color: selected ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
                        height: pxToRem(createServer.accessIconSize),
                        width: pxToRem(createServer.accessIconSize),
                      }}
                    >
                      <Glyph
                        path={ACCESS_ICON_PATHS[access]}
                        size={createServer.accessIconGlyphSize}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block font-semibold text-[hsl(var(--foreground))]"
                        style={{
                          fontSize: pxToRem(createServer.accessTitleFontSize),
                          lineHeight: createServer.accessTitleLineHeight,
                        }}
                      >
                        {t(`server.create.access.${access}.title`)}
                      </span>
                      <span
                        className="block text-[hsl(var(--text-muted))]"
                        style={{
                          fontSize: pxToRem(createServer.accessDescriptionFontSize),
                          lineHeight: createServer.accessDescriptionLineHeight,
                          marginTop: pxToRem(createServer.accessDescriptionMarginTop),
                        }}
                      >
                        {t(`server.create.access.${access}.description`)}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="grid flex-none place-items-center rounded-full"
                      style={{
                        background: selected ? "hsl(var(--primary))" : "transparent",
                        borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border))",
                        borderStyle: "solid",
                        borderWidth: pxToRem(createServer.accessRadioBorderWidth),
                        color: "hsl(var(--primary-foreground))",
                        height: pxToRem(createServer.accessRadioSize),
                        width: pxToRem(createServer.accessRadioSize),
                      }}
                    >
                      {selected ? (
                        <Glyph
                          path={CHECK_PATH}
                          size={createServer.accessRadioCheckGlyphSize}
                          strokeWidth={3}
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5 · Keşif etiketleri — Ş8'in bileşeni, ayarlarla AYNI (PROMPT §3) */}
          <DiscoveryTagPicker
            disabled={!tagsActive}
            disabledReason={tagsActive ? undefined : t("server.create.tags.disabledReason")}
            label={t("server.create.tags.label")}
            lead={t(
              tagsActive ? "server.create.tags.leadActive" : "server.create.tags.leadInactive",
            )}
            onChange={(tags) => patch({ tags })}
            suggestionsLabel={t("server.create.tags.suggestions")}
            tags={state.tags}
            testId="create-server-tags"
            variant="create"
          />

          {/* 6 · Üç anahtar */}
          <div className="flex flex-col" style={{ gap: pxToRem(SERVER_METRICS.toggleRow.gap) }}>
            <ToggleRow
              checked={state.allowMemberAdds}
              description={t("server.create.toggles.memberAdds.description")}
              onChange={(checked) => patch({ allowMemberAdds: checked })}
              testId="create-server-toggle-member-adds"
              title={t("server.create.toggles.memberAdds.title")}
            />
            <ToggleRow
              checked={state.allowGifs}
              description={t("server.create.toggles.gifs.description")}
              onChange={(checked) => patch({ allowGifs: checked })}
              testId="create-server-toggle-gifs"
              title={t("server.create.toggles.gifs.title")}
            />
            <ToggleRow
              checked={state.allowFileUploads}
              description={t("server.create.toggles.uploads.description")}
              onChange={(checked) => patch({ allowFileUploads: checked })}
              testId="create-server-toggle-uploads"
              title={t("server.create.toggles.uploads.title")}
            />
          </div>

          {/* 7 · Katlanır Gelişmiş */}
          <div
            className="overflow-hidden border"
            style={{
              background: "hsl(var(--surface-base))",
              borderColor: `hsl(var(--border)/${createServer.advancedBorderAlpha})`,
              borderRadius: pxToRem(createServer.advancedRadius),
              borderWidth: hairline(),
            }}
          >
            <button
              aria-expanded={advancedOpen}
              className="flex w-full items-center border-0 bg-transparent text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="create-server-advanced-toggle"
              onClick={() => setAdvancedOpen((current) => !current)}
              style={{
                gap: pxToRem(createServer.advancedHeaderGap),
                paddingBlock: pxToRem(createServer.advancedHeaderPaddingY),
                paddingInline: pxToRem(createServer.advancedHeaderPaddingX),
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="grid flex-none place-items-center text-[hsl(var(--text-muted))]"
                style={{
                  height: pxToRem(createServer.advancedCaretSize),
                  transform: advancedOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transitionDuration: `${createServer.advancedCaretTransitionMs}ms`,
                  transitionProperty: "transform",
                  width: pxToRem(createServer.advancedCaretSize),
                }}
              >
                <Glyph path={CHEVRON_PATH} size={14} strokeWidth={2.4} />
              </span>
              <span
                className="flex-none font-semibold text-[hsl(var(--foreground))]"
                style={{
                  fontSize: pxToRem(createServer.advancedTitleFontSize),
                  lineHeight: 1.2,
                }}
              >
                {t("server.create.advanced.title")}
              </span>
              <span
                className="ml-auto font-medium whitespace-nowrap text-[hsl(var(--text-muted))]"
                data-testid="create-server-advanced-summary"
                style={{ fontSize: pxToRem(createServer.advancedSummaryFontSize), lineHeight: 1 }}
              >
                {advancedSummary}
              </span>
            </button>

            {advancedOpen ? (
              <div
                className="flex flex-col"
                style={{
                  gap: pxToRem(createServer.advancedBodyGap),
                  paddingBottom: pxToRem(createServer.advancedBodyPaddingBottom),
                  paddingInline: pxToRem(createServer.advancedBodyPaddingX),
                  paddingTop: pxToRem(createServer.advancedBodyPaddingTop),
                }}
              >
                <OptionChipGroup
                  description={t("server.create.advanced.messageLimit.description")}
                  onChange={(value) => patch({ messageCharacterLimit: Number(value) })}
                  options={CREATE_SERVER_MESSAGE_LIMITS.map((limit) => ({
                    label: t(`server.create.advanced.messageLimit.option.${limit}`),
                    value: String(limit),
                  }))}
                  testId="create-server-message-limit"
                  title={t("server.create.advanced.messageLimit.title")}
                  value={String(state.messageCharacterLimit)}
                  variant="advanced"
                />
                <OptionChipGroup
                  description={t("server.create.advanced.deletedNotice.description")}
                  onChange={(value) => patch({ deletedMessageNoticeMinutes: Number(value) })}
                  options={CREATE_SERVER_DELETED_NOTICE_MINUTES.map((minutes) => ({
                    label: t(`server.create.advanced.deletedNotice.option.${minutes}`),
                    value: String(minutes),
                  }))}
                  testId="create-server-deleted-notice"
                  title={t("server.create.advanced.deletedNotice.title")}
                  value={String(state.deletedMessageNoticeMinutes)}
                  variant="advanced"
                />
              </div>
            ) : null}
          </div>
        </div>
      </ServerModalShell>

      <BugReportDiscardDialog
        body={t("server.create.discard.body")}
        cancelLabel={t("server.create.discard.cancel")}
        confirmLabel={t("server.create.discard.confirm")}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={onClose}
        open={open && discardOpen}
        testIdPrefix="create-server"
        title={t("server.create.discard.title")}
      />
    </>
  );
}

function CreateServerFooterNote({
  error,
  state,
}: {
  readonly error: boolean;
  readonly state: CreateServerFormState;
}) {
  const { t } = useI18n();
  const note = selectCreateServerFooterNote(state);
  const tone = error ? "danger" : note.kind === "summary" ? "text-secondary" : "warning";

  return (
    <span
      className="flex-1"
      data-testid="create-server-note"
      style={{
        color: `hsl(var(--${tone}))`,
        fontSize: pxToRem(modal.footerNoteFontSize),
        lineHeight: modal.footerNoteLineHeight,
        minWidth: pxToRem(modal.footerNoteMinWidth),
      }}
    >
      {error
        ? t("server.create.error")
        : note.kind === "warning"
          ? t("server.create.footer.hint")
          : t("server.create.footer.summary", {
              access: t(note.accessLabelKey),
              name: note.name,
              shortName: note.shortName,
            })}
    </span>
  );
}
