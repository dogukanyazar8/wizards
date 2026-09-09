"use client";

// Varsayılan içe aktarım node test koşucusunun klasik JSX dönüşümünün çözdüğü referanstır;
// Next'in derleyicisi buna ihtiyaç duymaz.
import React, { useCallback, useEffect, useReducer, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { NotificationPanel } from "@/components/notifications/notification-panel";
import { NotificationPrefsDialog } from "@/components/notifications/notification-prefs-dialog";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { badgeQueryKeys } from "@/lib/badges/client";
import { HOME_METRICS, hairline, pxToRem } from "@/lib/home/metrics";
import {
  fetchNotificationCounts,
  fetchNotificationPage,
  notificationsQueryKeys,
} from "@/lib/notifications/client";
import {
  EMPTY_NOTIF_COUNTS,
  createNotifPanelState,
  hasVisibleNotifCount,
  notifPanelReducer,
  resolveNotifPanelEscape,
} from "@/lib/notifications/panel-state";
import type { NotificationReadSocketPayload, NotificationSocketPayload } from "@/lib/socket/events";
import { cn } from "@/lib/utils";

/**
 * Zil düğmesi ve iki yüzeyi — SPEC §1 / §2, Ş11.
 *
 * **Düğme değişmedi**: 40×40 kutu, `badgeVariant` ("count" | "dot") ve okunmamış noktası
 * SPEC-ANA-SAYFA §2.3'ten geliyor ve yerinde duruyor. Değişen popover'ın **gövdesi**:
 * altı satırlık düz liste yerine dört sekmeli, sonsuz kaydıran, okundu durumunu çeviren panel
 * (`NotificationPanel`) ve dişlisinin açtığı 560 px pencere (`NotificationPrefsDialog`).
 *
 * Bileşenin kendi işi üçe indi: düğmeyi çizmek, **sayacı** beslemek ve merdiveni yürütmek.
 * Sayaç burada yaşıyor çünkü nokta panel kapalıyken de doğru olmalı; liste ise yalnız panel
 * açıkken yükleniyor.
 *
 * Sayaç **hiçbir yerde artırılmıyor** (prompt §3): `notification:new` yükü sayacı taşıyorsa
 * o yazılır, taşımıyorsa uç yeniden okunur. `current + 1` yazmak iki sekme açıkken kaçınılmaz
 * olarak ayrışırdı.
 */

const { topBar } = HOME_METRICS;

export type NotificationBellProps = {
  /**
   * Ana Sayfa üst çubuğu okunmamışı **sayıyla değil noktayla** işaretler (SPEC-ANA-SAYFA §2.3):
   * 40×40 butonun köşesinde 7px `--danger` nokta. Varsayılan davranış (sayı balonu) değişmez.
   */
  badgeVariant?: "count" | "dot";
  className?: string;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
};

export function NotificationBell({
  badgeVariant = "count",
  className,
  onOpenChange,
  style,
}: NotificationBellProps = {}) {
  const { t } = useI18n();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseTitleRef = useRef<string | null>(null);
  const [state, dispatch] = useReducer(notifPanelReducer, undefined, createNotifPanelState);

  const panelOpen = state.surface === "panel";
  const prefsOpen = state.surface === "prefs";

  const countsQuery = useQuery({
    queryFn: fetchNotificationCounts,
    queryKey: notificationsQueryKeys.counts,
    staleTime: 30_000,
  });

  const unreadCount = (countsQuery.data ?? EMPTY_NOTIF_COUNTS).all;

  useEffect(() => {
    onOpenChange?.(panelOpen);
  }, [onOpenChange, panelOpen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    baseTitleRef.current ??= document.title.replace(/^\(\d+\+?\)\s*/u, "") || "Whispr";
    const baseTitle = baseTitleRef.current;
    document.title =
      unreadCount > 0 ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${baseTitle}` : baseTitle;

    return () => {
      document.title = baseTitle;
    };
  }, [unreadCount]);

  const prefetchPanel = useCallback(() => {
    void queryClient.prefetchInfiniteQuery({
      initialPageParam: undefined as string | undefined,
      queryFn: () => fetchNotificationPage("all"),
      queryKey: notificationsQueryKeys.panel("all"),
      staleTime: 30_000,
    });
  }, [queryClient]);

  useEffect(() => {
    const handleIncoming = (notification: NotificationSocketPayload) => {
      if (notification.counts) {
        queryClient.setQueryData(notificationsQueryKeys.counts, notification.counts);
      } else {
        // Sayacı taşımayan bir yayımcı istemciyi ucu okumaya düşürür — yanlış bir sayı
        // göstermeye değil (`NotificationSocketPayload.counts` yorumu).
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.counts });
      }

      if (notification.type === "BADGE") {
        void queryClient.invalidateQueries({ queryKey: badgeQueryKeys.own() });
        void queryClient.invalidateQueries({ queryKey: badgeQueryKeys.user(notification.userId) });
      }
    };

    const handleRead = (payload: NotificationReadSocketPayload) => {
      queryClient.setQueryData(notificationsQueryKeys.counts, payload.counts);
    };

    const handleFriendsUpdated = () => {
      // Kabul/ret edilen bir arkadaşlık isteği bildirimi sunucuda siliniyor; liste ve sayaç
      // birlikte tazelenir.
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    };

    socket.on("notification:new", handleIncoming);
    socket.on("notification:read", handleRead);
    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("notification:new", handleIncoming);
      socket.off("notification:read", handleRead);
      socket.off("friends:updated", handleFriendsUpdated);
    };
  }, [queryClient, socket]);

  /** Panel dışına tıklamak paneli kapatır; pencerenin kendi örtüsü var (00 tuzak #11). */
  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      dispatch({ type: "closeAll" });
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [panelOpen]);

  /**
   * `Esc` sırayla: modal → panel. Basamak `resolveNotifPanelEscape` ile adlandırılıyor ve
   * yalnız bir katman açıkken olay yutuluyor — aksi hâlde `Esc` arkadaki yüzeye de sızardı.
   */
  useEffect(() => {
    const target = resolveNotifPanelEscape(state);

    if (target === "none") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "escape" });
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [state]);

  /** Panel kapanınca odak tetikleyiciye döner; pencere kendi odağını kendi geri veriyor. */
  const wasPanelOpenRef = useRef(false);

  useEffect(() => {
    if (wasPanelOpenRef.current && state.surface === "closed") {
      buttonRef.current?.focus();
    }

    wasPanelOpenRef.current = panelOpen;
  }, [panelOpen, state.surface]);

  return (
    <div className="relative shrink-0" data-testid="notification-bell" ref={rootRef}>
      <button
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        aria-label={t("notifications.bell.title")}
        className={cn(
          "relative inline-flex items-center justify-center border-solid transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          className,
        )}
        data-open={panelOpen || undefined}
        data-testid="notification-bell-button"
        onClick={() => dispatch({ type: "togglePanel" })}
        onFocus={prefetchPanel}
        onMouseEnter={prefetchPanel}
        ref={buttonRef}
        style={{
          ...style,
          // Açıkken primary vurgu (SPEC §1). Ebeveynin verdiği yüzey stilini **bilerek** ezer:
          // düğmenin açık hâli tasarımın kendi durumudur, çağrı yerinin değil.
          ...(panelOpen
            ? {
                background: "hsl(var(--primary) / 0.14)",
                borderColor: "hsl(var(--primary) / 0.5)",
                color: "hsl(var(--primary))",
              }
            : {}),
        }}
        type="button"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {hasVisibleNotifCount(unreadCount) && badgeVariant === "count" ? (
          <span
            className="absolute -right-1 -top-1 inline-flex min-w-[1.4rem] items-center justify-center rounded-full border border-[hsl(var(--surface-card))] bg-[hsl(var(--danger))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--danger-foreground))] shadow-[0_10px_22px_hsl(var(--shadow-color)/0.18)]"
            data-testid="notification-bell-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
        {hasVisibleNotifCount(unreadCount) && badgeVariant === "dot" ? (
          <span
            aria-hidden="true"
            className="absolute rounded-full border-solid border-[hsl(var(--surface-card))] bg-[hsl(var(--danger))]"
            data-testid="notification-bell-dot"
            style={{
              borderWidth: hairline(topBar.bellDotBorderWidth),
              height: pxToRem(topBar.bellDotSize),
              right: pxToRem(topBar.bellDotOffsetRight),
              top: pxToRem(topBar.bellDotOffsetTop),
              width: pxToRem(topBar.bellDotSize),
            }}
          />
        ) : null}
      </button>

      {panelOpen ? (
        <NotificationPanel
          onClose={() => dispatch({ type: "closeAll" })}
          onOpenPrefs={() => dispatch({ type: "openPrefs" })}
          onSelectTab={(tab) => dispatch({ tab, type: "selectTab" })}
          tab={state.tab}
        />
      ) : null}

      {/* Pencere gövdeye taşınır: modal kabuğun kırpma ve yığma bağlamlarının dışında durmalı,
          zil ise `overflow:hidden` taşıyan bir ekran kabının içinde yaşıyor. */}
      {prefsOpen && typeof document !== "undefined"
        ? createPortal(
            <NotificationPrefsDialog
              onClose={() => dispatch({ type: "closeAll" })}
              onSaveState={(save) => dispatch({ save, type: "save" })}
              saveState={state.save}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
