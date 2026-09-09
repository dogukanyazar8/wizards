"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import {
  createServerAccessLabelKey,
  resolveCreateServerBadgeTone,
  resolveCreateServerMediaSummary,
  resolveCreateServerShortNameView,
  type CreateServerFormState,
} from "@/lib/servers/create-server-form";
import { SERVER_METRICS, hairline, pxToRem } from "@/lib/servers/metrics";
import { getServerIconToneColor, resolveServerIconTone } from "@/lib/servers/server-icon-tone";

/**
 * SPEC-SUNUCU §7 — sunucu oluşturma penceresinin 296 px'lik **canlı önizleme** kolonu.
 *
 * Üç kart da forma doğrudan bağlıdır ve **ayrı state tutulmaz** (Ş10 §2): her değer
 * `CreateServerFormState`'ten türer. İkinci bir durum, "önizlemedeki rozet ile ayaktaki özet
 * neden farklı" sorusunu doğurur.
 *
 * `<1024px`'te bu kolon forma **üstten** eklenir (§11); sıralamayı bu dosya değil, modaldeki
 * ızgara kurar.
 */

const { createServer, modal } = SERVER_METRICS;

export type CreateServerPreviewProps = {
  readonly state: CreateServerFormState;
};

export function CreateServerPreview({ state }: CreateServerPreviewProps) {
  const { t } = useI18n();
  const shortName = resolveCreateServerShortNameView(state.shortName, state.name);
  const tone = resolveServerIconTone(state.iconColor, shortName);
  /**
   * Görsel yüklendiğinde önizleme onu gösterir. Referans dosyada yükleme durumu **yok**
   * (`csIconBg` her zaman tonu verir); canlı bir önizlemenin yüklenmiş ikonu saklaması ise
   * kartın adını yalanlardı.
   */
  const iconBackground = state.iconUrl
    ? `center / cover no-repeat url(${JSON.stringify(state.iconUrl)})`
    : getServerIconToneColor(tone);
  const iconInitials = state.iconUrl ? "" : shortName;
  const badgeTone = resolveCreateServerBadgeTone(state.access);
  const badgeLabel = t(createServerAccessLabelKey(state.access));
  const nameView = state.name.trim() || t("server.create.preview.emptyName");
  const descriptionFilled = state.description.trim().length > 0;
  const descriptionView = descriptionFilled
    ? state.description.trim()
    : t("server.create.preview.emptyDescription");
  const media = resolveCreateServerMediaSummary(state);

  const summaryRows: readonly { label: string; value: string }[] = [
    { label: t("server.create.preview.summary.access"), value: badgeLabel },
    {
      label: t("server.create.preview.summary.invites"),
      value: state.allowMemberAdds
        ? t("server.create.preview.invites.all")
        : t("server.create.preview.invites.admin"),
    },
    {
      label: t("server.create.preview.summary.media"),
      value: t(`server.create.preview.media.${media}`),
    },
    {
      label: t("server.create.preview.summary.messageLimit"),
      value: t(`server.create.advanced.messageLimit.option.${state.messageCharacterLimit}`),
    },
  ];

  return (
    <div
      className="flex min-h-0 min-w-0 flex-col overflow-y-auto overflow-x-hidden"
      data-testid="create-server-preview"
      style={{
        background: "hsl(var(--surface-panel))",
        gap: pxToRem(createServer.previewGap),
        paddingBottom: pxToRem(createServer.previewPaddingBottom),
        paddingInline: pxToRem(createServer.previewPaddingX),
        paddingTop: pxToRem(createServer.previewPaddingTop),
      }}
    >
      <p
        className="font-semibold text-[hsl(var(--text-muted))] uppercase"
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(createServer.previewLabelFontSize),
          letterSpacing: `${modal.labelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {t("server.create.preview.label")}
      </p>

      {/* 1 · Ray satırı */}
      <div
        className="flex items-center border"
        style={{
          background: "hsl(var(--surface-card))",
          borderColor: `hsl(var(--border)/${createServer.railCardBorderAlpha})`,
          borderRadius: pxToRem(createServer.railCardRadius),
          borderWidth: hairline(),
          gap: pxToRem(createServer.railCardGap),
          paddingBlock: pxToRem(createServer.railCardPaddingY),
          paddingInline: pxToRem(createServer.railCardPaddingX),
        }}
      >
        <span
          aria-hidden="true"
          className="grid flex-none place-items-center font-semibold text-[hsl(var(--primary-foreground))]"
          style={{
            background: iconBackground,
            borderRadius: pxToRem(createServer.railIconRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(createServer.railIconFontSize),
            height: pxToRem(createServer.railIconSize),
            lineHeight: 1,
            width: pxToRem(createServer.railIconSize),
          }}
        >
          {iconInitials}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate font-semibold text-[hsl(var(--foreground))]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(createServer.railNameFontSize),
              letterSpacing: DISPLAY_TRACKING,
              lineHeight: 1.2,
            }}
          >
            {nameView}
          </span>
          <span
            className="block font-medium text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(createServer.railNoteFontSize),
              lineHeight: 1,
              marginTop: pxToRem(createServer.railNoteMarginTop),
            }}
          >
            {t("server.create.preview.railNote", { shortName })}
          </span>
        </span>
      </div>

      {/* 2 · Sunucu kartı */}
      <div
        className="border"
        style={{
          background: "hsl(var(--surface-card))",
          borderColor: `hsl(var(--border)/${createServer.serverCardBorderAlpha})`,
          borderRadius: pxToRem(createServer.serverCardRadius),
          borderWidth: hairline(),
          padding: pxToRem(createServer.serverCardPadding),
        }}
      >
        <span
          className="inline-flex items-center font-semibold"
          data-testid="create-server-preview-badge"
          style={{
            background: badgeTone
              ? `hsl(var(--${badgeTone})/0.16)`
              : "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(createServer.serverBadgeRadius),
            color: badgeTone ? `hsl(var(--${badgeTone}))` : "hsl(var(--text-muted))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(createServer.serverBadgeFontSize),
            gap: pxToRem(createServer.serverBadgeGap),
            lineHeight: 1,
            paddingBlock: pxToRem(createServer.serverBadgePaddingY),
            paddingInline: pxToRem(createServer.serverBadgePaddingX),
          }}
        >
          {badgeLabel}
        </span>

        <div
          className="flex items-center"
          style={{
            gap: pxToRem(createServer.serverIconRowGap),
            marginTop: pxToRem(createServer.serverIconRowMarginTop),
          }}
        >
          <span
            aria-hidden="true"
            className="grid flex-none place-items-center font-semibold text-[hsl(var(--primary-foreground))]"
            style={{
              background: iconBackground,
              borderRadius: pxToRem(createServer.serverIconRadius),
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(createServer.serverIconFontSize),
              height: pxToRem(createServer.serverIconSize),
              lineHeight: 1,
              width: pxToRem(createServer.serverIconSize),
            }}
          >
            {iconInitials}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate font-semibold text-[hsl(var(--foreground))]"
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(createServer.serverNameFontSize),
                letterSpacing: DISPLAY_TRACKING,
                lineHeight: 1.2,
              }}
            >
              {nameView}
            </p>
            <div
              className="flex items-center"
              style={{
                gap: pxToRem(createServer.serverMetaGap),
                marginTop: pxToRem(createServer.serverMetaMarginTop),
              }}
            >
              <span
                className="flex items-center font-medium text-[hsl(var(--success))]"
                style={{
                  fontSize: pxToRem(createServer.serverMetaFontSize),
                  gap: pxToRem(5),
                  lineHeight: 1,
                }}
              >
                <span
                  aria-hidden="true"
                  className="rounded-full bg-[hsl(var(--success))]"
                  style={{
                    height: pxToRem(createServer.serverMetaDotSize),
                    width: pxToRem(createServer.serverMetaDotSize),
                  }}
                />
                {t("server.create.preview.online")}
              </span>
              <span
                className="font-medium text-[hsl(var(--text-muted))]"
                style={{ fontSize: pxToRem(createServer.serverMetaFontSize), lineHeight: 1 }}
              >
                {t("server.create.preview.members")}
              </span>
            </div>
          </div>
        </div>

        <p
          className="[text-wrap:pretty]"
          style={{
            color: descriptionFilled ? "hsl(var(--text-secondary))" : "hsl(var(--text-muted))",
            fontSize: pxToRem(createServer.serverDescriptionFontSize),
            lineHeight: createServer.serverDescriptionLineHeight,
            marginTop: pxToRem(createServer.serverDescriptionMarginTop),
          }}
        >
          {descriptionView}
        </p>
      </div>

      {/* 3 · Özet kartı */}
      <div
        className="border"
        style={{
          background: "hsl(var(--surface-card))",
          borderColor: `hsl(var(--border)/${createServer.serverCardBorderAlpha})`,
          borderRadius: pxToRem(createServer.summaryCardRadius),
          borderWidth: hairline(),
          padding: pxToRem(createServer.summaryCardPadding),
        }}
      >
        <p
          className="font-semibold text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(createServer.summaryTitleFontSize),
            lineHeight: 1.2,
          }}
        >
          {t("server.create.preview.summaryTitle")}
        </p>
        <dl
          className="flex flex-col"
          style={{
            gap: pxToRem(createServer.summaryRowsGap),
            marginTop: pxToRem(createServer.summaryRowsMarginTop),
          }}
        >
          {summaryRows.map((row) => (
            <div
              className="flex items-center"
              key={row.label}
              style={{
                gap: pxToRem(createServer.summaryRowGap),
                paddingBlock: pxToRem(createServer.summaryRowPaddingY),
              }}
            >
              <dt
                className="min-w-0 flex-1 font-medium text-[hsl(var(--text-muted))]"
                style={{ fontSize: pxToRem(createServer.summaryLabelFontSize), lineHeight: 1 }}
              >
                {row.label}
              </dt>
              <dd
                className="flex-none font-semibold whitespace-nowrap text-[hsl(var(--foreground))]"
                style={{ fontSize: pxToRem(createServer.summaryValueFontSize), lineHeight: 1 }}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
