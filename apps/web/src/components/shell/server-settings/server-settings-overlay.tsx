"use client";

import React, { Suspense, lazy, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import type { WorkspaceServerDetail } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import {
  ChannelsSectionSkeleton,
  ContentSectionSkeleton,
  DangerSectionSkeleton,
  EventsSectionSkeleton,
  GeneralSectionSkeleton,
  InvitesSectionSkeleton,
  MembersSectionSkeleton,
  RolesSectionSkeleton,
  VisibilitySectionSkeleton,
} from "@/components/shell/server-settings/section-skeletons";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import { SettingsGlyph } from "@/components/shell/server-settings/settings-primitives";
import { useServerSettingsDraft } from "@/components/shell/server-settings/use-server-settings-draft";
import { SERVER_METRICS, hairline, pxToRem } from "@/lib/servers/metrics";
import { getServerIconToneColor, resolveServerIconTone } from "@/lib/servers/server-icon-tone";
import { resolveServerAbbreviation } from "@/lib/servers/server-icon-presentation";
import {
  DEFAULT_SERVER_SETTINGS_SECTION,
  resolveServerSettingsCounts,
  resolveServerVisibilityBadge,
  resolveVisibleSection,
  selectServerSettingsSections,
  type ServerSettingsSectionId,
} from "@/lib/servers/server-settings-model";
import {
  SERVER_SINGLE_COLUMN_ATTRIBUTE,
  buildServerSingleColumnCss,
} from "@/lib/servers/shell-layout";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import { resolveViewerPermissions } from "@/lib/servers/viewer-permissions";
import { useAppStore } from "@/lib/store";
import { listServerEventsRequest, workspaceQueryKeys } from "@/lib/workspace/client";

/**
 * SPEC-SUNUCU §8 — sunucu ayarları kabuğu.
 *
 * **K4.** Eski `components/shell/server-settings-overlay.tsx` (1539 satır, altı sekme, hepsi
 * tek dosyada) silindi. Tek dosyada `React.lazy` ile bölüm başına yükleme ve bölüm başına
 * `Skeleton` (PROMPT §11) yazılamazdı: `lazy` bir **modül** sınırıdır, bir `if` dalı değil.
 *
 * **K11.** Kaplama `settings` katmanıdır; `z-index` `useLayerStack`'ten gelir (70) ve
 * pencereler (80) ayarların **üstünde** çizilir. `Esc` yalnız en üstteki katmanındır.
 *
 * **00 §5.** Ayarların tamamı yönetici/sahip içindir; yetkisi olmayana overlay hiç açılmaz
 * (render edilmez, pasifleştirilmez). `Tehlike bölgesi` satırı yalnız **sahibe** çizilir.
 *
 * Başlıktaki `Değişiklikler kaydedildi` göstergesi gerçek mutation durumundan gelir; sahte
 * gecikme yok (`use-server-settings-draft.ts`).
 */

/**
 * `React.lazy` bir **varsayılan** dışa aktarım bekler; dokuz bölüm dosyasının hepsi
 * varsayılan vermiyor (Ş12/Ş13 kendi bölümlerini adlı dışa aktarımla yazdı ve gövdelerini
 * ayrıca `…SectionView` olarak da açıyor — kabuksuz test edilebilsinler diye).
 *
 * Kabuk bu yüzden iki biçimi de kabul eder: varsayılan varsa o, yoksa adı verilen dışa
 * aktarım. Ad yanlışsa hata **yükleme anında** ve açık bir cümleyle çıkar; `undefined` bir
 * bileşeni React'e vermek "Element type is invalid" diye bambaşka bir yerde patlardı.
 */
function lazySection(
  load: () => Promise<Record<string, unknown>>,
  exportName: string,
): React.LazyExoticComponent<React.ComponentType<ServerSettingsSectionProps>> {
  return lazy(async () => {
    const loaded = await load();
    const component = loaded.default ?? loaded[exportName];

    if (typeof component !== "function") {
      throw new Error(`server settings section not found: ${exportName}`);
    }

    return { default: component as React.ComponentType<ServerSettingsSectionProps> };
  });
}

const SECTION_COMPONENTS: Record<
  ServerSettingsSectionId,
  {
    Component: React.LazyExoticComponent<React.ComponentType<ServerSettingsSectionProps>>;
    Skeleton: React.ComponentType;
  }
> = {
  channels: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/channels-section"),
      "ChannelsSection",
    ),
    Skeleton: ChannelsSectionSkeleton,
  },
  content: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/content-section"),
      "ContentSection",
    ),
    Skeleton: ContentSectionSkeleton,
  },
  danger: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/danger-section"),
      "DangerSection",
    ),
    Skeleton: DangerSectionSkeleton,
  },
  events: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/events-section"),
      "EventsSection",
    ),
    Skeleton: EventsSectionSkeleton,
  },
  general: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/general-section"),
      "GeneralSection",
    ),
    Skeleton: GeneralSectionSkeleton,
  },
  invites: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/invites-section"),
      "InvitesSection",
    ),
    Skeleton: InvitesSectionSkeleton,
  },
  members: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/members-section"),
      "MembersSection",
    ),
    Skeleton: MembersSectionSkeleton,
  },
  roles: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/roles-section"),
      "RolesSection",
    ),
    Skeleton: RolesSectionSkeleton,
  },
  visibility: {
    Component: lazySection(
      () => import("@/components/shell/server-settings/sections/visibility-section"),
      "VisibilitySection",
    ),
    Skeleton: VisibilitySectionSkeleton,
  },
};

