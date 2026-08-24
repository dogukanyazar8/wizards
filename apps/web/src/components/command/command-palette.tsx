"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { useFocusControls } from "@/components/providers/focus-controls-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT, HomeAvatar, PresenceDot } from "@/components/home/home-primitives";
import { PRESENCE_CHIPS } from "@/components/home/home-presence-card";
import { HomeClientError, fetchHomeCommandSearch, homeQueryKeys } from "@/lib/home/client";
import {
  COMMAND_PALETTE_DEBOUNCE_MS,
  buildPaletteSections,
  moveActiveRow,
  selectCommandActions,
  type HomeCommandActionId,
  type PaletteRow,
} from "@/lib/home/command-palette";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToEm, pxToRem } from "@/lib/home/metrics";
import { cn } from "@/lib/utils";

/**
 * Komut paleti — `06-faz5` §5.
 *
 * Bu dosya `dynamic()` ile yükleniyor (`command-palette-provider.tsx`): palet
 * açılmadan ne bu kod ne de sorgusu bundle'a giriyor (§5.1, §7).
 *
 * Overlay mevcut portal deseniyle çiziliyor — `Modal`/`ContextMenu` ile aynı
 * `createPortal(..., document.body)`; yeni bir portal mekanizması kurulmadı.
 * `Modal` bileşeninin kendisi kullanılmadı çünkü palet bir `listbox` taşıyor:
 * `Modal`'ın Tab tuzağı ile `aria-activedescendant` gezinmesi aynı anda iki farklı
 * odak modeli olurdu.
 *
 * Güvenlik (§5.4): sonuç href'leri `buildPaletteSections` içinde göreli yol
 * kapısından geçiyor, arama sorgusu URL'e **yazılmıyor** (geçmişte kalırdı) ve
 * 429 sakin bir satırla karşılanıp istek tekrarlanmıyor.
 */

