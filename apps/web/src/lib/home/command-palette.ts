import { toRelativeAppHref } from "@/lib/home/href";
import type { HomeTranslate } from "@/lib/home/presentation";
import type { HomeCommandGroupKind, HomePresence, SearchCommandResponse } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5 §5. Everything the command palette decides, with no React
 * and no DOM in sight: which commands are offered, how the groups are ordered,
 * which result hrefs may become links, and where the arrow keys land.
 *
 * Two security rules from §5.4 live here rather than in the component:
 *
 * - **Only in-app paths.** A result href is run through `toRelativeAppHref`
 *   before it can reach an anchor; anything else is dropped from the list, not
 *   rendered as an inert row. The palette never opens an external link.
 * - **The command list is not a security boundary.** Hiding `Sunucu oluştur`
 *   from someone who may not create servers is courtesy; the route it opens
 *   still enforces it (§5.1.8).
 */

/** §5.2 — one request per pause, not one per keystroke. */
export const COMMAND_PALETTE_DEBOUNCE_MS = 200;

/** §5.2 — the fixed group order. `command` is always last. */
const GROUP_ORDER: readonly HomeCommandGroupKind[] = ["server", "channel", "dm", "user", "command"];

/** §1 — grup başlıkları sözlükten; bu tablo yalnız hangi anahtarın okunacağını söyler. */
const GROUP_LABEL_KEY: Record<HomeCommandGroupKind, string> = {
  channel: "home.palette.group.channel",
  command: "home.palette.group.command",
  dm: "home.palette.group.dm",
  server: "home.palette.group.server",
  user: "home.palette.group.user",
};

export type HomeCommandActionId =
  | "focus:start"
  | "focus:stop"
  | "nav:events"
  | "nav:inbox"
  | "nav:mentions"
  | "presence:menu"
  | "server:create"
  | "settings:open";

export type HomeCommandAction = {
  /** Only navigation commands carry one; the rest run in-app effects. */
  readonly href: string | null;
  readonly id: HomeCommandActionId;
  /** Faz 7: çevrilmiş etiket. Kaynağı `HOME_COMMAND_ACTIONS`taki anahtardır. */
  readonly label: string;
  /** Why the command is listed at all — shown as the row's second line. */
  readonly sublabel: string | null;
};

export type CommandPaletteCapabilities = {
  readonly canCreateServer: boolean;
  readonly focusActive: boolean;
};

/**
 * §5.3 — the seven static commands.
 *
 * `/mentions` and `/inbox` were pointed at their real routes before those
 * screens existed — the Faz 2 decision for the nav rows, followed here rather
 * than inventing a second answer. Faz 6 wrote the screens, so the stand-in
 * period is over and every command lands on a real surface.
 */
export const HOME_COMMAND_ACTIONS: readonly {
  readonly href: string | null;
  readonly id: HomeCommandActionId;
  readonly labelKey: string;
  readonly requires?: keyof CommandPaletteCapabilities | "focusClosed";
  readonly sublabelKey: string | null;
}[] = [
  {
    href: null,
    id: "presence:menu",
    labelKey: "home.palette.command.presence",
    sublabelKey: "home.palette.command.presenceHint",
  },
  {
    href: null,
    id: "focus:start",
    labelKey: "home.palette.command.focusStart",
    requires: "focusClosed",
    sublabelKey: "home.palette.command.focusStartHint",
  },
  {
    href: null,
    id: "focus:stop",
    labelKey: "home.palette.command.focusStop",
    requires: "focusActive",
    sublabelKey: null,
  },
  {
    href: null,
    id: "server:create",
    labelKey: "home.palette.command.createServer",
    requires: "canCreateServer",
    sublabelKey: null,
  },
  { href: null, id: "settings:open", labelKey: "home.palette.command.settings", sublabelKey: null },
  {
    href: "/mentions",
    id: "nav:mentions",
    labelKey: "home.palette.command.mentions",
    sublabelKey: null,
  },
  { href: "/inbox", id: "nav:inbox", labelKey: "home.palette.command.inbox", sublabelKey: null },
  { href: "/events", id: "nav:events", labelKey: "home.palette.command.events", sublabelKey: null },
];

