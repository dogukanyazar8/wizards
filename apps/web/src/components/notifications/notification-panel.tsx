"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Settings } from "lucide-react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import { NotificationItem } from "@/components/notifications/notification-item";
import {
  NotificationPanelTabs,
  notificationPanelTabId,
} from "@/components/notifications/notification-panel-tabs";
import { useSocket } from "@/hooks/use-socket";
import {
  fetchNotificationCounts,
  fetchNotificationPage,
  markAllNotificationsRead,
  notificationsQueryKeys,
  setNotificationRead,
} from "@/lib/notifications/client";
import {
  EMPTY_NOTIF_COUNTS,
  NOTIF_PANEL_TABS,
  applyNotifReadAll,
  applyNotifReadFlag,
  flattenNotifPages,
  hasVisibleNotifCount,
  isNotifListEmpty,
} from "@/lib/notifications/panel-state";
import type { NotificationPageDTO } from "@/lib/notifications/types";
import {
  fetchNotificationPrefs,
  notificationPrefsQueryKeys,
} from "@/lib/settings/notification-prefs-client";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import type { NotificationReadSocketPayload } from "@/lib/socket/events";
import type {
  AppNotification,
  NotifDayBucket,
  NotifPanelTab,
  NotifUnreadCounts,
} from "@wizards/types";

/**
 * Bildirimler paneli — SPEC §1, Ş11 §A.
 *
 * Panel bir **okuma yüzeyi** değil, bir kayıt defteri: satıra tıklamak okundu durumunu
 * çevirir, sayaçlar hep sunucudan gelir ve `/inbox` silindiği için (K10) `Sistem` sekmesi de
 * dâhil dört sekmenin dördü de sonsuz kaydırır.
 *
 * ## Sayaç neden ayrı bir sorgu
 *
 * Dört sekme dört ayrı sonsuz listedir ama sayaç **tektir**. Sayfa yanıtı da sayacı taşıyor
 * (Ş2 §3) ve o yanıt geldiğinde ortak önbelleğe yazılıyor; zil noktası, sekme pilleri ve
 * başlıktaki sayı böylece tek kaynaktan okuyor. Her sekme kendi sayacını tutsaydı, bir
 * sekmede okunan bildirim diğer sekmenin pilinden düşmezdi.
 *
 * İstemci sayacı **hiçbir yerde artırmaz** (prompt §3): her değer bir sunucu yanıtından ya da
 * `notification:read` / `notification:new` yükünden gelir. İki sekme açıkken artırma
 * kaçınılmaz olarak ayrışırdı.
 */

const { panel } = SETTINGS_METRICS;
const { empty, footer, header, list, tabs } = panel;
const { motion } = SETTINGS_METRICS;

/**
 * Panelin dar ekranda taşmaması için kenar payı — Ş13'te sözlüğe taşındı.
 *
 * SPEC §10'un `<520px` alt sayfası artık `globals.css` içinde (`.notification-panel-popover`);
 * kırılım CSS'te seçiliyor (tuzak #10) ve bu pay yalnız `520px` üstündeki popover için geçerli.
 */
const VIEWPORT_MARGIN = panel.viewportMargin;

/** K10 — `Tüm bildirimleri gör` `/mentions`e gider; hedef tek yerde yazılı. */
export const NOTIFICATIONS_FULL_LIST_HREF = "/mentions";

const GROUP_LABEL_KEY: Readonly<Record<NotifDayBucket, string>> = {
  older: "notif.panel.group.older",
  today: "notif.panel.group.today",
  yesterday: "notif.panel.group.yesterday",
};

/** `useInfiniteQuery`nin önbellek zarfı; dört sekmenin dördü de aynı şekli taşır. */
type NotificationPanelCache = {
  pageParams: unknown[];
  pages: NotificationPageDTO[];
};

export type NotificationPanelProps = {
  readonly onClose: () => void;
  readonly onOpenPrefs: () => void;
  readonly onSelectTab: (tab: NotifPanelTab) => void;
  readonly tab: NotifPanelTab;
};

