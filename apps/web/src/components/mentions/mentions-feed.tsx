"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Mention } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MentionsEmptyState } from "@/components/mentions/mentions-empty-state";
import { MentionsNewStrip } from "@/components/mentions/mentions-new-strip";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  MentionCardProps,
  MentionMenuAction,
  MentionMenuDirection,
} from "@/lib/mentions/contracts";
import {
  MENTIONS_VIRTUALIZE_THRESHOLD,
  flattenMentionGroups,
  listMentionIds,
  type MentionFeedRow,
  type MentionGroup,
  type MentionGroupLabel,
} from "@/lib/mentions/grouping";
import { isTypingTarget, moveMentionCursor, resolveMentionShortcut } from "@/lib/mentions/keyboard";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import type { MentionsRouteState } from "@/lib/mentions/routes";
import { cn } from "@/lib/utils";

/**
 * Bahsetme akışı — SPEC §5.
 *
 * Akış **saf sunumdur**: sorgu açmaz, mutasyon çağırmaz. Kartın içini Ş6, yanıt kutusunu Ş7
 * yazıyor; buraya `renderCard` ve `renderReply` olarak geliyorlar. Akışın sahiplendiği şey
 * onların **yeri**: hangi grupta, hangi sırada, hangi menü yönüyle ve klavye imleci nerede.
 *
 * Grup başlıkları düz listeye çevrilir (`flattenMentionGroups`). İç içe listelerde sanal
 * pencere ölçemez ve grup başlığı yapışkan olamaz; tek düz liste, sanallaştırma açık da kapalı
 * da olsa **aynı** satır dizisini çizer.
 */

const { card, cardMenu, emptyState, feed } = MENTIONS_METRICS;

/**
 * Sanal pencerenin satır tahmini. Kart yüksekliği içeriğe göre değişir (alıntı bloğu, thread
 * satırı, yanıt kutusu); tahmin yalnız ilk yerleşim için, ölçüm `measureElement` ile gerçek
 * yükseklikten gelir.
 */
export const MENTION_CARD_ESTIMATED_HEIGHT_PX = 148;
const GROUP_HEADER_ESTIMATED_HEIGHT_PX = 34;
const VIRTUAL_OVERSCAN = 6;

/** SPEC §5.1 — ilk iki kart aşağı, sonrakiler yukarı açar ki menü akış dışına taşmasın. */
const MENU_DOWN_CARD_LIMIT = cardMenu.downwardCardCount;

export type MentionCardRenderer = (props: MentionCardProps) => React.ReactNode;

export function shouldVirtualizeMentionFeed(cardCount: number): boolean {
  return cardCount > MENTIONS_VIRTUALIZE_THRESHOLD;
}

/**
 * "Akışın tepesinde" ölçüsü akışın kendi üst boşluğu kadar. Bir piksel şart koşmak, kaydırma
 * yumuşatması yüzünden 0'a hiç oturmayan bir konumda kullanıcıyı sonsuza kadar "kaydırılmış"
 * saymak demekti.
 */
export function isMentionFeedAtTop(scrollTop: number): boolean {
  return scrollTop <= feed.paddingTop;
}

/**
 * PROMPT §4 — kaydırılmış akışa yeni kart girdiğinde konum bozulmaz.
 *
 * Telafi **ölçülür**: `scrollIntoView` kullanıcının baktığı kartı ekrandan kaydırır ve hangi
 * kartın nereye gittiğini kimse öngöremez. Yükseklik farkı kadar `scrollTop` eklemek, gözün
 * gördüğü satırı piksel piksel yerinde bırakır.
 */
export function computeFeedScrollCompensation(input: {
  readonly grew: boolean;
  readonly nextScrollHeight: number;
  readonly previousScrollHeight: number;
  readonly scrollTop: number;
}): number {
  if (!input.grew || isMentionFeedAtTop(input.scrollTop)) {
    return 0;
  }

  const delta = input.nextScrollHeight - input.previousScrollHeight;
  return delta > 0 ? delta : 0;
}

export function resolveMentionMenuDirection(cardIndex: number): MentionMenuDirection {
  return cardIndex < MENU_DOWN_CARD_LIMIT ? "down" : "up";
}

