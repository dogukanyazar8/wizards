"use client";

import React from "react";
import { Download, Link2 } from "lucide-react";
import type { ProfileTint, SharedFileDTO, SharedLinkDTO } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { formatSharedFileSize } from "@/lib/dm/shared-media-client";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";
import { cn } from "@/lib/utils";

/**
 * SPEC-MESAJLAR §15.5 — the two list rows the Medya tab repeats: a shared file and a
 * shared link. `Mesajlar.dc.html` `L1146–L1183` draws them with the same anatomy
 * (32 tile · title · muted sub-line), so they live in one file and share one row shell.
 *
 * The file row is **not** a single `button`: the design puts a download control inside
 * it, and an `a` nested in a `button` is invalid HTML — the browser drops one of them and
 * the keyboard user loses whichever it dropped. The row is therefore a container with two
 * siblings: a `button` that carries the whole text block, and a real `a[download]`.
 *
 * The link row **is** a single `a`. A link that is a `button` loses middle-click, "open in
 * new tab" and the status-bar preview, and tells a screen reader it is a control when it
 * is a destination.
 */

const { profilePanel } = MESSAGES_METRICS;

/**
 * The extension tile's colour. §15.5 paints `PDF` and `FIG` differently and the DTO
 * carries no tint column, so the tint is derived from the extension — the same extension
 * is the same colour in every conversation, which is the only property that matters here.
 *
 * Unknown extensions fall to `neutral` rather than to a hash rotation: a made-up colour
 * for `.xyz` would read as a category the product does not have.
 */
const EXTENSION_TINT: Readonly<Record<string, ProfileTint>> = Object.freeze({
  "7z": "warning",
  csv: "success",
  doc: "primary",
  docx: "primary",
  fig: "primary",
  gz: "warning",
  key: "warning",
  md: "neutral",
  numbers: "success",
  pages: "primary",
  pdf: "danger",
  ppt: "warning",
  pptx: "warning",
  rar: "warning",
  sketch: "primary",
  txt: "neutral",
  xls: "success",
  xlsx: "success",
  zip: "warning",
});

/** Longer than this and the 32px tile stops being able to hold the label. */
const EXTENSION_LABEL_MAX = 4;

export function resolveExtensionTint(extension: string): ProfileTint {
  return EXTENSION_TINT[extension.trim().toLowerCase()] ?? "neutral";
}

/**
 * `pdf` → `PDF`.
 *
 * Uppercased **without** a locale: `toLocaleUpperCase("tr")` turns `fig` into `FİG`, and
 * a file extension is not Turkish text. The rest of this panel deliberately uppercases in
 * Turkish; this one value must not.
 */
export function formatExtensionLabel(extension: string): string {
  return extension.trim().replace(/^\./, "").slice(0, EXTENSION_LABEL_MAX).toUpperCase();
}

export type SharedTimestampLabels = {
  /** `Bugün` / `bugün` — the caller picks the casing its line needs. */
  today: string;
  /** `Dün` / `dün`. */
  yesterday: string;
};

/**
 * `Dün 17:04` · `12 Ağu` · `12 Ağu 2025`.
 *
 * `now` is a parameter, not `new Date()` read inside: a clock read during render cannot be
 * frozen in a test, and a session that crosses midnight would silently stop saying `Dün`.
 * The two day words come from the dictionary because the caller decides the casing —
 * §15.4's member row prints `Çevrimdışı · dün 22:10`, §15.5's file row prints `Dün 17:04`.
 */
export function formatSharedTimestamp(
  value: string,
  now: Date,
  locale: string,
  labels: SharedTimestampLabels,
): string {
  const at = new Date(value);

  if (Number.isNaN(at.getTime())) {
    return "";
  }

  const dayDelta = countCalendarDaysBetween(at, now);

  if (dayDelta === 0 || dayDelta === 1) {
    const clock = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);

    return `${dayDelta === 0 ? labels.today : labels.yesterday} ${clock}`;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(at);
}

function countCalendarDaysBetween(at: Date, now: Date): number {
  const startOfAt = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return Math.round((startOfNow - startOfAt) / 86_400_000);
}

/**
 * `https://whispr.app/changelog` → `whispr.app/changelog`.
 *
 * §15.5 prints the host **and** the path (`figma.com/file/kritik`), so the sub-line is the
 * URL with its scheme removed rather than `SharedLinkDTO.host` — on a bare domain the two
 * are the same string, and on a deep link only this one is what the design shows.
 */
export function toLinkDisplayUrl(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "");
}