/** SPEC §8'in dokuz menü ikonu — `Sunucu.dc.html` `SET_NAV` yollarının aynısı. */
const SECTION_ICON_PATHS: Record<ServerSettingsSectionId, string> = {
  channels: "M10 3 8 21M16 3l-2 18M3.5 8.5h17M3 15.5h17",
  content: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  danger:
    "M10.3 4.3 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9v4.5M12 17h.01",
  events:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  general:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-3-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 3 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z",
  invites:
    "M9 15l6-6M8.5 6.5 10 5a4.2 4.2 0 0 1 6 6l-1.5 1.5M15.5 17.5 14 19a4.2 4.2 0 0 1-6-6L9.5 11.5",
  members:
    "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M13 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M21 20v-1.5a4 4 0 0 0-3-3.9",
  roles: "M12 3l7 3v5.6c0 4.3-3 7.5-7 9.4-4-1.9-7-5.1-7-9.4V6zM9.2 12.2l2.1 2.2L15 10.6",
  visibility: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5.5-5.5 2 2-5.5z",
};

const { settings } = SERVER_METRICS;

/** §11 — modül seviyesinde bir kere kurulur; her açılışta yeniden dize üretmez. */
const SINGLE_COLUMN_CSS = buildServerSingleColumnCss();

export type ServerSettingsOverlayProps = {
  /** Ş13: moderasyon ve tehlike bölgesi izleyicinin kim olduğunu bilmek zorunda. */
  currentUserId: string;
  detail: WorkspaceServerDetail | null;
  onOpenDeleteServer: (serverId: string, serverName: string) => void;
  open: boolean;
  uploadthingEnabled: boolean;
};

export function ServerSettingsOverlay(props: ServerSettingsOverlayProps) {
  const canManage = Boolean(props.detail?.server.isAdmin || props.detail?.server.isOwner);

  return (
    <AnimatePresence>
      {props.open && props.detail && canManage ? (
        <ServerSettingsOverlayContent
          {...props}
          detail={props.detail}
          key={props.detail.server.id}
        />
      ) : null}
    </AnimatePresence>
  );
}