/**
 * Sunucuda `useLayoutEffect` hiçbir şey yapmaz ve React bunu uyarı olarak yazar. Kaydırma
 * telafisi boyamadan **önce** koşmak zorunda olduğu için `useEffect`e düşürülemez; ikisi
 * arasındaki seçim ortamdan yapılır.
 */
const useFeedLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export type MentionsFeedProps = {
  /** Klavye imlecinin üzerinde durduğu bahsetme. */
  readonly cursor: string | null;
  readonly error: boolean;
  /** Filtre, arama ya da kaynak seçimi yüzünden boş — boş durum metnini değiştirir. */
  readonly filtered: boolean;
  readonly groups: readonly MentionGroup[];
  readonly hasNextPage: boolean;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly menuId: string | null;
  /** Kaydırılmış akışa gelen ve henüz görülmemiş bahsetme sayısı. */
  readonly newCount: number;
  readonly onAtTopChange: (atTop: boolean) => void;
  readonly onClose: () => void;
  readonly onContext: (mention: Mention) => void;
  readonly onCursorChange: (mentionId: string | null) => void;
  readonly onLoadMore: () => void;
  readonly onMenuAction: (mention: Mention, action: MentionMenuAction) => void;
  readonly onMenuToggle: (mention: Mention) => void;
  readonly onOpen: (mention: Mention) => void;
  readonly onReply: (mention: Mention) => void;
  readonly onRetry: () => void;
  readonly onShowNew: () => void;
  readonly onToggleRead: (mention: Mention) => void;
  readonly panelId: string | null;
  readonly renderCard: MentionCardRenderer;
  /** Ş7'nin satır içi yanıt kutusu; kart yalnız yerini ayırır. */
  readonly renderReply?: (mention: Mention) => React.ReactNode;
  readonly replyId: string | null;
  readonly routeState: MentionsRouteState;
};

function useGroupLabel() {
  const { t } = useI18n();

  return useCallback(
    (label: MentionGroupLabel) =>
      label.kind === "source" ? label.text : t(`mentions.group.${label.preset}`),
    [t],
  );
}