/** Turkish-aware, diacritic-blind: "ODAK" has to find "Odak modunu başlat". */
function fold(value: string): string {
  return value.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Faz 7: arama, kullanıcının **gördüğü** etikette yapılır; `translate` bu yüzden bir parametredir.
 * Fonksiyon saf kalır (aynı girdi → aynı çıktı) ve testte sahte bir sözlükle koşulabilir.
 */
export function selectCommandActions(input: {
  canCreateServer?: boolean;
  focusActive: boolean;
  query: string;
  translate: HomeTranslate;
}): HomeCommandAction[] {
  const capabilities: CommandPaletteCapabilities = {
    canCreateServer: input.canCreateServer ?? true,
    focusActive: input.focusActive,
  };
  const term = fold(input.query.trim());

  return HOME_COMMAND_ACTIONS.filter((action) => {
    if (action.requires === "focusClosed" && capabilities.focusActive) {
      return false;
    }

    if (action.requires === "focusActive" && !capabilities.focusActive) {
      return false;
    }

    if (action.requires === "canCreateServer" && !capabilities.canCreateServer) {
      return false;
    }

    return term.length === 0 || fold(input.translate(action.labelKey)).includes(term);
  }).map(({ href, id, labelKey, sublabelKey }) => ({
    href,
    id,
    label: input.translate(labelKey),
    sublabel: sublabelKey === null ? null : input.translate(sublabelKey),
  }));
}

export type PaletteRow = {
  readonly actionId: HomeCommandActionId | null;
  readonly avatarUrl: string | null;
  readonly href: string | null;
  /** `<kind>:<id>`, unique across the whole list — `aria-activedescendant` names it. */
  readonly id: string;
  readonly kind: HomeCommandGroupKind;
  readonly label: string;
  readonly presence: HomePresence | null;
  readonly sublabel: string | null;
};

export type PaletteSection = {
  readonly kind: HomeCommandGroupKind;
  readonly label: string;
  readonly rows: readonly PaletteRow[];
};

export function buildPaletteSections(input: {
  actions: readonly HomeCommandAction[];
  results: SearchCommandResponse | undefined;
  translate: HomeTranslate;
}): PaletteSection[] {
  const byKind = new Map<HomeCommandGroupKind, PaletteRow[]>();

  for (const group of input.results?.groups ?? []) {
    const rows = group.items.flatMap((item): PaletteRow[] => {
      const href = toRelativeAppHref(item.href);

      // A result the guard refuses is not rendered at all: an unclickable row
      // in a keyboard list is a trap, and there is nothing safe to do with it.
      if (href === null) {
        return [];
      }

      return [
        {
          actionId: null,
          avatarUrl: item.avatarUrl,
          href,
          id: `${group.kind}:${item.id}`,
          kind: group.kind,
          label: item.label,
          presence: item.presence,
          sublabel: item.sublabel,
        },
      ];
    });

    if (rows.length > 0) {
      byKind.set(group.kind, [...(byKind.get(group.kind) ?? []), ...rows]);
    }
  }

  if (input.actions.length > 0) {
    byKind.set(
      "command",
      input.actions.map((action) => ({
        actionId: action.id,
        avatarUrl: null,
        href: action.href,
        id: `command:${action.id}`,
        kind: "command" as const,
        label: action.label,
        presence: null,
        sublabel: action.sublabel,
      })),
    );
  }

  return GROUP_ORDER.flatMap((kind) => {
    const rows = byKind.get(kind);
    return rows && rows.length > 0
      ? [{ kind, label: input.translate(GROUP_LABEL_KEY[kind]), rows }]
      : [];
  });
}

/** §5.2 — `↑`/`↓` wrap; an id that no longer exists lands on the first row. */
export function moveActiveRow(
  rowIds: readonly string[],
  activeId: string | null,
  delta: 1 | -1,
): string | null {
  if (rowIds.length === 0) {
    return null;
  }

  const current = activeId === null ? -1 : rowIds.indexOf(activeId);
  if (current === -1) {
    return rowIds[0]!;
  }

  const next = (current + delta + rowIds.length) % rowIds.length;

  return rowIds[next]!;
}

type ShortcutEvent = {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
};

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * §5.1 — one global listener, and it stays quiet while somebody is typing.
 *
 * The palette's own input is the exception: with it excluded too, a second
 * `⌘K` while the palette is open would do nothing, and §9 says the second press
 * has to close it rather than open a second one.
 */
export function isCommandPaletteShortcut(event: ShortcutEvent): boolean {
  if (event.key.toLowerCase() !== "k") {
    return false;
  }

  if (event.altKey === true || event.shiftKey === true) {
    return false;
  }

  if (event.metaKey !== true && event.ctrlKey !== true) {
    return false;
  }

  const target = event.target as
    | { dataset?: Record<string, string>; isContentEditable?: boolean; tagName?: string }
    | null
    | undefined;

  if (!target) {
    return true;
  }

  if (target.dataset?.commandPaletteInput === "true") {
    return true;
  }

  return !(TYPING_TAGS.has(target.tagName ?? "") || target.isContentEditable === true);
}