export function NotificationPanel({
  onClose,
  onOpenPrefs,
  onSelectTab,
  tab,
}: NotificationPanelProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  /**
   * Sayfa yanıtı sayacı da taşıyor; ortak önbelleğe **burada** yazılıyor. Bir efektle
   * yazılsaydı, sayfa ile pil arasında bir render'lık bir yalan penceresi kalırdı.
   */
  const writeCounts = useCallback(
    (counts: NotifUnreadCounts) => {
      queryClient.setQueryData(notificationsQueryKeys.counts, counts);
    },
    [queryClient],
  );

  const listQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: NotificationPageDTO) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchNotificationPage(tab, pageParam);
      writeCounts(page.counts);

      return page;
    },
    queryKey: notificationsQueryKeys.panel(tab),
  });

  const countsQuery = useQuery({
    queryFn: fetchNotificationCounts,
    queryKey: notificationsQueryKeys.counts,
    staleTime: 30_000,
  });

  /** Alt şeritteki sessiz saat aralığı; tercih kapalıysa satır **yazılmaz** (§A.5). */
  const prefsQuery = useQuery({
    queryFn: fetchNotificationPrefs,
    queryKey: notificationPrefsQueryKeys.root,
    staleTime: 30_000,
  });

  const counts = countsQuery.data ?? EMPTY_NOTIF_COUNTS;
  const groups = useMemo(() => flattenNotifPages(listQuery.data?.pages), [listQuery.data?.pages]);
  const quietHours = prefsQuery.data?.quietHours;
  const timeZone = quietHours?.tz;

  /** Sekme değişince kaydırma başa döner: yeni sekmenin ilk satırı görünmeliydi. */
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  /**
   * Sonsuz kaydırma. Bağımlılıklar **ilkel** (`hasNextPage`, `isFetchingNextPage`, satır
   * sayısı): `useInfiniteQuery`nin döndürdüğü nesne her render'da yeni ve `[listQuery]`
   * yazıldığında gözlemci her render'da sökülüp kurulur — kurulduğu anda sentinel görünürse
   * bir sayfa daha çeker ve panel kendi kendine sonuna kadar akar.
   *
   * `fetchNextPage` bir ref'te **efekt içinde** tazeleniyor: render sırasında ref yazmak
   * React Compiler'ın `react-hooks/refs` kuralını ihlal eder ve eşzamanlı render'da yanlış
   * değeri okuyabilir.
   */
  const fetchNextPageRef = useRef(listQuery.fetchNextPage);

  useEffect(() => {
    fetchNextPageRef.current = listQuery.fetchNextPage;
  }, [listQuery.fetchNextPage]);

  const hasNextPage = listQuery.hasNextPage;
  const isFetchingNextPage = listQuery.isFetchingNextPage;
  const rowCount = groups.reduce((total, group) => total + group.items.length, 0);

  useEffect(() => {
    const node = sentinelRef.current;

    if (!node || !hasNextPage || isFetchingNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPageRef.current();
        }
      },
      // Kök **kaydırma kabı**: kök verilmezse sentinel panelin kırpma kutusuna kırpılır ve
      // `rootMargin` yalnız görünüm alanını büyütür.
      { root: listRef.current, rootMargin: "160px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, rowCount]);

  /**
   * `notification:read` iki sekmeyi hizalar: başka bir sekmede (ya da başka bir cihazda)
   * okunan bildirim burada da okunmuş görünür. Sayaç yükten okunur, hesaplanmaz.
   */
  useEffect(() => {
    const handleRead = (payload: NotificationReadSocketPayload) => {
      writeCounts(payload.counts);

      for (const entry of NOTIF_PANEL_TABS) {
        queryClient.setQueryData<NotificationPanelCache>(
          notificationsQueryKeys.panel(entry),
          (current) =>
            current
              ? {
                  ...current,
                  pages: current.pages.map((page) => ({
                    ...page,
                    counts: payload.counts,
                    groups:
                      payload.id === null
                        ? applyNotifReadAll(page.groups)
                        : applyNotifReadFlag(page.groups, payload.id, payload.read),
                  })),
                }
              : current,
        );
      }
    };

    const handleIncoming = () => {
      // Yeni satırın kendisi yükte yok (sözleşme `NotificationSocketPayload`, `AppNotification`
      // değil); açık panelin listesi tazelenir. Sayacı zil yükten okuyor.
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.panel(tab) });
    };

    socket.on("notification:read", handleRead);
    socket.on("notification:new", handleIncoming);

    return () => {
      socket.off("notification:read", handleRead);
      socket.off("notification:new", handleIncoming);
    };
  }, [queryClient, socket, tab, writeCounts]);

  /**
   * Okundu bayrağı **dört** sekmenin önbelleğinde birden çevrilir: aynı bildirim `Tümü` ve
   * `Bahsedilmeler` sayfalarında ayrı nesneler olarak duruyor ve yalnız birini çevirmek, sekme
   * değiştiren kullanıcıya aynı satırı iki farklı durumda gösterirdi.
   */
  const applyReadToCache = useCallback(
    (id: string, read: boolean) => {
      for (const entry of NOTIF_PANEL_TABS) {
        queryClient.setQueryData<NotificationPanelCache>(
          notificationsQueryKeys.panel(entry),
          (current) =>
            current
              ? {
                  ...current,
                  pages: current.pages.map((page) => ({
                    ...page,
                    groups: applyNotifReadFlag(page.groups, id, read),
                  })),
                }
              : current,
        );
      }
    },
    [queryClient],
  );

  const toggleReadMutation = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => setNotificationRead(id, read),
    onError: (_error, variables) => {
      // İyimser çevirme geri alınır; sayaç zaten sunucudan geliyordu ve hiç değişmedi.
      applyReadToCache(variables.id, !variables.read);
    },
    onMutate: (variables) => {
      applyReadToCache(variables.id, variables.read);
    },
    onSuccess: (nextCounts) => {
      writeCounts(nextCounts);
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (nextCounts) => {
      writeCounts(nextCounts);

      for (const entry of NOTIF_PANEL_TABS) {
        queryClient.setQueryData<NotificationPanelCache>(
          notificationsQueryKeys.panel(entry),
          (current) =>
            current
              ? {
                  ...current,
                  pages: current.pages.map((page) => ({
                    ...page,
                    counts: nextCounts,
                    groups: applyNotifReadAll(page.groups),
                  })),
                }
              : current,
        );
      }
    },
  });

  const handleToggleRead = useCallback(
    (notification: AppNotification) => {
      toggleReadMutation.mutate({ id: notification.id, read: !notification.read });
    },
    [toggleReadMutation],
  );

  const unread = counts.all;
  const showEmpty = !listQuery.isPending && isNotifListEmpty(groups);

  return (
    <div
      aria-label={t("notif.panel.title")}
      className="notification-panel-popover flex flex-col overflow-hidden border border-solid border-[hsl(var(--border))] bg-[hsl(var(--surface-card))]"
      data-testid="notification-panel"
      role="dialog"
      style={
        {
          // SPEC §10 `<520px`: panel tam genişlikli alt sayfaya döner. Ölçüler sözlükten
          // **değişken** olarak iniyor ve kırılım `globals.css`'te seçiliyor (tuzak #10);
          // satır içi bir `width` bir medya sorgusunun ezemeyeceği tek şeydir.
          borderWidth: hairline(),
          boxShadow: `${pxToRem(panel.shadow.x)} ${pxToRem(panel.shadow.y)} ${pxToRem(
            panel.shadow.blur,
          )} ${pxToRem(panel.shadow.spread)} hsl(var(--shadow-color))`,
          zIndex: panel.zIndex,
          "--notif-panel-radius": pxToRem(panel.radius),
          "--notif-panel-top": pxToRem(panel.top),
          "--notif-panel-right": String(panel.right),
          "--notif-panel-width": `min(${pxToRem(panel.width)}, calc(100vw - ${pxToRem(
            VIEWPORT_MARGIN * 2,
          )}))`,
          "--notif-panel-max-height": `min(${pxToRem(panel.maxHeight)}, calc(100dvh - ${pxToRem(
            panel.top + VIEWPORT_MARGIN,
          )}))`,
        } as React.CSSProperties
      }
    >
      <div
        className="flex shrink-0 items-center border-b border-solid"
        style={{
          borderBottomColor: `hsl(var(--border) / ${header.borderBottomAlpha})`,
          borderBottomWidth: hairline(),
          gap: pxToRem(header.gap),
          padding: `${pxToRem(header.paddingTop)} ${pxToRem(header.paddingX)} ${pxToRem(
            header.paddingBottom,
          )}`,
        }}
      >
        <span
          className="font-display text-[hsl(var(--foreground))]"
          style={{ fontSize: pxToRem(header.titleFontSize), fontWeight: header.titleWeight }}
        >
          {t("notif.panel.title")}
        </span>

        {hasVisibleNotifCount(unread) ? (
          <span
            className="font-display grid place-items-center bg-[hsl(var(--danger))]"
            data-testid="notification-panel-unread-count"
            style={{
              borderRadius: pxToRem(header.countRadius),
              // Ters metin — primary/danger zemin üstünde beyaz, kalite çıtasının tek istisnası.
              color: "#fff",
              fontSize: pxToRem(header.countFontSize),
              fontWeight: header.titleWeight,
              height: pxToRem(header.countHeight),
              minWidth: pxToRem(header.countMinWidth),
              padding: `0 ${pxToRem(header.countPaddingX)}`,
            }}
          >
            {unread}
          </span>
        ) : null}

        {hasVisibleNotifCount(unread) ? (
          <button
            className="ml-auto whitespace-nowrap text-[var(--primary-readable)] transition-opacity hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50"
            data-testid="notification-panel-mark-all"
            disabled={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
            style={{
              fontSize: pxToRem(header.markAllFontSize),
              fontWeight: header.markAllWeight,
            }}
            type="button"
          >
            {t("notif.panel.markAll")}
          </button>
        ) : (
          <span
            className="ml-auto inline-flex items-center whitespace-nowrap text-[var(--success-readable)]"
            data-testid="notification-panel-all-read"
            style={{
              fontSize: pxToRem(header.markAllFontSize),
              fontWeight: header.markAllWeight,
              gap: pxToRem(header.allReadGap),
            }}
          >
            <Check
              aria-hidden="true"
              style={{
                height: pxToEm(header.allReadIconSize, header.markAllFontSize),
                width: pxToEm(header.allReadIconSize, header.markAllFontSize),
              }}
            />
            {t("notif.panel.allRead")}
          </span>
        )}

        <button
          aria-label={t("notif.panel.settings")}
          className="settings-hit-target grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition-colors hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="notification-panel-gear"
          onClick={onOpenPrefs}
          style={{
            borderRadius: pxToRem(header.gearRadius),
            height: pxToRem(header.gearSize),
            transitionDuration: `${motion.transitionSeconds}s`,
            width: pxToRem(header.gearSize),
          }}
          type="button"
        >
          <Settings
            aria-hidden="true"
            style={{
              height: pxToRem(header.gearIconSize),
              width: pxToRem(header.gearIconSize),
            }}
          />
        </button>
      </div>

      <NotificationPanelTabs counts={counts} onSelect={onSelectTab} panelId={listId} tab={tab} />

      <div
        aria-labelledby={notificationPanelTabId(listId, tab)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="notification-panel-list"
        id={listId}
        ref={listRef}
        role="tabpanel"
        style={{
          padding: `${pxToRem(list.paddingTop)} ${pxToRem(list.paddingX)} ${pxToRem(
            list.paddingBottom,
          )}`,
        }}
      >
        {showEmpty ? (
          <div
            className="flex flex-col items-center text-center"
            data-testid="notification-panel-empty"
            style={{
              gap: pxToRem(empty.gap),
              padding: `${pxToRem(empty.paddingTop)} ${pxToRem(empty.paddingX)} ${pxToRem(
                empty.paddingBottom,
              )}`,
            }}
          >
            <span
              className="grid place-items-center border border-solid"
              style={{
                background: `hsl(var(--success) / ${empty.iconSurfaceAlpha})`,
                borderColor: `hsl(var(--success) / ${empty.iconBorderAlpha})`,
                borderRadius: pxToRem(empty.iconBoxRadius),
                borderWidth: hairline(),
                color: "hsl(var(--success))",
                height: pxToRem(empty.iconBox),
                width: pxToRem(empty.iconBox),
              }}
            >
              <Check
                aria-hidden="true"
                style={{ height: pxToRem(empty.iconSize), width: pxToRem(empty.iconSize) }}
              />
            </span>
            <span>
              <span
                className="font-display block text-[hsl(var(--foreground))]"
                style={{ fontSize: pxToRem(empty.titleFontSize), fontWeight: header.titleWeight }}
              >
                {t("notif.panel.empty.title")}
              </span>
              <span
                className="block text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(empty.bodyFontSize),
                  lineHeight: empty.bodyLineHeight,
                  marginTop: pxToRem(empty.bodyMarginTop),
                }}
              >
                {t("notif.panel.empty.body")}
              </span>
            </span>
          </div>
        ) : (
          <div role="list">
            {groups.map((group) => (
              <React.Fragment key={group.label}>
                <div
                  className="flex items-center"
                  style={{
                    gap: pxToRem(list.groupLabelGap),
                    padding: `${pxToRem(list.groupLabelPaddingTop)} ${pxToRem(
                      list.groupLabelPaddingX,
                    )} ${pxToRem(list.groupLabelPaddingBottom)}`,
                  }}
                >
                  <span
                    className="font-display uppercase text-[hsl(var(--text-muted))]"
                    style={{
                      fontSize: pxToRem(list.groupLabelFontSize),
                      fontWeight: list.groupLabelWeight,
                      letterSpacing: `${list.groupLabelTracking}em`,
                    }}
                  >
                    {t(GROUP_LABEL_KEY[group.label])}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex-1"
                    style={{
                      background: `hsl(var(--border) / ${tabs.borderBottomAlpha})`,
                      height: hairline(),
                    }}
                  />
                </div>
                <div className="flex flex-col" style={{ gap: pxToRem(list.rowGap) }}>
                  {group.items.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onToggleRead={handleToggleRead}
                      timeZone={timeZone}
                    />
                  ))}
                </div>
              </React.Fragment>
            ))}
            {hasNextPage ? (
              <div
                data-testid="notification-panel-sentinel"
                ref={sentinelRef}
                style={{ height: pxToRem(list.rowGap) }}
              />
            ) : null}
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 items-center border-t border-solid"
        style={{
          borderTopColor: `hsl(var(--border) / ${footer.borderTopAlpha})`,
          borderTopWidth: hairline(),
          gap: pxToRem(footer.gap),
          padding: `${pxToRem(footer.paddingY)} ${pxToRem(footer.paddingX)}`,
        }}
      >
        {quietHours?.enabled ? (
          <span
            className="flex-1 text-[hsl(var(--text-muted))]"
            data-testid="notification-panel-quiet-hours"
            style={{ fontSize: pxToRem(footer.hintFontSize) }}
          >
            {t("notif.panel.quietHours", { end: quietHours.end, start: quietHours.start })}
          </span>
        ) : (
          <span aria-hidden="true" className="flex-1" />
        )}
        {/* K10 — `/inbox` silindi; panelin dışındaki tam liste Bahsedilmeler ekranıdır.
            Gerçek bir bağlantı: yeni sekmede açılabilmeli ve `router.push` çağıran bir düğme
            bunu yapamaz. */}
        <Link
          className="whitespace-nowrap text-[var(--primary-readable)] transition-opacity hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="notification-panel-see-all"
          href={NOTIFICATIONS_FULL_LIST_HREF}
          onClick={onClose}
          style={{ fontSize: pxToRem(footer.linkFontSize), fontWeight: footer.linkWeight }}
        >
          {t("notif.panel.seeAll")}
        </Link>
      </div>
    </div>
  );
}