function ServerSettingsOverlayContent({
  currentUserId,
  detail,
  onOpenDeleteServer,
  uploadthingEnabled,
}: ServerSettingsOverlayProps & { detail: WorkspaceServerDetail }) {
  const { t } = useI18n();
  const closeServerSettings = useAppStore((state) => state.closeServerSettings);
  const settingsLayer = useLayerStack({
    id: "server-settings",
    kind: "settings",
    onClose: closeServerSettings,
    open: true,
  });

  const isOwner = detail.server.isOwner;
  const [section, setSection] = useState<ServerSettingsSectionId>(DEFAULT_SERVER_SETTINGS_SECTION);

  /**
   * Görünen bölüm **türetilir**, saklanmaz. Sahiplik oturum ortasında düşerse (`Sahipliği
   * devret`) `Tehlike bölgesi` menüden çıkar ve açık bölüm `Genel`'e döner; bunu bir efektle
   * `setSection`'a geri yazmak fazladan bir render turu demekti ve seçimin kaynağı ikiye
   * bölünürdü.
   */
  const visibleSection = resolveVisibleSection(section, isOwner);

  const { draft, flush, patch, patchDeferred, saveState } = useServerSettingsDraft(detail);

  /**
   * Menüdeki `Etkinlikler` sayısı `detail`'de yok; ayrı uçtan geliyor. Sorgu yalnız ayarlar
   * açıkken kurulur (bileşen kapalıyken mount edilmiyor) ve yüklenene kadar sayı `null`
   * kalır — `0` yazmak, etkinliği olan bir sunucuda yanlış olurdu.
   */
  const eventsQuery = useQuery({
    queryFn: () => listServerEventsRequest(detail.server.id),
    queryKey: workspaceQueryKeys.serverEvents(detail.server.id),
  });

  const counts = useMemo(
    () => resolveServerSettingsCounts(detail, eventsQuery.data?.events.length ?? null),
    [detail, eventsQuery.data],
  );

  /** Ş13 — dokuz bölümün ortak yetki kümesi; bölüm başına yeniden türetilmez. */
  const permissions = useMemo(
    () =>
      resolveViewerPermissions({
        currentUserId,
        members: detail.members,
        roles: detail.roles,
        server: detail.server,
      }),
    [currentUserId, detail.members, detail.roles, detail.server],
  );

  const sections = selectServerSettingsSections(isOwner);
  const active = SECTION_COMPONENTS[visibleSection];
  const shortNameView = resolveServerAbbreviation(draft.name, draft.shortName || null);
  const tone = resolveServerIconTone(draft.iconColor, shortNameView);
  const badge = resolveServerVisibilityBadge(draft);
  const badgeTone = badge === "discoverable" ? "primary" : badge === "public" ? "success" : null;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 grid place-items-center"
      data-testid="server-settings-overlay"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      style={{
        background: `hsl(var(--background)/${settings.overlayBackgroundAlpha})`,
        padding: pxToRem(settings.overlayPadding),
        zIndex: settingsLayer.zIndex,
      }}
      transition={{ duration: 0.16 }}
    >
      <style>{SINGLE_COLUMN_CSS}</style>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="flex h-full w-full flex-row overflow-hidden border"
        exit={{ opacity: 0, scale: 0.98 }}
        initial={{ opacity: 0, scale: 0.98 }}
        style={{
          ["--server-single-column-hairline" as string]: hairline(),
          background: "hsl(var(--surface-base))",
          borderColor: "hsl(var(--border))",
          borderRadius: pxToRem(settings.cardRadius),
          borderWidth: hairline(),
          boxShadow: `${pxToRem(settings.cardShadow.x)} ${pxToRem(settings.cardShadow.y)} ${pxToRem(
            settings.cardShadow.blur,
          )} ${pxToRem(settings.cardShadow.spread)} hsl(var(--shadow-color))`,
          maxWidth: pxToRem(settings.cardMaxWidth),
        }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        {...{ [SERVER_SINGLE_COLUMN_ATTRIBUTE]: "shell" }}
      >
        {/* Sol kolon — 262. §11: `<1024`'te forma **üstten** eklenir (`buildServerSingleColumnCss`). */}
        <div
          className="flex h-full w-[var(--server-settings-nav-width)] shrink-0 flex-col border-r"
          data-testid="server-settings-nav"
          style={{
            ["--server-settings-nav-width" as string]: pxToRem(settings.navWidth),
            background: "hsl(var(--surface-panel))",
            borderColor: `hsl(var(--border)/${settings.navBorderRightAlpha})`,
          }}
          {...{ [SERVER_SINGLE_COLUMN_ATTRIBUTE]: "aside" }}
        >
          <div
            className="flex items-center border-b"
            style={{
              borderColor: `hsl(var(--border)/${settings.serverCardBorderBottomAlpha})`,
              gap: pxToRem(settings.serverCardGap),
              padding: `${pxToRem(settings.serverCardPaddingY)} ${pxToRem(
                settings.serverCardPaddingX,
              )}`,
            }}
          >
            <span
              aria-hidden="true"
              className="grid flex-none place-items-center overflow-hidden font-semibold text-[hsl(var(--primary-foreground))]"
              style={{
                background: draft.iconUrl
                  ? `center / cover no-repeat url(${JSON.stringify(draft.iconUrl)})`
                  : getServerIconToneColor(tone),
                borderRadius: pxToRem(settings.serverIconRadius),
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(settings.serverIconFontSize),
                height: pxToRem(settings.serverIconSize),
                lineHeight: 1,
                width: pxToRem(settings.serverIconSize),
              }}
            >
              {draft.iconUrl ? "" : shortNameView}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="truncate font-semibold text-[hsl(var(--foreground))]"
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(settings.serverNameFontSize),
                  letterSpacing: DISPLAY_TRACKING,
                  lineHeight: settings.serverNameLineHeight,
                }}
              >
                {draft.name}
              </div>
              <div
                className="flex items-center"
                style={{
                  gap: pxToRem(settings.serverMetaGap),
                  marginTop: pxToRem(settings.serverMetaMarginTop),
                }}
              >
                <span
                  className="flex-none font-medium text-[hsl(var(--text-muted))]"
                  style={{ fontSize: pxToRem(settings.serverMetaFontSize), lineHeight: 1 }}
                >
                  {t("server.settings.memberCount", { count: detail.server.memberCount })}
                </span>
                <span
                  aria-hidden="true"
                  className="flex-none rounded-full bg-[hsl(var(--text-muted))]"
                  style={{
                    height: pxToRem(settings.serverMetaDotSize),
                    width: pxToRem(settings.serverMetaDotSize),
                  }}
                />
                <span
                  className="flex-none font-semibold whitespace-nowrap"
                  data-badge={badge}
                  data-testid="server-settings-nav-visibility-badge"
                  style={{
                    background: badgeTone
                      ? `hsl(var(--${badgeTone})/${settings.visibilityChipBackgroundAlpha})`
                      : "hsl(var(--surface-tertiary))",
                    borderRadius: pxToRem(settings.visibilityChipRadius),
                    color: badgeTone ? `hsl(var(--${badgeTone}))` : "hsl(var(--text-muted))",
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settings.visibilityChipFontSize),
                    lineHeight: 1,
                    padding: `${pxToRem(settings.visibilityChipPaddingY)} ${pxToRem(
                      settings.visibilityChipPaddingX,
                    )}`,
                  }}
                >
                  {t(`server.settings.visibility.badge.${badge}`)}
                </span>
              </div>
            </div>
          </div>

          <nav
            aria-label={t("server.settings.title")}
            className="min-h-0 flex-1 overflow-y-auto"
            style={{
              padding: `${pxToRem(settings.menuPaddingTop)} ${pxToRem(
                settings.menuPaddingX,
              )} ${pxToRem(settings.menuPaddingBottom)}`,
            }}
          >
            {sections.map((item) => {
              const isActive = item.id === visibleSection;
              const count = counts[item.count];
              const activeBackground = item.danger
                ? `hsl(var(--danger)/${settings.menuDangerActiveAlpha})`
                : `hsl(var(--primary)/${settings.menuActiveAlpha})`;
              const color = isActive
                ? item.danger
                  ? "hsl(var(--danger))"
                  : "hsl(var(--primary))"
                : item.danger
                  ? "hsl(var(--danger)/0.85)"
                  : "hsl(var(--text-secondary))";

              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  className="flex w-full cursor-pointer items-center border-0 text-left transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-active={isActive ? "true" : "false"}
                  data-testid={`server-settings-nav-${item.id}`}
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{
                    background: isActive ? activeBackground : "transparent",
                    borderRadius: pxToRem(settings.menuRowRadius),
                    color,
                    gap: pxToRem(settings.menuRowGap),
                    marginBottom: pxToRem(settings.menuRowMarginBottom),
                    padding: `${pxToRem(settings.menuRowPaddingY)} ${pxToRem(
                      settings.menuRowPaddingX,
                    )}`,
                  }}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="grid flex-none place-items-center"
                    style={{
                      height: pxToRem(settings.menuRowIconSize),
                      width: pxToRem(settings.menuRowIconSize),
                    }}
                  >
                    <SettingsGlyph
                      path={SECTION_ICON_PATHS[item.id]}
                      size={settings.menuRowIconSize}
                    />
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{
                      fontSize: pxToRem(settings.menuRowFontSize),
                      fontWeight: isActive ? 600 : 500,
                      lineHeight: settings.menuRowLineHeight,
                    }}
                  >
                    {t(`server.settings.section.${item.id}.title`)}
                  </span>
                  {count === null ? null : (
                    <span
                      className="flex-none font-semibold text-[hsl(var(--text-muted))]"
                      style={{
                        background: "hsl(var(--surface-tertiary))",
                        borderRadius: pxToRem(settings.menuCountRadius),
                        fontFamily: DISPLAY_FONT,
                        fontSize: pxToRem(settings.menuCountFontSize),
                        lineHeight: 1,
                        padding: `${pxToRem(settings.menuCountPaddingY)} ${pxToRem(
                          settings.menuCountPaddingX,
                        )}`,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sağ kolon */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          {...{ [SERVER_SINGLE_COLUMN_ATTRIBUTE]: "main" }}
        >
          <div
            className="flex flex-none items-center border-b"
            style={{
              background: "hsl(var(--surface-card))",
              borderColor: `hsl(var(--border)/${settings.headerBorderBottomAlpha})`,
              gap: pxToRem(settings.headerGap),
              padding: `${pxToRem(settings.headerPaddingY)} ${pxToRem(settings.headerPaddingX)}`,
            }}
          >
            <div className="min-w-0 flex-1">
              <h2
                className="truncate font-semibold"
                data-testid="server-settings-title"
                style={{
                  color:
                    visibleSection === "danger" ? "hsl(var(--danger))" : "hsl(var(--foreground))",
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(settings.headerTitleFontSize),
                  letterSpacing: DISPLAY_TRACKING,
                  lineHeight: settings.headerTitleLineHeight,
                }}
              >
                {t(`server.settings.section.${visibleSection}.title`)}
              </h2>
              <p
                className="truncate font-medium text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(settings.headerDescriptionFontSize),
                  lineHeight: settings.headerDescriptionLineHeight,
                  marginTop: pxToRem(settings.headerDescriptionMarginTop),
                }}
              >
                {t(`server.settings.section.${visibleSection}.description`)}
              </p>
            </div>

            <SaveIndicator state={saveState} />

            <WindowCloseButton
              aria-label={t("common.close")}
              onClick={closeServerSettings}
              testId="server-settings-close-button"
            />
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto"
            data-testid="server-settings-body"
            style={{
              padding: `${pxToRem(settings.bodyPaddingTop)} ${pxToRem(
                settings.bodyPaddingX,
              )} ${pxToRem(settings.bodyPaddingBottom)}`,
            }}
          >
            <Suspense fallback={<active.Skeleton />}>
              <active.Component
                counts={counts}
                currentUserId={currentUserId}
                detail={detail}
                draft={draft}
                flush={flush}
                onOpenDeleteServer={onOpenDeleteServer}
                patch={patch}
                patchDeferred={patchDeferred}
                permissions={permissions}
                uploadthingEnabled={uploadthingEnabled}
              />
            </Suspense>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * SPEC §8'in başlık çubuğundaki success noktalı `Değişiklikler kaydedildi`.
 *
 * Üç durum aynı kutuyu paylaşır; renk `hsl(var(--token))` ile gelir. `idle` hiçbir şey
 * çizmez: hiç değişiklik yapılmamışken "kaydedildi" yazmak, kaydedilmemiş bir alanı da
 * kaydedilmiş göstermek olurdu.
 */
function SaveIndicator({ state }: { state: "error" | "idle" | "saved" | "saving" }) {
  const { t } = useI18n();

  if (state === "idle") {
    return null;
  }

  const tone = state === "error" ? "danger" : state === "saving" ? "text-muted" : "success";
  const label =
    state === "error"
      ? t("server.settings.saveError")
      : state === "saving"
        ? t("common.saving")
        : t("server.settings.saved");

  return (
    <span
      className="flex flex-none items-center font-medium whitespace-nowrap"
      data-state={state}
      data-testid="server-settings-saved-indicator"
      role="status"
      style={{
        color: `hsl(var(--${tone}))`,
        fontSize: pxToRem(settings.savedFontSize),
        gap: pxToRem(settings.savedGap),
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden="true"
        className="flex-none rounded-full"
        style={{
          background: `hsl(var(--${tone}))`,
          height: pxToRem(settings.savedDotSize),
          width: pxToRem(settings.savedDotSize),
        }}
      />
      {label}
    </span>
  );
}
