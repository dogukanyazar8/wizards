"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Hash, MessageCircle, Search, Terminal, type LucideIcon } from "lucide-react";

import { HomeAvatar } from "@/components/home/home-primitives";
import { PRESENCE_CHIPS } from "@/components/home/home-presence-card";
import { useFocusControls } from "@/components/providers/focus-controls-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { HomeClientError, fetchHomeCommandSearch, homeQueryKeys } from "@/lib/home/client";
import {
  COMMAND_PALETTE_DEBOUNCE_MS,
  buildPaletteSections,
  buildPaletteTabs,
  filterPaletteSections,
  moveActiveRow,
  parseCommandPaletteQuery,
  selectCommandActions,
  shouldShowPaletteRateLimit,
  type CommandPaletteTab,
  type HomeCommandActionId,
  type PaletteRow,
} from "@/lib/home/command-palette";
import { HOME_METRICS, hairline, pxToEm, pxToRem } from "@/lib/home/metrics";
import { HOME_PRESENCE_LABEL_KEY } from "@/lib/home/presentation";
import { cn } from "@/lib/utils";

/**
 * Ayarlar referansındaki arama penceresinin üretim karşılığı.
 *
 * Palet sağlayıcıda dinamik yüklenir. Sonuçlar yalnız güvenli göreli rotalara
 * dönüştürüldükten sonra çizilir; sorgu URL/geçmişe yazılmaz ve 429 yinelenmez.
 */

const { commandPalette } = HOME_METRICS;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type CommandPaletteProps = {
  onClose: () => void;
  onOpenCreateServer: () => void;
  onOpenSettings: () => void;
};

