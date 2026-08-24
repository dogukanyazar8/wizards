"use client";

import React, { useDeferredValue, useMemo, useState } from "react";
import { Pin, Plus, Search, UserPlus } from "lucide-react";
import type { ConversationRowDTO } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MessagesRailRow } from "@/components/messages/messages-rail-row";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { MESSAGES_METRICS, hairline, pxToEm, pxToRem } from "@/lib/messages/metrics";
import { filterRailRows, splitRailSections } from "@/lib/messages/rail-presentation";
import { cn } from "@/lib/utils";

/**
 * Sohbet rayı (276) — SPEC §3.
 *
 * Başlıktaki toplam okunmamış sayısı **prop olarak** gelir ve çağıran onu
 * `useUnreadCounters`'tan okur; gezinme panelindeki `Mesajlar` rozeti de aynı
 * hook'tan besleniyor. PROMPT'un tek entegrasyon şartı bu: iki yüzey aynı sayıyı
 * göstermek zorunda, ve iki ayrı `reduce` iki ayrı cevap demek olurdu.
 *
 * Rayın altında **kullanıcı barı yoktur** (SPEC §3 son madde). Bar yalnız
 * gezinme panelinin ayağındadır; burada tekrarlanması iki kez çizilen ve iki
 * kez odaklanılabilen bir ayar düğmesi demek olurdu.
 *
 * Filtre/sıralama butonu: SPEC §3 metni başlığın sağında böyle bir buton tarif
 * ediyor, `referans/Mesajlar.dc.html` ise çizmiyor ve `screens/01` ile `08` de
 * onu doğruluyor. Otorite HTML olduğu için buton **yok**; sağda yalnız toplam
 * okunmamış rozeti var (`SPEC_DEVIATIONS`).
 */

const { rail } = MESSAGES_METRICS;

export type MessagesRailProps = {
  /** Açık sohbet; satır zeminini ve `aria-current`'ı sürer. */
  activeConversationId: string | null;
  loading: boolean;
  onNewGroup: () => void;
  onNewMessage: () => void;
  /** İskelet ve ilk ekran satır sayısı — ölçek adımından gelir. */
  rowCount: number;
  rows: readonly ConversationRowDTO[];
  /** Toplam okunmamış; nav panelindeki rozetle **aynı** kaynaktan. */
  unreadTotal: number;
};

function SectionHeading({
  count,
  icon,
  label,
}: {
  count: number;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className="flex items-center text-[hsl(var(--text-muted))]"
      style={{
        gap: pxToRem(rail.sectionGap),
        padding: `0 ${pxToRem(rail.sectionPaddingX)} ${pxToRem(rail.sectionPaddingBottom)}`,
      }}
    >
      {icon}
      <span
        className={cn("uppercase", DISPLAY_FONT)}
        style={{
          fontSize: pxToRem(rail.sectionLabelFontSize),
          fontWeight: 600,
          letterSpacing: "0.15em",
        }}
      >
        {label}
      </span>
      <span
        className={cn("text-[hsl(var(--text-muted)/0.8)]", DISPLAY_FONT)}
        style={{ fontSize: pxToRem(rail.sectionCountFontSize), fontWeight: 600 }}
      >
        {count}
      </span>
    </div>
  );
}

function RailSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <div
      className="flex flex-col"
      data-testid="messages-rail-skeleton"
      style={{ gap: pxToRem(rail.listGap), padding: `0 ${pxToRem(rail.listPaddingX)}` }}
    >
      {Array.from({ length: rowCount }, (_unused, index) => (
        <div
          className="flex items-center"
          key={index}
          style={{
            gap: pxToRem(rail.rowGap),
            padding: `${pxToRem(rail.rowPaddingY)} ${pxToRem(rail.rowPaddingX)}`,
          }}
        >
          <Skeleton
            className="shrink-0"
            style={{
              borderRadius: pxToRem(rail.rowAvatarRadius),
              height: pxToRem(rail.rowAvatarSize),
              width: pxToRem(rail.rowAvatarSize),
            }}
          />
          <div className="min-w-0 flex-1">
            <Skeleton style={{ height: pxToRem(rail.rowNameFontSize), width: "60%" }} />
            <Skeleton
              style={{
                height: pxToRem(rail.rowPreviewFontSize),
                marginTop: pxToRem(rail.rowPreviewMarginTop),
                width: "85%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessagesRail({
  activeConversationId,
  loading,
  onNewGroup,
  onNewMessage,
  rowCount,
  rows,
  unreadTotal,
}: MessagesRailProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  // Süzme her tuş vuruşunda listeyi yeniden çizer; `useDeferredValue` girdiyi
  // akıcı tutar ve listeyi bir kare geriden getirir.
  const deferredQuery = useDeferredValue(query);
  const sections = useMemo(
    () => splitRailSections(filterRailRows(rows, deferredQuery)),
    [deferredQuery, rows],
  );

  const searching = query.trim().length > 0;
  const empty = sections.pinned.length === 0 && sections.rest.length === 0;

  return (
    <section
      aria-label={t("messages.rail.title")}
      className="flex h-full min-h-0 flex-col bg-[hsl(var(--surface-panel))]"
      data-testid="messages-rail"
      style={{
        borderRight: `${hairline()} solid hsl(var(--border)/0.4)`,
        width: pxToRem(rail.width),
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{
          padding: `${pxToRem(rail.headerPaddingTop)} ${pxToRem(rail.headerPaddingX)} ${pxToRem(
            rail.headerPaddingBottom,
          )}`,
        }}
      >
        <h2
          className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
          style={{
            fontSize: pxToRem(rail.titleFontSize),
            fontWeight: rail.titleWeight,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {t("messages.rail.title")}
        </h2>
        {unreadTotal > 0 ? (
          <span
            className={cn(
              "grid place-items-center bg-[hsl(var(--danger))] text-white",
              DISPLAY_FONT,
            )}
            data-testid="messages-rail-unread-total"
            style={{
              borderRadius: pxToRem(rail.unreadBadgeRadius),
              fontSize: pxToRem(rail.unreadBadgeFontSize),
              fontWeight: 600,
              height: pxToRem(rail.unreadBadgeHeight),
              minWidth: pxToRem(rail.unreadBadgeMinWidth),
              padding: `0 ${pxToRem(rail.unreadBadgePaddingX)}`,
            }}
          >
            <span aria-hidden="true">{unreadTotal}</span>
            <span className="sr-only">
              {t("messages.rail.unreadLabel", { count: unreadTotal })}
            </span>
          </span>
        ) : null}
      </header>

      <div
        className="flex"
        style={{
          gap: pxToRem(rail.actionsGap),
          padding: `0 ${pxToRem(rail.actionsPaddingX)} ${pxToRem(rail.actionsPaddingBottom)}`,
        }}
      >
        <button
          className="flex flex-1 items-center justify-center bg-[hsl(var(--primary))] text-white transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="messages-rail-new-message"
          onClick={onNewMessage}
          style={{
            borderRadius: pxToRem(rail.primaryButtonRadius),
            fontSize: pxToRem(rail.primaryButtonFontSize),
            fontWeight: 600,
            gap: pxToRem(rail.actionsGap),
            height: pxToRem(rail.primaryButtonHeight),
          }}
          type="button"
        >
          <Plus
            aria-hidden="true"
            style={{
              height: pxToEm(rail.primaryButtonIconSize, rail.primaryButtonFontSize),
              width: pxToEm(rail.primaryButtonIconSize, rail.primaryButtonFontSize),
            }}
          />
          {t("messages.rail.newMessage")}
        </button>
        <button
          aria-label={t("messages.rail.newGroup")}
          className="grid shrink-0 place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="messages-rail-new-group"
          onClick={onNewGroup}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(rail.groupButtonRadius),
            height: pxToRem(rail.groupButtonSize),
            width: pxToRem(rail.groupButtonSize),
          }}
          type="button"
        >
          <UserPlus
            aria-hidden="true"
            style={{
              height: pxToRem(rail.groupButtonIconSize),
              width: pxToRem(rail.groupButtonIconSize),
            }}
          />
        </button>
      </div>

      <div
        style={{
          padding: `0 ${pxToRem(rail.searchPaddingX)} ${pxToRem(rail.searchPaddingBottom)}`,
        }}
      >
        <label
          className="flex items-center bg-[hsl(var(--surface-soft)/0.7)]"
          style={{
            border: `${hairline()} solid hsl(var(--border)/0.5)`,
            borderRadius: pxToRem(rail.searchRadius),
            gap: pxToRem(rail.searchGap),
            height: pxToRem(rail.searchHeight),
            padding: `0 ${pxToRem(rail.searchPaddingInline)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{ height: pxToRem(rail.searchIconSize), width: pxToRem(rail.searchIconSize) }}
          />
          <input
            className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
            data-testid="messages-rail-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("messages.rail.searchPlaceholder")}
            style={{ fontSize: pxToRem(rail.searchFontSize) }}
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <RailSkeleton rowCount={rowCount} />
        ) : empty ? (
          <p
            className="text-center text-[hsl(var(--text-muted))]"
            data-testid="messages-rail-empty"
            style={{
              fontSize: pxToRem(rail.rowPreviewFontSize),
              padding: `${pxToRem(rail.rowPaddingY * 3)} ${pxToRem(rail.listPaddingX)}`,
            }}
          >
            {searching ? t("messages.rail.searchEmpty") : t("messages.rail.empty")}
          </p>
        ) : (
          <>
            {sections.pinned.length > 0 ? (
              <>
                <SectionHeading
                  count={sections.pinned.length}
                  icon={
                    <Pin
                      aria-hidden="true"
                      style={{
                        height: pxToRem(rail.sectionIconSize),
                        width: pxToRem(rail.sectionIconSize),
                      }}
                    />
                  }
                  label={t("messages.rail.pinnedSection")}
                />
                <div
                  className="flex flex-col"
                  data-testid="messages-rail-pinned"
                  style={{ gap: pxToRem(rail.listGap), padding: `0 ${pxToRem(rail.listPaddingX)}` }}
                >
                  {sections.pinned.map((row) => (
                    <MessagesRailRow
                      active={row.id === activeConversationId}
                      href={`/messages/${row.id}`}
                      key={row.id}
                      row={row}
                    />
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    background: "hsl(var(--border)/0.5)",
                    height: hairline(),
                    margin: `${pxToRem(rail.dividerMarginTop)} ${pxToRem(
                      rail.dividerMarginX,
                    )} ${pxToRem(rail.dividerMarginBottom)}`,
                  }}
                />
              </>
            ) : null}

            {sections.rest.length > 0 ? (
              <>
                <SectionHeading
                  count={sections.rest.length}
                  label={t("messages.rail.conversationsSection")}
                />
                <div
                  className="flex flex-col"
                  data-testid="messages-rail-conversations"
                  style={{ gap: pxToRem(rail.listGap), padding: `0 ${pxToRem(rail.listPaddingX)}` }}
                >
                  {sections.rest.map((row) => (
                    <MessagesRailRow
                      active={row.id === activeConversationId}
                      href={`/messages/${row.id}`}
                      key={row.id}
                      row={row}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