const { commandPalette } = HOME_METRICS;

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
  const [pickedRowId, setActiveRowId] = useState<string | null>(null);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);

  // §5.2 — one request per pause. The trailing edge is what the endpoint sees.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), COMMAND_PALETTE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [query]);

  const search = useQuery({
    queryFn: () => fetchHomeCommandSearch(debouncedQuery),
    queryKey: homeQueryKeys.commandSearch(debouncedQuery),
    // §5.4 — a refused request is not repeated; the user is told and left alone.
    retry: false,
    staleTime: 30_000,
  });

  const isRateLimited = search.error instanceof HomeClientError && search.error.status === 429;

  const sections = useMemo(
    () =>
      buildPaletteSections({
        actions: selectCommandActions({
          focusActive: Boolean(focus?.active),
          query,
          translate: t,
        }),
        results: search.data,
        translate: t,
      }),
    [focus?.active, query, search.data, t],
  );

  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  /**
   * The highlight follows the list. Derived rather than synced: when the results
   * change under it, the id it pointed at simply stops matching and the first row
   * takes over — no effect, no render that shows a stale highlight first.
   */
  const activeRowId =
    pickedRowId !== null && rowIds.includes(pickedRowId) ? pickedRowId : (rowIds[0] ?? null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runAction = useCallback(
    (actionId: HomeCommandActionId) => {
      switch (actionId) {
        case "presence:menu":
          // Stays open: the submenu is the command's whole effect.
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();

      // Two panels never stay open at once (§6): the submenu closes first.
      if (presenceMenuOpen) {
        setPresenceMenuOpen(false);
        return;
      }

      onClose();
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

      return;
    }

    // Focus trap: the palette owns Tab while it is open.
    if (event.key === "Tab") {
      event.preventDefault();
      setActiveRowId(moveActiveRow(rowIds, activeRowId, event.shiftKey ? -1 : 1));
    }
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex justify-center bg-[hsl(var(--background)/0.62)] backdrop-blur-md"
      data-testid="command-palette-overlay"
      onClick={onClose}
      style={{ paddingTop: pxToRem(commandPalette.topOffset) }}
    >
      <div
        aria-label={t("home.palette.title")}
        aria-modal="true"
        className="app-overlay flex max-h-[70dvh] w-full flex-col overflow-hidden shadow-[0_28px_70px_hsl(var(--shadow-color)/0.18)] backdrop-blur-2xl"
        data-testid="command-palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{
          borderRadius: pxToRem(commandPalette.radius),
          maxWidth: pxToRem(commandPalette.width),
          padding: pxToRem(commandPalette.padding),
        }}
      >
        <div
          className="flex shrink-0 items-center"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.5)`,
            gap: pxToRem(commandPalette.inputGap),
            height: pxToRem(commandPalette.inputHeight),
            padding: `0 ${pxToRem(commandPalette.inputPaddingX)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(commandPalette.inputIconSize, commandPalette.inputFontSize),
              width: pxToEm(commandPalette.inputIconSize, commandPalette.inputFontSize),
            }}
          />
          <input
            aria-activedescendant={activeRowId ? `${listId}-${activeRowId}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-label={t("home.palette.placeholder")}
            className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
            data-command-palette-input="true"
            data-testid="command-palette-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("home.palette.placeholder")}
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            style={{ fontSize: pxToRem(commandPalette.inputFontSize) }}
            type="text"
            value={query}
          />
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          id={listId}
          role="listbox"
          style={{ maxHeight: pxToRem(commandPalette.listMaxHeight) }}
        >
          {isRateLimited ? (
            <p
              className="m-0 text-center text-[hsl(var(--text-muted))]"
              data-testid="command-palette-rate-limited"
              role="status"
              style={{
                fontSize: pxToRem(HOME_TYPE_SCALE.contextLabel.size),
                padding: `${pxToRem(commandPalette.emptyPaddingY)} 0`,
              }}
            >
              {t("home.palette.rateLimited")}
            </p>
          ) : rows.length === 0 ? (
            <p
              className="m-0 text-center text-[hsl(var(--text-muted))]"
              data-testid="command-palette-empty"
              style={{
                fontSize: pxToRem(HOME_TYPE_SCALE.contextLabel.size),
                padding: `${pxToRem(commandPalette.emptyPaddingY)} 0`,
              }}
            >
              {t("home.palette.empty")}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.kind} role="group">
                <div
                  className={cn(DISPLAY_FONT, "text-[hsl(var(--text-muted))]")}
                  style={{
                    fontSize: pxToRem(HOME_TYPE_SCALE.sectionLabel.size),
                    fontWeight: HOME_TYPE_SCALE.sectionLabel.weight,
                    letterSpacing: HOME_TYPE_SCALE.sectionLabel.tracking,
                    margin: `${pxToRem(commandPalette.groupLabelMarginTop)} 0 ${pxToRem(
                      commandPalette.groupLabelMarginBottom,
                    )}`,
                    padding: `0 ${pxToRem(commandPalette.groupLabelPaddingX)}`,
                    textTransform: HOME_TYPE_SCALE.sectionLabel.transform,
                  }}
                >
                  {section.label}
                </div>
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
      </div>
    </div>,
    document.body,
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
      className="shrink-0"
      data-testid="command-palette-presence"
      role="group"
      style={{
        borderTop: `${hairline()} solid hsl(var(--border)/0.5)`,
        paddingTop: pxToRem(commandPalette.groupLabelMarginBottom),
      }}
    >
      {/* Kartın kendi dördü, aynı sırada — ikinci bir presence listesi tanımlanmadı. */}
      {PRESENCE_CHIPS.map((option) => (
        <button
          className="flex w-full items-center text-left text-[hsl(var(--foreground))] outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft)/0.72)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          key={option.id}
          onClick={() => onPick(option.id)}
          style={{
            borderRadius: pxToRem(commandPalette.rowRadius),
            fontSize: pxToRem(HOME_TYPE_SCALE.cardRowName.size),
            gap: pxToRem(commandPalette.rowGap),
            height: pxToRem(commandPalette.rowHeight),
            padding: `0 ${pxToRem(commandPalette.rowPaddingX)}`,
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
  return (
    <button
      aria-selected={active}
      className={cn(
        "flex w-full items-center text-left outline-hidden transition-colors",
        active ? "bg-[hsl(var(--surface-soft)/0.72)]" : "bg-transparent",
      )}
      data-testid="command-palette-row"
      id={id}
      onClick={onSelect}
      onMouseEnter={onHover}
      role="option"
      style={{
        borderRadius: pxToRem(commandPalette.rowRadius),
        gap: pxToRem(commandPalette.rowGap),
        minHeight: pxToRem(commandPalette.rowHeight),
        padding: `0 ${pxToRem(commandPalette.rowPaddingX)}`,
      }}
      tabIndex={-1}
      type="button"
    >
      {row.avatarUrl !== null || row.presence !== null ? (
        <span className="relative shrink-0">
          <HomeAvatar
            avatarUrl={row.avatarUrl}
            displayName={row.label}
            fontSize={commandPalette.rowAvatarFontSize}
            size={commandPalette.rowAvatarSize}
          />
          {row.presence ? (
            <PresenceDot
              borderColor="hsl(var(--surface-card))"
              borderWidth={1}
              presence={row.presence}
              size={HOME_METRICS.presenceCard.chipDotSize}
            />
          ) : null}
        </span>
      ) : null}

      <span
        className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
        style={{ fontSize: pxToRem(HOME_TYPE_SCALE.cardRowName.size) }}
      >
        {row.label}
      </span>

      {row.sublabel ? (
        <span
          className="shrink-0 truncate text-[hsl(var(--text-muted))]"
          style={{ fontSize: pxToRem(commandPalette.rowSublabelFontSize) }}
        >
          {row.sublabel}
        </span>
      ) : null}
    </button>
  );
}

export default CommandPalette;
