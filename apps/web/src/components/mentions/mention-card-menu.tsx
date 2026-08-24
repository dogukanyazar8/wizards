"use client";

import React, { useCallback, useEffect, useId, useRef } from "react";
import { BellOff, Clock, Link2, Trash2 } from "lucide-react";
import type { MentionSource } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import type { MentionMenuAction, MentionMenuDirection } from "@/lib/mentions/contracts";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";

/**
 * Kartın `⋯` menüsü — SPEC §5.1.
 *
 * **Neden paylaşılan `ContextMenu` kabuğu kullanılmadı.** `components/ui/context-menu.tsx`
 * gövdeye portallanan, görünüm alanı koordinatlarıyla (`position: {x, y}`) yerleştirilen ve
 * `min-w-52` / `rounded-2xl` ile sabitlenmiş bir kabuk. SPEC §5.1 ise menüyü **karta** göre
 * konumluyor (`top: 34` / `bottom: 34`), 218 genişlik, 14 yarıçap ve `z-index: 5` istiyor;
 * kabuk bunları `className` ya da `style` ile almıyor ve o dosya bu şeridin kümesinde
 * **yazılamaz** olarak işaretli. Kart-hizalı konum ayrıca yönün varlık sebebidir: ilk iki kart
 * aşağı, kalanlar yukarı açılarak menü akışın dışına taşmaz — görünüm alanına portallanan bir
 * menüde bu kural anlamsız olurdu.
 *
 * Satırlar yine paylaşılan `ContextMenuItem` / `ContextMenuSeparator`: `role="menuitem"`,
 * odak halkası ve yıkıcı ton oradan gelir, burada ikinci kez yazılmaz.
 */

const { cardMenu } = MENTIONS_METRICS;

export type MentionCardMenuProps = {
  readonly direction: MentionMenuDirection;
  readonly labelledById: string;
  readonly onAction: (action: MentionMenuAction) => void;
  readonly onClose: () => void;
  readonly source: MentionSource;
};

type MenuRow = {
  readonly action: MentionMenuAction;
  readonly icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  readonly label: string;
};

export function MentionCardMenu({
  direction,
  labelledById,
  onAction,
  onClose,
  source,
}: MentionCardMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  /**
   * Dış tıklama ve `Esc`. Kapanışta odağı `⋯` butonuna döndürmek **kartın** işi (menü
   * kapandığında bu ağaç zaten sökülmüş olur); kart `onMenuToggle` sonrası odağı geri alır.
   */
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Menü açıkken `Esc` yalnız menüyü kapatır; akışın klavye katmanına inmesin.
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  /** Açılışta ilk satıra odak — menü klavyeyle açıldığında imleç içeride başlamalı. */
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  /** `Tab` menünün içinde döner; arka plana kaçan bir odak kalmaz. */
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (items.length === 0) {
      return;
    }

    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;

    event.preventDefault();
    items[next]?.focus();
  }, []);

  const rows: readonly MenuRow[] = [
    { action: "copy-link", icon: Link2, label: t("mentions.card.menu.copyLink") },
    { action: "read-later", icon: Clock, label: t("mentions.card.menu.readLater") },
    {
      action: "mute-source",
      icon: BellOff,
      label:
        source.type === "dm"
          ? t("mentions.card.menu.muteConversation")
          : t("mentions.card.menu.mute", { channel: source.channelName }),
    },
  ];

  const itemStyle: React.CSSProperties = {
    borderRadius: pxToRem(cardMenu.itemRadius),
    fontSize: pxToRem(cardMenu.itemFontSize),
    fontWeight: cardMenu.itemWeight,
    gap: pxToRem(cardMenu.itemGap),
    lineHeight: 1.35,
    minHeight: 0,
    padding: `${pxToRem(cardMenu.itemPaddingY)} ${pxToRem(cardMenu.itemPaddingX)}`,
    transitionDuration: `${cardMenu.transitionMs}ms`,
  };
  const iconStyle: React.CSSProperties = {
    height: pxToRem(cardMenu.itemIconSize),
    width: pxToRem(cardMenu.itemIconSize),
  };

  return (
    <div
      aria-labelledby={labelledById}
      className="absolute right-0 flex flex-col bg-[hsl(var(--surface-card))]"
      data-direction={direction}
      data-testid="mention-card-menu"
      id={menuId}
      onKeyDown={handleKeyDown}
      // Menü kartın gövdesinin içinde duruyor; tıklaması `onOpen`'a sızmamalı.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
      style={{
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(cardMenu.radius),
        boxShadow: `${pxToRem(cardMenu.shadow.x)} ${pxToRem(cardMenu.shadow.y)} ${pxToRem(
          cardMenu.shadow.blur,
        )} ${pxToRem(cardMenu.shadow.spread)} hsl(var(--shadow-color))`,
        gap: pxToRem(cardMenu.gap),
        padding: pxToRem(cardMenu.padding),
        width: pxToRem(cardMenu.width),
        zIndex: cardMenu.zIndex,
        ...(direction === "down"
          ? { top: pxToRem(cardMenu.offset) }
          : { bottom: pxToRem(cardMenu.offset) }),
      }}
    >
      {rows.map((row) => (
        <ContextMenuItem
          className="text-[hsl(var(--text-secondary))]"
          key={row.action}
          onClick={() => onAction(row.action)}
          style={itemStyle}
        >
          <row.icon style={iconStyle} />
          <span className="min-w-0 flex-1 truncate text-left">{row.label}</span>
        </ContextMenuItem>
      ))}

      <div
        style={{
          margin: `${pxToRem(cardMenu.separatorMarginY)} ${pxToRem(cardMenu.separatorMarginX)}`,
        }}
      >
        <ContextMenuSeparator />
      </div>

      <ContextMenuItem
        destructive
        onClick={() => onAction("dismiss")}
        style={{ ...itemStyle, fontWeight: cardMenu.dangerWeight }}
      >
        <Trash2 style={iconStyle} />
        <span className="min-w-0 flex-1 truncate text-left">{t("mentions.card.menu.remove")}</span>
      </ContextMenuItem>
    </div>
  );
}
