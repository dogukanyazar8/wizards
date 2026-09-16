"use client";

import React, { useCallback, useMemo, useRef } from "react";
import {
  Bell,
  Info,
  LogOut,
  Mic,
  Monitor,
  Palette,
  RefreshCw,
  Search,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

import { DISPLAY_FONT, HomeAvatar, PresenceDot } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { HOME_PRESENCE_LABEL_KEY, type HomePresenceStatus } from "@/lib/home/presentation";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import type { SettingsSection } from "@/lib/settings/navigation";
import type { SettingsSectionDef } from "@/lib/settings/tree";
import { cn } from "@/lib/utils";

const { nav } = SETTINGS_METRICS;

const TAB_SELECTOR = '[role="tab"]';

/**
 * Ağaçtaki ikon **adı**, çizilecek bileşene burada bağlanır. Ağaç bir React bileşeni taşımaz:
 * `tree.ts` sunucuda da okunur (arama indeksi, kopya denetimi) ve bir ikon bileşeni onu
 * istemciye çivilerdi.
 */
const SECTION_ICON: Readonly<Record<string, LucideIcon>> = {
  bell: Bell,
  info: Info,
  mic: Mic,
  monitor: Monitor,
  palette: Palette,
  refresh: RefreshCw,
  user: User,
};

const NAV_GROUP_LABEL_KEY = {
  app: "settings.nav.app",
  info: "settings.nav.info",
  user: "settings.nav.user",
} as const;

/** SPEC §4.1 — üç grup, bu sırayla. */
const NAV_GROUP_ORDER = ["user", "app", "info"] as const;

export type SettingsNavIdentity = {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly status: HomePresenceStatus;
  readonly username: string;
};

export type SettingsNavProps = {
  readonly activeSection: SettingsSection;
  readonly identity: SettingsNavIdentity;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (section: SettingsSection) => void;
  readonly onSignOut?: (() => void) | undefined;
  readonly query: string;
  /** Zaten süzülmüş liste: `Masaüstü` yalnız Tauri çalışma zamanında içindedir (K11). */
  readonly sections: readonly SettingsSectionDef[];
};

/**
 * Sol navigasyon (250 px) — SPEC §4.1, Ş5 §3.
 *
 * `Masaüstü` bölümünün listeye girip girmeyeceğine **çalışma zamanı** karar verir, kullanıcı
 * değil (K11): süzme çağıran tarafta yapılır ve buraya yalnız çizilecek liste gelir. Referans
 * bunu bir Web/Masaüstü segmentiyle taklit ediyordu; üründe segment yok (sapma #3).
 *
 * `role="tablist"`, satırlar `role="tab"`. `↑/↓` gezinir **ve seçer**: bölüm listesi otomatik
 * etkinleşen bir tablist'tir, tıpkı alt sekme şeridi gibi — aksi hâlde klavye kullanıcısı her
 * bölüm için ayrıca `Enter`'a basmak zorunda kalırdı.
 */
export function SettingsNav({
  activeSection,
  identity,
  onQueryChange,
  onSelect,
  onSignOut,
  query,
  sections,
}: SettingsNavProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement | null>(null);

  /** Gruplanmış liste; içi boşalan grup çizilmez (web'de `UYGULAMA` boşalmaz, ama kural tek). */
  const groups = useMemo(
    () =>
      NAV_GROUP_ORDER.map((group) => ({
        group,
        items: sections.filter((section) => section.group === group),
      })).filter((entry) => entry.items.length > 0),
    [sections],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = sections.findIndex((section) => section.key === activeSection);

      if (current === -1) return;

      const last = sections.length - 1;
      const next =
        event.key === "ArrowDown"
          ? (current + 1) % sections.length
          : event.key === "ArrowUp"
            ? (current + last) % sections.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : -1;

      if (next === -1) return;

      event.preventDefault();
      const target = sections[next];

      if (target) {
        onSelect(target.key);
        listRef.current?.querySelectorAll<HTMLButtonElement>(TAB_SELECTOR)[next]?.focus();
      }
    },
    [activeSection, onSelect, sections],
  );

  return (
    <div
      className="settings-window-nav flex min-h-0 shrink-0 flex-col"
      data-testid="settings-nav"
      style={{
        background: "hsl(var(--surface-panel))",
        borderRight: `${hairline()} solid hsl(var(--border)/${nav.borderRightAlpha})`,
      }}
    >
      <div
        className="settings-window-nav-head shrink-0"
        style={{
          padding: `${pxToRem(nav.headerPaddingTop)} ${pxToRem(nav.headerPaddingX)} ${pxToRem(
            nav.headerPaddingBottom,
          )}`,
        }}
      >
        <p
          className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
          style={{ fontSize: pxToRem(nav.titleFontSize), fontWeight: nav.titleWeight }}
        >
          {t("settings.title")}
        </p>

        <form
          autoComplete="off"
          role="search"
          data-focus-surface
          onSubmit={(event) => event.preventDefault()}
          className="flex items-center focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]"
          style={{
            background: `hsl(var(--surface-soft)/${nav.searchSurfaceAlpha})`,
            border: `${hairline()} solid ${
              query
                ? `hsl(var(--primary)/${nav.searchActiveBorderAlpha})`
                : "hsl(var(--border)/0.6)"
            }`,
            borderRadius: pxToRem(nav.searchRadius),
            gap: pxToRem(nav.searchGap),
            height: pxToRem(nav.searchHeight),
            marginTop: pxToRem(nav.searchMarginTop),
            padding: `0 ${pxToRem(nav.searchPaddingX)}`,
            transition: `border-color ${SETTINGS_METRICS.motion.searchBorderSeconds}s ease`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(nav.searchIconSize, nav.searchFontSize),
              width: pxToEm(nav.searchIconSize, nav.searchFontSize),
            }}
          />
          <input
            aria-label={t("settings.search")}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-muted))] focus-visible:outline-hidden"
            data-testid="settings-search-input"
            onChange={(event) => {
              // Background credential autofill must not replace the active
              // settings form with search results. Deliberate search has focus.
              if (document.activeElement !== event.currentTarget) {
                event.currentTarget.value = query;
                return;
              }
              onQueryChange(event.currentTarget.value);
            }}
            placeholder={t("settings.search")}
            style={{ fontSize: pxToRem(nav.searchFontSize) }}
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label={t("settings.clearSearch")}
              className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition-colors hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="settings-search-clear"
              onClick={() => onQueryChange("")}
              style={{
                background: "hsl(var(--surface-tertiary))",
                borderRadius: pxToRem(nav.searchClearRadius),
                height: pxToRem(nav.searchClearSize),
                width: pxToRem(nav.searchClearSize),
              }}
              type="button"
            >
              <X
                aria-hidden="true"
                style={{
                  height: pxToEm(nav.searchClearIconSize, nav.searchFontSize),
                  width: pxToEm(nav.searchClearIconSize, nav.searchFontSize),
                }}
              />
            </button>
          ) : null}
        </form>
      </div>

      <div
        className="settings-window-nav-list min-h-0 flex-1 overflow-y-auto"
        onKeyDown={handleKeyDown}
        ref={listRef}
        role="tablist"
        style={{
          padding: `${pxToRem(nav.listPaddingTop)} ${pxToRem(nav.listPaddingX)} ${pxToRem(
            nav.listPaddingBottom,
          )}`,
        }}
      >
        {groups.map(({ group, items }) => (
          <div className="settings-window-nav-group" key={group}>
            <p
              className={cn(
                "settings-window-nav-group-label uppercase text-[hsl(var(--text-muted))]",
                DISPLAY_FONT,
              )}
              style={{
                fontSize: pxToRem(nav.groupLabelFontSize),
                fontWeight: nav.groupLabelWeight,
                letterSpacing: `${nav.groupLabelTracking}em`,
                opacity: nav.groupLabelAlpha,
                padding: `${pxToRem(nav.groupLabelPaddingTop)} ${pxToRem(
                  nav.groupLabelPaddingX,
                )} ${pxToRem(nav.groupLabelPaddingBottom)}`,
              }}
            >
              {t(NAV_GROUP_LABEL_KEY[group])}
            </p>

            {items.map((section) => {
              const active = section.key === activeSection;
              const Icon = SECTION_ICON[section.icon] ?? Info;

              return (
                <button
                  aria-controls="settings-window-panel"
                  aria-selected={active}
                  className="settings-window-nav-row flex w-full items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-active={active ? "true" : undefined}
                  data-section={section.key}
                  key={section.key}
                  onClick={() => onSelect(section.key)}
                  role="tab"
                  style={{
                    background: active
                      ? `hsl(var(--primary)/${nav.rowActiveSurfaceAlpha})`
                      : "transparent",
                    borderRadius: pxToRem(nav.rowRadius),
                    color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                    fontSize: pxToRem(nav.rowFontSize),
                    fontWeight: active ? nav.rowActiveWeight : 500,
                    gap: pxToRem(nav.rowGap),
                    lineHeight: nav.rowLineHeight,
                    marginBottom: pxToRem(nav.rowMarginBottom),
                    padding: `${pxToRem(nav.rowPaddingY)} ${pxToRem(nav.rowPaddingX)}`,
                  }}
                  tabIndex={active ? 0 : -1}
                  title={t(section.labelKey)}
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className="shrink-0"
                    style={{
                      height: pxToEm(nav.rowIconSize, nav.rowFontSize),
                      opacity: nav.rowIconOpacity,
                      width: pxToEm(nav.rowIconSize, nav.rowFontSize),
                    }}
                  />
                  <span className="settings-window-nav-text min-w-0 flex-1 truncate text-left">
                    {t(section.labelKey)}
                  </span>
                  {section.desktopOnly ? (
                    <span
                      className={cn(
                        "settings-window-nav-text shrink-0 uppercase text-[hsl(var(--text-muted))]",
                        DISPLAY_FONT,
                      )}
                      style={{
                        background: "hsl(var(--surface-tertiary))",
                        borderRadius: pxToRem(nav.tagRadius),
                        fontSize: pxToRem(nav.tagFontSize),
                        letterSpacing: `${nav.tagTracking}em`,
                        padding: `${pxToRem(nav.tagPaddingY)} ${pxToRem(nav.tagPaddingX)}`,
                      }}
                    >
                      {t("settings.desktopTag")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        className="settings-window-nav-footer flex shrink-0 items-center"
        data-testid="settings-nav-footer"
        style={{
          height: pxToRem(SETTINGS_METRICS.footerHeight),
          background: "hsl(var(--surface-card))",
          borderTop: `${hairline()} solid hsl(var(--border)/${nav.footerBorderTopAlpha})`,
          gap: pxToRem(nav.footerGap),
          padding: `${pxToRem(nav.footerPaddingY)} ${pxToRem(nav.footerPaddingX)}`,
        }}
      >
        <span className="relative shrink-0">
          <HomeAvatar
            avatarUrl={identity.avatarUrl}
            displayName={identity.displayName}
            fontSize={nav.footerNameFontSize}
            size={nav.footerAvatarSize}
          />
          <PresenceDot
            borderColor="hsl(var(--surface-card))"
            borderWidth={nav.footerPresenceRing}
            presence={identity.status}
            size={nav.footerPresenceDot}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[hsl(var(--foreground))]"
            style={{ fontSize: pxToRem(nav.footerNameFontSize), fontWeight: 600 }}
          >
            {identity.displayName}
          </p>
          <p
            className="truncate text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(nav.footerSubFontSize),
              marginTop: pxToRem(nav.footerSubMarginTop),
            }}
          >
            {`@${identity.username} · ${t(HOME_PRESENCE_LABEL_KEY[identity.status])}`}
          </p>
        </div>

        {onSignOut ? (
          <button
            aria-label={t("settings.signOut")}
            className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="settings-nav-sign-out"
            onClick={onSignOut}
            style={{
              borderRadius: pxToRem(nav.footerLogoutRadius),
              height: pxToRem(nav.footerLogoutSize),
              width: pxToRem(nav.footerLogoutSize),
            }}
            type="button"
          >
            <LogOut
              aria-hidden="true"
              style={{
                height: pxToEm(nav.footerLogoutIconSize, nav.footerNameFontSize),
                width: pxToEm(nav.footerLogoutIconSize, nav.footerNameFontSize),
              }}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
