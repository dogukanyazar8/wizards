"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { FolderPlus, Hash, Link2, LogOut, Settings } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";

/**
 * Sunucu menüsü — SPEC-SUNUCU §2.2.
 *
 * **Tam olarak beş satır** ve sırası sabit: davet · kategori · kanal · ayarlar · ayrıl.
 * Sıra veriden okunur (`SERVER_MENU_ROWS`) çünkü yetki kapısı satırları **eler**, gizlemez:
 * 00 §5 "yetkisi olmayana hiç render edilmez" diyor ve `display:none` bir satırı DOM'da
 * bırakır — ekran okuyucu onu hâlâ sayar, `document.querySelector` hâlâ bulur.
 * `buildServerMenuRows` bu yüzden saf bir fonksiyon: negatif test menüyü çizmeden de
 * "yetkisiz üyede üç satır yok" diyebiliyor.
 *
 * `z-index` sözlükten (`sidebar.menuZIndex = 30`) geliyor, `useLayerStack`'ten değil: menü
 * kenar çubuğunun **kendi** yığınlama bağlamında yaşıyor (aside `position:relative`), K11'in
 * 60/70/80 merdiveni ise kabuk düzeyindeki kaplamalar için. Menünün K11'e borcu sırayı
 * bozmamak: açıldığında arama popover'ı kapanır (tek açılır kuralı) ve `Esc` en üstteki
 * katmanı — burada menüyü — kapatır.
 */

export type ServerMenuRowKey = "invite" | "createCategory" | "createChannel" | "settings" | "leave";

type ServerMenuRowTone = "primary" | "secondary" | "danger";

type ServerMenuRowDefinition = {
  /** Satırın görünmesi için gereken yetki; `null` ise herkese çizilir. */
  gate: "manageChannels" | "manageServer" | null;
  key: ServerMenuRowKey;
  labelKey: string;
  tone: ServerMenuRowTone;
};

/** SPEC §2.2 tablosunun satır sırası. Beş satır, tek kaynak. */
export const SERVER_MENU_ROWS: readonly ServerMenuRowDefinition[] = [
  { gate: null, key: "invite", labelKey: "server.menu.invite", tone: "primary" },
  {
    gate: "manageChannels",
    key: "createCategory",
    labelKey: "server.menu.createCategory",
    tone: "secondary",
  },
  {
    gate: "manageChannels",
    key: "createChannel",
    labelKey: "server.menu.createChannel",
    tone: "secondary",
  },
  { gate: "manageServer", key: "settings", labelKey: "server.menu.settings", tone: "secondary" },
  { gate: null, key: "leave", labelKey: "server.menu.leave", tone: "danger" },
];

export type ServerMenuPermissions = {
  canManageChannels: boolean;
  canManageServer: boolean;
};

/**
 * İzleyicinin göreceği satırlar. Yetkisiz üyede geriye **iki** satır kalır
 * (`Davet bağlantısı`, `Sunucudan ayrıl`); kalan üçü hiç üretilmez.
 */
export function buildServerMenuRows(
  permissions: ServerMenuPermissions,
): readonly ServerMenuRowDefinition[] {
  return SERVER_MENU_ROWS.filter((row) => {
    if (row.gate === "manageChannels") {
      return permissions.canManageChannels;
    }

    if (row.gate === "manageServer") {
      return permissions.canManageServer;
    }

    return true;
  });
}

const ROW_ICONS: Record<ServerMenuRowKey, React.ComponentType<{ style?: React.CSSProperties }>> = {
  createCategory: FolderPlus,
  createChannel: Hash,
  invite: Link2,
  leave: LogOut,
  settings: Settings,
};

const ROW_COLORS: Record<ServerMenuRowTone, string> = {
  danger: "hsl(var(--danger))",
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--text-secondary))",
};

export type ServerMenuProps = {
  canManageChannels: boolean;
  canManageServer: boolean;
  /** `Davet bağlantısı` satırının sağındaki ipucu — varsayılan davet süresi (SPEC: `7 gün`). */
  inviteHint: string;
  onClose: () => void;
  onSelect: (key: ServerMenuRowKey) => void;
  /** Menüyü açan düğme; dış tıklama onu "dışarısı" saymaz, kapanış oraya odak döndürür. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function ServerMenu({
  canManageChannels,
  canManageServer,
  inviteHint,
  onClose,
  onSelect,
  triggerRef,
}: ServerMenuProps) {
  const { t } = useI18n();
  const { sidebar } = SERVER_METRICS;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rows = useMemo(
    () => buildServerMenuRows({ canManageChannels, canManageServer }),
    [canManageChannels, canManageServer],
  );

  useEffect(() => {
    itemRefs.current[0]?.focus();

    // Kapanışta odak tetikleyiciye döner (00 §8, SPEC §12). Sökülme anında okunur, çünkü
    // kapanışın üç yolu var (`Esc`, dış tıklama, satır seçimi) ve üçü de aynı yere dönmeli.
    // `channel-search-popover.tsx` aynı deseni kullanıyor; iki açılır tek kuralı paylaşır.
    const trigger = triggerRef;

    return () => {
      trigger.current?.focus();
    };
  }, [triggerRef]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (containerRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [onClose, triggerRef]);

  const focusItem = useCallback(
    (index: number) => {
      const count = rows.length;
      if (count === 0) {
        return;
      }

      itemRefs.current[((index % count) + count) % count]?.focus();
    },
    [rows.length],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusItem(rows.length - 1);
    }
  };

  return (
    <div
      aria-label={t("server.menu.label")}
      className="absolute"
      data-testid="server-menu"
      ref={containerRef}
      role="menu"
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(sidebar.menuRadius),
        boxShadow: `${pxToRem(sidebar.menuShadow.x)} ${pxToRem(sidebar.menuShadow.y)} ${pxToRem(
          sidebar.menuShadow.blur,
        )} ${pxToRem(sidebar.menuShadow.spread)} hsl(var(--shadow-color))`,
        left: pxToRem(sidebar.menuInsetX),
        padding: pxToRem(sidebar.menuPadding),
        right: pxToRem(sidebar.menuInsetX),
        top: pxToRem(sidebar.menuTop),
        zIndex: sidebar.menuZIndex,
      }}
    >
      {rows.map((row, index) => {
        const Icon = ROW_ICONS[row.key];

        return (
          <button
            className="flex w-full items-center text-left transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid={`server-menu-${row.key}`}
            key={row.key}
            onClick={() => onSelect(row.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            role="menuitem"
            style={{
              borderRadius: pxToRem(sidebar.menuRowRadius),
              color: ROW_COLORS[row.tone],
              fontSize: pxToRem(sidebar.menuRowFontSize),
              fontWeight: 500,
              gap: pxToRem(sidebar.menuRowGap),
              lineHeight: 1,
              padding: `${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(sidebar.menuRowPaddingX)}`,
            }}
            type="button"
          >
            <span
              className="grid flex-none place-items-center"
              style={{
                height: pxToRem(sidebar.menuRowIconSize),
                width: pxToRem(sidebar.menuRowIconSize),
              }}
            >
              <Icon
                style={{
                  height: pxToEm(sidebar.menuRowIconSize, sidebar.menuRowFontSize),
                  width: pxToEm(sidebar.menuRowIconSize, sidebar.menuRowFontSize),
                }}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{t(row.labelKey)}</span>
            {row.key === "invite" ? (
              <span
                className="flex-none"
                style={{
                  color: "hsl(var(--text-muted))",
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(sidebar.menuHintFontSize),
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {inviteHint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