function GroupHeader({
  countLabel,
  group,
  label,
}: {
  countLabel: (count: number) => string;
  group: MentionGroup;
  label: string;
}) {
  return (
    <div
      className="flex items-center"
      data-testid="mentions-group-header"
      style={{
        gap: pxToRem(feed.groupHeaderGap),
        // Alt boşluk grubun kendi boşluğu **artı** akışın grup arası boşluğu: düz listede
        // `gap` yok, aralıklar satırların üstünde taşınıyor.
        padding: `${pxToRem(feed.groupHeaderPaddingTop)} ${pxToRem(
          feed.groupHeaderPaddingX,
        )} ${pxToRem(feed.groupHeaderPaddingBottom + feed.gap)}`,
      }}
    >
      <span
        className={cn("uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
        style={{
          fontSize: pxToRem(feed.groupLabelFontSize),
          fontWeight: feed.groupLabelWeight,
          letterSpacing: `${feed.groupLabelTracking}em`,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <span
        className={DISPLAY_FONT}
        data-testid="mentions-group-count"
        style={{
          color: `hsl(var(--text-muted)/${feed.groupCountAlpha})`,
          fontSize: pxToRem(feed.groupLabelFontSize),
          fontWeight: feed.groupLabelWeight,
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true">{group.items.length}</span>
        <span className="sr-only">{countLabel(group.items.length)}</span>
      </span>
      <span
        aria-hidden="true"
        className="flex-1"
        style={{ background: "hsl(var(--border)/0.5)", height: hairline() }}
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div data-testid="mentions-card-skeleton" style={{ paddingBottom: pxToRem(feed.groupBodyGap) }}>
      <Skeleton
        style={{
          borderRadius: pxToRem(card.radius),
          height: pxToRem(MENTION_CARD_ESTIMATED_HEIGHT_PX),
        }}
      />
    </div>
  );
}

export function MentionsFeed({
  cursor,
  error,
  filtered,
  groups,
  hasNextPage,
  loading,
  loadingMore,
  menuId,
  newCount,
  onAtTopChange,
  onClose,
  onContext,
  onCursorChange,
  onLoadMore,
  onMenuAction,
  onMenuToggle,
  onOpen,
  onReply,
  onRetry,
  onShowNew,
  onToggleRead,
  panelId,
  renderCard,
  renderReply,
  replyId,
  routeState,
}: MentionsFeedProps) {
  const { t } = useI18n();
  const groupLabel = useGroupLabel();
  const groupCountLabel = useCallback(
    (count: number) => t("mentions.header.countPill", { count }),
    [t],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => flattenMentionGroups(groups), [groups]);
  const mentionIds = useMemo(() => listMentionIds(groups), [groups]);
  const firstUnpinnedMentionId = useMemo(
    () => groups.flatMap((group) => group.items).find((mention) => !mention.readLater)?.id ?? null,
    [groups],
  );
  const virtualized = shouldVirtualizeMentionFeed(mentionIds.length);

  /** Kart indeksleri düz liste üzerinden: menü yönü kartın akıştaki sırasından geliyor. */
  const cardIndexById = useMemo(() => {
    const map = new Map<string, number>();
    mentionIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [mentionIds]);

  // Sanallaştırma kapalıyken `count: 0` ile aynı kanca koşar; koşullu kanca yazmak, listenin
  // 60. kartında bileşenin kanca sırasını değiştirmek demekti.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualized ? rows.length : 0,
    estimateSize: (index) =>
      rows[index]?.type === "group"
        ? GROUP_HEADER_ESTIMATED_HEIGHT_PX
        : MENTION_CARD_ESTIMATED_HEIGHT_PX,
    getItemKey: (index) => rows[index]?.key ?? `mention-row-${index}`,
    getScrollElement: () => scrollRef.current,
    overscan: VIRTUAL_OVERSCAN,
    useFlushSync: false,
  });

  const previousScrollHeightRef = useRef(0);
  const previousNewCountRef = useRef(newCount);
  const previousFirstUnpinnedMentionIdRef = useRef(firstUnpinnedMentionId);

  useFeedLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const firstMentionId = firstUnpinnedMentionId;
    const prependedAfterNotification =
      newCount > 0 &&
      previousFirstUnpinnedMentionIdRef.current !== null &&
      firstMentionId !== null &&
      firstMentionId !== previousFirstUnpinnedMentionIdRef.current;
    const compensation = computeFeedScrollCompensation({
      grew: newCount > previousNewCountRef.current || prependedAfterNotification,
      nextScrollHeight: element.scrollHeight,
      previousScrollHeight: previousScrollHeightRef.current,
      scrollTop: element.scrollTop,
    });

    if (compensation > 0) {
      element.scrollTop += compensation;
    }

    previousNewCountRef.current = newCount;
    previousFirstUnpinnedMentionIdRef.current = firstMentionId;
    previousScrollHeightRef.current = element.scrollHeight;
  });

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      onAtTopChange(isMentionFeedAtTop(element.scrollTop));
    }
  }, [onAtTopChange]);

  /**
   * Şeride basmak akışı **en üste** taşır. Kaydırmayı akış yapar çünkü kaydırılabilir eleman
   * burada; sayfanın onu bulmak için bir `ref` sızdırması, iki bileşeni birbirine bağlardı.
   */
  const handleShowNew = useCallback(() => {
    scrollRef.current?.scrollTo({ behavior: "smooth", top: 0 });
    onShowNew();
  }, [onShowNew]);

  /**
   * İmleç değiştiğinde kart görünür alana `nearest` ile alınır (PROMPT §5).
   *
   * Bağımlılık **yalnız `cursor`**. `rows` eklenseydi efekt imleçten bağımsız olarak koşardı:
   * `groups` her dakika (`useMinuteClock`) ve her `fetchNextPage` / iyimser yama / `mention:new`
   * sonrası yeni bir dizi kimliği alıyor. Sonuç, akışın dibine inen kullanıcıyı her yeni sayfada
   * imleç kartına geri fırlatmak — ve aynı commit'te ölçülmüş kaydırma telafisinin üstüne
   * yazmak olurdu.
   */
  useEffect(() => {
    if (!cursor) {
      return;
    }

    cardRefs.current.get(cursor)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    const node = sentinelRef.current;

    if (!node || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      // Kök **kaydırma kabı**, görünüm alanı değil. Kök verilmediğinde hedef önce her kırpma
      // kutusuna kırpılır ve `rootMargin` yalnız en dıştaki dikdörtgeni büyütür; sentinel
      // akışın içinde 200px yukarıdayken görünür sayılmaz ve sonraki sayfa geç istenir.
      { root: scrollRef.current, rootMargin: "200px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore, rows.length]);

  const mentionById = useMemo(() => {
    const map = new Map<string, Mention>();
    for (const group of groups) {
      for (const mention of group.items) {
        map.set(mention.id, mention);
      }
    }
    return map;
  }, [groups]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Kısayollar yalnız akış odaktayken; bir input/textarea odaktayken hiçbiri tetiklenmez
      // (PROMPT §5). Ayrım eleman türünden yapılır — yanıt kutusu Ş7'nin ve iç yapısı bilinmez.
      if (
        isTypingTarget(event.target as unknown as { isContentEditable?: boolean; tagName?: string })
      ) {
        return;
      }

      const shortcut = resolveMentionShortcut(event);
      if (!shortcut) {
        return;
      }

      if (shortcut === "next" || shortcut === "previous") {
        event.preventDefault();
        onCursorChange(moveMentionCursor(mentionIds, cursor, shortcut === "next" ? 1 : -1));
        return;
      }

      if (shortcut === "close") {
        onClose();
        return;
      }

      const active = cursor ? mentionById.get(cursor) : undefined;
      if (!active) {
        return;
      }

      event.preventDefault();

      if (shortcut === "reply") {
        onReply(active);
      } else {
        onToggleRead(active);
      }
    },
    [cursor, mentionById, mentionIds, onClose, onCursorChange, onReply, onToggleRead],
  );

  const registerCard = useCallback((mentionId: string, node: HTMLElement | null) => {
    if (node) {
      cardRefs.current.set(mentionId, node);
    } else {
      cardRefs.current.delete(mentionId);
    }
  }, []);

  const renderRow = useCallback(
    (row: MentionFeedRow) => {
      if (row.type === "group") {
        return (
          <GroupHeader
            countLabel={groupCountLabel}
            group={row.group}
            label={groupLabel(row.group.label)}
          />
        );
      }

      const { mention } = row;
      const cardIndex = cardIndexById.get(mention.id) ?? 0;

      return (
        <div
          data-mention-id={mention.id}
          ref={(node) => registerCard(mention.id, node)}
          style={{
            // Grubun son kartı grup arası boşluğu da taşır; düz listede `gap` yok.
            paddingBottom: pxToRem(
              row.lastInGroup ? feed.groupBodyPaddingBottom + feed.gap : feed.groupBodyGap,
            ),
          }}
        >
          {renderCard({
            active: cursor === mention.id,
            contextOpen: panelId === mention.id,
            menuDirection: resolveMentionMenuDirection(cardIndex),
            menuOpen: menuId === mention.id,
            mention,
            onContext: () => onContext(mention),
            onMenuAction: (action) => onMenuAction(mention, action),
            onMenuToggle: () => onMenuToggle(mention),
            onOpen: () => onOpen(mention),
            onReply: () => onReply(mention),
            onToggleRead: () => onToggleRead(mention),
            replyOpen: replyId === mention.id,
            ...(replyId === mention.id && renderReply ? { replySlot: renderReply(mention) } : {}),
          })}
        </div>
      );
    },
    [
      cardIndexById,
      cursor,
      groupCountLabel,
      groupLabel,
      menuId,
      onContext,
      onMenuAction,
      onMenuToggle,
      onOpen,
      onReply,
      onToggleRead,
      panelId,
      registerCard,
      renderCard,
      renderReply,
      replyId,
    ],
  );

  const scrollStyle: CSSProperties = {
    overflowAnchor: "none",
    padding: `${pxToRem(feed.paddingTop)} ${pxToRem(feed.paddingX)} ${pxToRem(feed.paddingBottom)}`,
  };

  const showEmptyState = !loading && !error && groups.length === 0;

  /**
   * Boş durum ve hata bloğu kaydırma kabının **kardeşi**, çocuğu değil.
   *
   * Referans HTML'de de öyle: `isEmpty` bloğu `padding:16px 24px 20px` taşıyan akış kabının
   * dışında ve tek dolgusu SPEC §8'in `padding:40`'ı. Kabın içine konsaydı iki dolgu toplanır,
   * 456px'lik dar akışta metne kalan genişlik 376 yerine 328'e düşer ve dikeyde 56/60'lık bir
   * asimetri doğardı — ortalanmış blok gerçek merkezin üstünde dururdu.
   */
  if (error || showEmptyState) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="mentions-feed-shell">
        {error ? (
          <div
            className="flex flex-1 flex-col items-center justify-center text-[hsl(var(--text-muted))]"
            data-testid="mentions-feed-error"
            style={{
              fontSize: pxToRem(feed.footerFontSize),
              gap: pxToRem(feed.footerGap),
              padding: pxToRem(emptyState.padding),
            }}
          >
            <p className="m-0">{t("mentions.feed.error")}</p>
            <button
              className="text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="mentions-feed-retry"
              onClick={onRetry}
              style={{ fontWeight: feed.groupLabelWeight }}
              type="button"
            >
              {t("mentions.feed.retry")}
            </button>
          </div>
        ) : (
          <MentionsEmptyState filtered={filtered} routeState={routeState} />
        )}
      </div>
    );
  }

  return (
    <div
      aria-busy={loading || undefined}
      aria-label={t("mentions.a11y.feedLabel")}
      // Akış klavye için odak durağı; odak halkası görünmezse `J`/`K`'nin nereye gittiği
      // ekranda hiçbir yerde yazmıyor olurdu.
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-inset"
      data-testid="mentions-feed"
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      ref={scrollRef}
      /**
       * `role="region"`, `role="feed"` değil — **sapma, gerekçesi ARIA sözleşmesi.**
       *
       * `feed` rolünün izin verdiği tek çocuk `article`. Bu akış grup başlıkları, yükleme
       * sentinel'i ve yeni bahsetme şeridi de taşıyor; axe `aria-required-children` kuralı
       * bunu **critical** seviyede kırıyor ve `/mentions` a11y taramasının kapsamında.
       * Şeridin bağladığı davranış — "kısayollar yalnız akış odaktayken" — `tabIndex` ile
       * sağlanıyor, rol adıyla değil.
       */
      role="region"
      style={scrollStyle}
      tabIndex={0}
    >
      <MentionsNewStrip count={newCount} onClick={handleShowNew} />

      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : virtualized ? (
        // Sanal kabın yüksekliği **ölçülmüş** bir değer, bir tasarım ölçüsü değil; rem'e
        // çevrilirse kök font boyutu değiştiğinde kaydırma çubuğu içerikten kopar.
        // `shrink-0` şart: kaydırma kabı bir kolon flex konteyneri ve sanal kabın tek
        // çocukları `position:absolute` olduğu için içerik tabanlı asgari boyutu 0'a çözülür.
        // Küçülme açık kalsaydı 30000px'lik kap görünür alan yüksekliğine iner, kaydırma
        // çubuğu listenin gerçek uzunluğunu göstermez ve telafi yanlış `scrollHeight` ölçerdi.
        <div
          className="shrink-0"
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];

            if (!row) {
              return null;
            }

            return (
              <div
                data-index={item.index}
                key={item.key}
                ref={virtualizer.measureElement}
                style={{
                  left: 0,
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${item.start}px)`,
                  width: "100%",
                }}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      ) : (
        rows.map((row) => <React.Fragment key={row.key}>{renderRow(row)}</React.Fragment>)
      )}

      {loading ? null : (
        <>
          <div
            aria-live="polite"
            data-testid="mentions-feed-sentinel"
            ref={sentinelRef}
            role="status"
            // Yükleme metni yokken yükseklik de yok: grubun son kartı grup arası boşluğu
            // zaten taşıyor ve sabit 4px onun üstüne binerdi.
            style={{ minHeight: loadingMore ? pxToRem(feed.footerPaddingTop) : 0 }}
          >
            {loadingMore ? t("mentions.feed.loadingMore") : ""}
          </div>

          {routeState.window === "all" ? null : (
            <div
              className="flex items-center justify-center text-[hsl(var(--text-muted))]"
              data-testid="mentions-feed-footer"
              style={{
                fontSize: pxToRem(feed.footerFontSize),
                gap: pxToRem(feed.footerGap),
                paddingTop: pxToRem(feed.footerPaddingTop),
              }}
            >
              <span
                aria-hidden="true"
                className="flex-1"
                style={{ background: "hsl(var(--border)/0.4)", height: hairline() }}
              />
              {t("mentions.feed.footer")}
              <span
                aria-hidden="true"
                className="flex-1"
                style={{ background: "hsl(var(--border)/0.4)", height: hairline() }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