/** Same-origin, so `download` is honoured; the CDN URL would ignore the attribute. */
function toDownloadHref(attachmentId: string): string {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`;
}

const ROW_SHELL_CLASS =
  "flex min-w-0 items-center border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] transition-colors hover:border-[hsl(var(--primary)/0.45)]";

function rowShellStyle(): React.CSSProperties {
  return {
    borderRadius: pxToRem(profilePanel.fileRowRadius),
    borderWidth: hairline(),
    gap: pxToRem(profilePanel.fileRowGap),
    padding: pxToRem(profilePanel.fileRowPadding),
  };
}

export type ProfileFileRowProps = {
  item: SharedFileDTO;
  /** Injected so the `Dün 17:04` boundary is decidable in a test. */
  now?: Date | undefined;
  /** Opens the message the file was posted in. */
  onOpen: (item: SharedFileDTO) => void;
};

export function ProfileFileRow({ item, now, onOpen }: ProfileFileRowProps) {
  const { locale, t } = useI18n();
  const tint = resolveExtensionTint(item.extension);
  const size = formatSharedFileSize(item.sizeBytes, locale);
  const when = formatSharedTimestamp(item.createdAt, now ?? new Date(), locale, {
    today: t("chat.date.today"),
    yesterday: t("chat.date.yesterday"),
  });
  const meta = [size, when].filter(Boolean).join(" · ");

  return (
    <div className={ROW_SHELL_CLASS} data-testid="profile-file-row" style={rowShellStyle()}>
      <button
        className="flex min-w-0 flex-1 items-center text-left outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="profile-file-row-open"
        onClick={() => onOpen(item)}
        style={{
          borderRadius: pxToRem(profilePanel.fileTileRadius),
          gap: pxToRem(profilePanel.fileRowGap),
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
          style={{
            background: profileTintSurface(tint),
            borderRadius: pxToRem(profilePanel.fileTileRadius),
            color: profileTintForeground(tint),
            fontSize: pxToRem(profilePanel.fileTileFontSize),
            fontWeight: 600,
            height: pxToRem(profilePanel.fileTileSize),
            width: pxToRem(profilePanel.fileTileSize),
          }}
        >
          {formatExtensionLabel(item.extension)}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(profilePanel.fileNameFontSize),
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {item.name}
          </span>
          <span
            className="block truncate text-[hsl(var(--text-muted))]"
            data-testid="profile-file-row-meta"
            style={{
              fontSize: pxToRem(profilePanel.fileMetaFontSize),
              marginTop: pxToRem(profilePanel.fileMetaMarginTop),
            }}
          >
            {meta}
          </span>
        </span>
      </button>

      {/*
        A real `a[download]` rather than a scripted blob save: the browser owns the
        download UI, the middle-click and "save link as" gestures keep working, and the
        row survives a page that has no JavaScript yet.
      */}
      <a
        aria-label={`${t("messages.profile.media.download")} · ${item.name}`}
        className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))] outline-hidden transition-colors hover:text-[hsl(var(--foreground))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="profile-file-row-download"
        download={item.name}
        href={toDownloadHref(item.attachmentId)}
        rel="noopener noreferrer"
        style={{
          borderRadius: pxToRem(profilePanel.fileTileRadius),
          height: pxToRem(profilePanel.fileTileSize),
          width: pxToRem(profilePanel.fileDownloadIconSize),
        }}
      >
        <Download
          aria-hidden="true"
          style={{
            height: pxToRem(profilePanel.fileDownloadIconSize),
            width: pxToRem(profilePanel.fileDownloadIconSize),
          }}
        />
      </a>
    </div>
  );
}

export type ProfileLinkRowProps = {
  item: SharedLinkDTO;
};

export function ProfileLinkRow({ item }: ProfileLinkRowProps) {
  const display = toLinkDisplayUrl(item.url);
  const hasTitle = Boolean(item.title);

  return (
    <a
      className={cn(
        ROW_SHELL_CLASS,
        "outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
      )}
      data-testid="profile-link-row"
      href={item.url}
      // `noopener` is the security half (the opened tab must not reach `window.opener`);
      // `noreferrer` is the privacy half. A shared link is arbitrary third-party content,
      // so both are non-negotiable.
      rel="noopener noreferrer"
      style={rowShellStyle()}
      target="_blank"
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))]"
        style={{
          borderRadius: pxToRem(profilePanel.fileTileRadius),
          height: pxToRem(profilePanel.fileTileSize),
          width: pxToRem(profilePanel.fileTileSize),
        }}
      >
        <Link2
          style={{
            height: pxToRem(profilePanel.fileDownloadIconSize),
            width: pxToRem(profilePanel.fileDownloadIconSize),
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          data-testid="profile-link-row-title"
          style={{
            fontSize: pxToRem(profilePanel.fileNameFontSize),
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {item.title ?? display}
        </span>
        {/*
          Ş3's report §3: `title` is read from the markdown link label, so a bare URL
          carries none. The host then becomes the row's only line rather than sitting
          under an empty heading.
        */}
        {hasTitle ? (
          <span
            className="block truncate text-[hsl(var(--text-muted))]"
            data-testid="profile-link-row-host"
            style={{
              fontSize: pxToRem(profilePanel.fileMetaFontSize),
              marginTop: pxToRem(profilePanel.fileMetaMarginTop),
            }}
          >
            {display}
          </span>
        ) : null}
      </span>
    </a>
  );
}