export function CommandPalette({
  onClose,
  onOpenCreateServer,
  onOpenSettings,
}: CommandPaletteProps) {
  const { t } = useI18n();
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { focus, setPresence, toggleFocus } = useFocusControls();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<CommandPaletteTab>("all");
  const [pickedRowId, setActiveRowId] = useState<string | null>(null);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);

  const parsedQuery = useMemo(() => parseCommandPaletteQuery(query), [query]);

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedQuery(parsedQuery.searchTerm),
      COMMAND_PALETTE_DEBOUNCE_MS,
    );

    return () => window.clearTimeout(handle);
  }, [parsedQuery.searchTerm]);

  const search = useQuery({
    enabled: !parsedQuery.commandMode,
    queryFn: () => fetchHomeCommandSearch(debouncedQuery),
    queryKey: homeQueryKeys.commandSearch(debouncedQuery),
    retry: false,
    staleTime: 30_000,
  });

  const isRateLimited = search.error instanceof HomeClientError && search.error.status === 429;

  const allSections = useMemo(
    () =>
      buildPaletteSections({
        actions: selectCommandActions({
          focusActive: Boolean(focus?.active),
          query: parsedQuery.searchTerm,
          translate: t,
        }),
        results: search.data,
        translate: t,
      }),
    [focus?.active, parsedQuery.searchTerm, search.data, t],
  );

  const effectiveTab = parsedQuery.commandMode ? "command" : selectedTab;
  const tabs = useMemo(() => buildPaletteTabs(allSections, t), [allSections, t]);
  const sections = useMemo(
    () => filterPaletteSections(allSections, effectiveTab, t),
    [allSections, effectiveTab, t],
  );
  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const activeRowId =
    pickedRowId !== null && rowIds.includes(pickedRowId) ? pickedRowId : (rowIds[0] ?? null);
  const showRateLimit = shouldShowPaletteRateLimit({
    commandMode: parsedQuery.commandMode,
    isRateLimited,
    tab: effectiveTab,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!activeRowId) {
      return;
    }

    document.getElementById(`${listId}-${activeRowId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeRowId, listId]);

  const runAction = useCallback(
    (actionId: HomeCommandActionId) => {
      switch (actionId) {
        case "presence:menu":
          setPresenceMenuOpen(true);
          return;
        case "focus:start":
        case "focus:stop":
          toggleFocus();
          break;
        case "server:create":
          onOpenCreateServer();
          break;
        case "settings:open":
          onOpenSettings();
          break;
        default:
          break;
      }

      onClose();
    },
    [onClose, onOpenCreateServer, onOpenSettings, toggleFocus],
  );

  const activate = useCallback(
    (row: PaletteRow) => {
      if (row.actionId && !row.href) {
        runAction(row.actionId);
        return;
      }

      if (row.href) {
        router.push(row.href);
        onClose();
      }
    },
    [onClose, router, runAction],
  );

  const handleTabSelect = (tab: CommandPaletteTab) => {
    setSelectedTab(tab);
    setPresenceMenuOpen(false);
    setActiveRowId(null);

    if (parsedQuery.commandMode && tab !== "command") {
      setQuery(parsedQuery.searchTerm);
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();

      if (presenceMenuOpen) {
        setPresenceMenuOpen(false);
        return;
      }

      onClose();
      return;
    }

    if (event.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusable?.[0];
      const last = focusable?.[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }

      return;
    }

    if ((event.target as HTMLElement).tagName === "BUTTON") {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveRowId(moveActiveRow(rowIds, activeRowId, event.key === "ArrowDown" ? 1 : -1));
      return;
    }

    if (event.key === "Enter") {
      const row = rows.find((candidate) => candidate.id === activeRowId);

      if (row) {
        event.preventDefault();
        activate(row);
      }
    }
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--app-viewport-top,0px)] z-[85] flex items-start justify-center bg-[hsl(var(--backdrop)/0.62)]"
      data-testid="command-palette-overlay"
      onClick={onClose}
      style={{
        padding: `${pxToRem(commandPalette.topOffset)} ${pxToRem(
          commandPalette.viewportPaddingX,
        )} ${pxToRem(commandPalette.viewportPaddingBottom)}`,
      }}
    >
      <div
        aria-label={t("home.palette.title")}
        aria-modal="true"
        className="flex w-full flex-col overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))]"
        data-testid="command-palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{
          borderRadius: pxToRem(commandPalette.radius),
          boxShadow: `0 ${pxToRem(commandPalette.shadowY)} ${pxToRem(
            commandPalette.shadowBlur,
          )} -${pxToRem(commandPalette.shadowSpread)} hsl(var(--shadow-color))`,
          maxHeight: "100%",
          maxWidth: pxToRem(commandPalette.width),
        }}
      >
        <div
          className="flex shrink-0 items-center"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.6)`,
            gap: pxToRem(commandPalette.headerGap),
            padding: `${pxToRem(commandPalette.headerPaddingY)} ${pxToRem(
              commandPalette.headerPaddingX,
            )}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--primary))]"
            strokeWidth={commandPalette.inputIconStrokeWidth}
            style={{
              height: pxToEm(commandPalette.inputIconSize, commandPalette.inputFontSize),
              width: pxToEm(commandPalette.inputIconSize, commandPalette.inputFontSize),
            }}
          />
          <input
            aria-activedescendant={activeRowId ? `${listId}-${activeRowId}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded="true"
            aria-label={t("home.palette.placeholder")}
            className="min-w-0 flex-1 bg-transparent font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
            data-command-palette-input="true"
            data-testid="command-palette-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("home.palette.placeholder")}
            ref={inputRef}
            role="combobox"
            style={{ fontSize: pxToRem(commandPalette.inputFontSize), lineHeight: 1.2 }}
            type="text"
            value={query}
          />
          <span
            aria-hidden="true"
            className="shrink-0 bg-[hsl(var(--surface-soft))] font-semibold text-[hsl(var(--text-muted))]"
            style={{
              borderRadius: pxToRem(commandPalette.escapeRadius),
              fontSize: pxToRem(commandPalette.escapeFontSize),
              lineHeight: 1,
              padding: `${pxToRem(commandPalette.escapePaddingY)} ${pxToRem(
                commandPalette.escapePaddingX,
              )}`,
            }}
          >
            esc
          </span>
          <WindowCloseButton aria-label={t("home.palette.close")} onClick={onClose} />
        </div>

        <div
          aria-label={t("home.palette.tabsLabel")}
          className="flex shrink-0 flex-wrap"
          role="group"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.5)`,
            gap: pxToRem(commandPalette.tabsGap),
            padding: `${pxToRem(commandPalette.tabsPaddingY)} ${pxToRem(
              commandPalette.tabsPaddingX,
            )}`,
          }}
        >
          {tabs.map((tab) => {
            const selected = tab.id === effectiveTab;

            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "flex items-center whitespace-nowrap border font-semibold outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  selected
                    ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border)/0.6)] bg-transparent text-[hsl(var(--text-secondary))]",
                )}
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                style={{
                  borderRadius: pxToRem(commandPalette.tabRadius),
                  fontSize: pxToRem(commandPalette.tabFontSize),
                  gap: pxToRem(commandPalette.tabsGap + 1),
                  height: pxToRem(commandPalette.tabHeight),
                  lineHeight: 1,
                  padding: `0 ${pxToRem(commandPalette.tabPaddingX)}`,
                }}
                type="button"
              >
                {tab.label}
                {tab.count > 0 ? (
                  <span
                    className={
                      selected ? "text-[hsl(var(--primary)/0.8)]" : "text-[hsl(var(--text-muted))]"
                    }
                    style={{ fontSize: pxToRem(commandPalette.tabCountFontSize) }}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          aria-busy={search.isFetching && !parsedQuery.commandMode}
          className="min-h-0 flex-1 overflow-y-auto"
          id={listId}
          role="listbox"
          style={{
            maxHeight: pxToRem(commandPalette.listMaxHeight),
            padding: `${pxToRem(commandPalette.listPaddingTop)} ${pxToRem(
              commandPalette.listPaddingX,
            )} ${pxToRem(commandPalette.listPaddingBottom)}`,
          }}
        >
          {showRateLimit ? (
            <PaletteStatus testId="command-palette-rate-limited">
              {t("home.palette.rateLimited")}
            </PaletteStatus>
          ) : null}
          {rows.length === 0 && !showRateLimit ? (
            <PaletteStatus testId="command-palette-empty">{t("home.palette.empty")}</PaletteStatus>
          ) : (
            sections.map((section) => (
              <div aria-label={section.label} key={`${effectiveTab}:${section.kind}`} role="group">
                <div
                  className="flex items-center text-[hsl(var(--text-muted))]"
                  style={{
                    gap: pxToRem(commandPalette.groupLabelGap),
                    padding: `${pxToRem(commandPalette.groupLabelPaddingTop)} ${pxToRem(
                      commandPalette.groupLabelPaddingX,
                    )} ${pxToRem(commandPalette.groupLabelPaddingBottom)}`,
                  }}
                >
                  <span
                    className="uppercase"
                    style={{
                      fontSize: pxToRem(commandPalette.groupLabelFontSize),
                      fontWeight: 600,
                      letterSpacing: `${commandPalette.groupLabelTracking}em`,
                      lineHeight: 1,
                    }}
                  >
                    {section.label}
                  </span>
                  <span
                    className="text-[hsl(var(--text-muted)/0.75)]"
                    style={{
                      fontSize: pxToRem(commandPalette.groupLabelFontSize),
                      fontWeight: 600,
                    }}
                  >
                    {section.rows.length}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-[hsl(var(--border)/0.5)]" />
                </div>
                <div
                  className="flex flex-col"
                  style={{ gap: pxToRem(commandPalette.groupRowsGap) }}
                >
                  {section.rows.map((row) => (
                    <PaletteRowButton
                      active={row.id === activeRowId}
                      id={`${listId}-${row.id}`}
                      key={row.id}
                      onHover={() => setActiveRowId(row.id)}
                      onSelect={() => activate(row)}
                      row={row}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {presenceMenuOpen ? (
          <PresenceSubmenu
            onPick={(next) => {
              setPresence(next);
              setPresenceMenuOpen(false);
              onClose();
            }}
          />
        ) : null}

        <div
          className="flex shrink-0 items-center text-[hsl(var(--text-muted))]"
          style={{
            borderTop: `${hairline()} solid hsl(var(--border)/0.6)`,
            fontSize: pxToRem(commandPalette.footerFontSize),
            gap: pxToRem(commandPalette.footerGap),
            padding: `${pxToRem(commandPalette.footerPaddingY)} ${pxToRem(
              commandPalette.footerPaddingX,
            )}`,
          }}
        >
          <PaletteHint keys="↑ ↓">{t("home.palette.footer.navigate")}</PaletteHint>
          <PaletteHint keys="↵">{t("home.palette.footer.open")}</PaletteHint>
          <span className="ml-auto">
            <strong className="font-semibold text-[hsl(var(--text-secondary))]">&gt;</strong>{" "}
            {t("home.palette.footer.commandMode")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PaletteStatus({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p
      className="m-0 text-center text-[hsl(var(--text-muted))]"
      data-testid={testId}
      role="status"
      style={{
        fontSize: pxToRem(commandPalette.rowSublabelFontSize),
        padding: `${pxToRem(commandPalette.emptyPaddingY)} 0`,
      }}
    >
      {children}
    </p>
  );
}

function PaletteHint({ children, keys }: { children: React.ReactNode; keys: string }) {
  return (
    <span>
      <strong className="font-semibold text-[hsl(var(--text-secondary))]">{keys}</strong> {children}
    </span>
  );
}

function PresenceSubmenu({
  onPick,
}: {
  onPick: (next: (typeof PRESENCE_CHIPS)[number]["id"]) => void;
}) {
  const { t } = useI18n();

  return (
    <div
      className="grid shrink-0 grid-cols-2"
      data-testid="command-palette-presence"
      role="group"
      style={{
        borderTop: `${hairline()} solid hsl(var(--border)/0.5)`,
        gap: pxToRem(commandPalette.groupRowsGap),
        padding: `${pxToRem(commandPalette.listPaddingTop)} ${pxToRem(
          commandPalette.listPaddingX,
        )}`,
      }}
    >
      {PRESENCE_CHIPS.map((option) => (
        <button
          className="flex items-center text-left text-[hsl(var(--foreground))] outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft)/0.72)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          key={option.id}
          onClick={() => onPick(option.id)}
          style={{
            borderRadius: pxToRem(commandPalette.rowRadius),
            fontSize: pxToRem(commandPalette.rowTitleFontSize),
            gap: pxToRem(commandPalette.rowGap),
            padding: `${pxToRem(commandPalette.rowPaddingY)} ${pxToRem(
              commandPalette.rowPaddingX,
            )}`,
          }}
          type="button"
        >
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full"
            style={{
              background: `hsl(var(--${option.accent}))`,
              height: pxToRem(HOME_METRICS.presenceCard.chipDotSize),
              width: pxToRem(HOME_METRICS.presenceCard.chipDotSize),
            }}
          />
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}

function PaletteRowIcon({ row }: { row: PaletteRow }) {
  if (row.kind === "user" || row.kind === "dm") {
    return (
      <HomeAvatar
        avatarUrl={row.avatarUrl}
        displayName={row.label}
        fontSize={commandPalette.rowAvatarFontSize}
        size={commandPalette.rowAvatarSize}
        style={{ borderRadius: pxToRem(commandPalette.rowAvatarRadius) }}
      />
    );
  }

  let Icon: LucideIcon = Terminal;
  let tone = "primary";

  if (row.kind === "channel") {
    Icon = Hash;
  } else if (row.actionId === "nav:events") {
    Icon = CalendarDays;
    tone = "warning";
  } else if (row.actionId === null) {
    Icon = MessageCircle;
  }

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center"
      style={{
        background: `hsl(var(--${tone}) / 0.14)`,
        borderRadius: pxToRem(commandPalette.rowAvatarRadius),
        color: `hsl(var(--${tone}))`,
        height: pxToRem(commandPalette.rowAvatarSize),
        width: pxToRem(commandPalette.rowAvatarSize),
      }}
    >
      <Icon
        style={{
          height: pxToRem(commandPalette.closeIconSize),
          width: pxToRem(commandPalette.closeIconSize),
        }}
      />
    </span>
  );
}

function PaletteRowButton({
  active,
  id,
  onHover,
  onSelect,
  row,
}: {
  active: boolean;
  id: string;
  onHover: () => void;
  onSelect: () => void;
  row: PaletteRow;
}) {
  const { t } = useI18n();
  const presenceLabel = row.presence ? t(HOME_PRESENCE_LABEL_KEY[row.presence]) : null;
  const hint = row.actionId === "focus:start" ? row.sublabel : null;
  const sublabel = hint ? null : row.sublabel;

  return (
    <button
      aria-selected={active}
      className={cn(
        "flex w-full items-center border text-left outline-hidden transition-colors",
        active
          ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.1)]"
          : "border-transparent bg-transparent hover:bg-[var(--surface-hover)]",
      )}
      data-testid="command-palette-row"
      id={id}
      onClick={onSelect}
      onMouseEnter={onHover}
      role="option"
      style={{
        borderRadius: pxToRem(commandPalette.rowRadius),
        gap: pxToRem(commandPalette.rowGap),
        padding: `${pxToRem(commandPalette.rowPaddingY)} ${pxToRem(commandPalette.rowPaddingX)}`,
      }}
      tabIndex={-1}
      type="button"
    >
      <PaletteRowIcon row={row} />

      <span className="min-w-0 flex-1">
        <span
          className="flex min-w-0 items-center"
          style={{ gap: pxToRem(commandPalette.rowTitleGap) }}
        >
          <span
            className="min-w-0 truncate font-semibold text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(commandPalette.rowTitleFontSize),
              lineHeight: commandPalette.rowTitleLineHeight,
            }}
          >
            {row.label}
          </span>
          {presenceLabel ? (
            <span
              className="shrink-0 rounded-full bg-[hsl(var(--success)/0.16)] font-semibold text-[hsl(var(--success))]"
              style={{
                fontSize: pxToRem(commandPalette.rowTagFontSize),
                lineHeight: 1.4,
                padding: `${pxToRem(commandPalette.rowTagPaddingY)} ${pxToRem(
                  commandPalette.rowTagPaddingX,
                )}`,
              }}
            >
              {presenceLabel}
            </span>
          ) : null}
        </span>
        {sublabel ? (
          <span
            className="block truncate text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(commandPalette.rowSublabelFontSize),
              lineHeight: commandPalette.rowSublabelLineHeight,
              marginTop: pxToRem(commandPalette.rowSublabelMarginTop),
            }}
          >
            {sublabel}
          </span>
        ) : null}
      </span>

      {hint ? (
        <span
          className="shrink-0 bg-[hsl(var(--surface-soft))] font-semibold text-[hsl(var(--text-muted))]"
          style={{
            borderRadius: pxToRem(commandPalette.rowHintRadius),
            fontSize: pxToRem(commandPalette.rowHintFontSize),
            lineHeight: 1,
            padding: `${pxToRem(commandPalette.rowHintPaddingY)} ${pxToRem(
              commandPalette.rowHintPaddingX,
            )}`,
          }}
        >
          {hint}
        </span>
      ) : null}
    </button>
  );
}

export default CommandPalette;
