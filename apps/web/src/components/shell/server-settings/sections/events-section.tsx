"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import type { ServerScheduledEvent } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  SERVER_EVENTS_TABS,
  type ServerEventsTab,
  canCancelServerEvent,
  canEditServerEvent,
  formatServerEventTimeRange,
  selectServerEventsForTab,
  toServerEventDateBox,
} from "@/lib/servers/settings-events";
import { viewerCan } from "@/lib/servers/viewer-permissions";
import { useAppStore } from "@/lib/store";
import {
  cancelServerEventRequest,
  listServerEventsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

/**
 * `Sunucu ayarları › Etkinlikler` — SPEC-SUNUCU §8.8.
 *
 * `+ Etkinlik oluştur` ve `Düzenle` **aynı** pencereyi açar (Ş9'un §6.5'i); düzenlemede
 * pencere `eventId` ile doluyor. Pencere kabuğun `WorkspaceModals`'ında yaşadığı için buradan
 * yalnız mağaza tetikleniyor — ayarlar kaplamasının içine ikinci bir pencere ağacı koymak
 * K11'in katman kuralını iki yerde birden uygulamak olurdu.
 *
 * Yetki: `MANAGE_EVENTS` yoksa bölüm hiç render edilmez (00 §5).
 */

const PLUS_PATH = "M12 5v14M5 12h14";
const CLOCK_PATH = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2";
const SPEAKER_PATH = "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7";
const PEOPLE_PATH =
  "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z";
const CALENDAR_PATH =
  "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";

export type EventsSectionViewProps = {
  readonly canManage: boolean;
  readonly error: string | null;
  readonly events: readonly ServerScheduledEvent[];
  readonly onCancel: (eventId: string) => void;
  readonly onCreate: () => void;
  readonly onEdit: (eventId: string) => void;
  readonly onTabChange: (tab: ServerEventsTab) => void;
  readonly tab: ServerEventsTab;
};

export function EventsSectionView({
  canManage,
  error,
  events,
  onCancel,
  onCreate,
  onEdit,
  onTabChange,
  tab,
}: EventsSectionViewProps) {
  const { locale, t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const rows = selectServerEventsForTab(events, tab);

  return (
    <div data-testid="server-settings-events">
      <div
        className="flex flex-wrap items-center"
        style={{ gap: pxToRem(settingsSections.eventsToolbarGap) }}
      >
        <div
          aria-label={t("server.settings.events.tabsLabel")}
          className="flex border bg-[hsl(var(--surface-secondary))]"
          role="tablist"
          style={{
            borderColor: `hsl(var(--border)/${settingsSections.eventsSegmentBorderAlpha})`,
            borderRadius: pxToRem(settingsSections.eventsSegmentRadius),
            gap: pxToRem(settingsSections.eventsSegmentGap),
            padding: pxToRem(settingsSections.eventsSegmentPadding),
          }}
        >
          {SERVER_EVENTS_TABS.map((value) => {
            const active = value === tab;

            return (
              <button
                aria-selected={active}
                className="whitespace-nowrap border-0 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid={`server-settings-events-tab-${value}`}
                key={value}
                onClick={() => onTabChange(value)}
                role="tab"
                style={{
                  background: active ? "hsl(var(--surface-card))" : "transparent",
                  borderRadius: pxToRem(settingsSections.eventsTabRadius),
                  color: active ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
                  fontSize: pxToRem(settingsSections.eventsTabFontSize),
                  fontWeight: 600,
                  height: pxToRem(settingsSections.eventsTabHeight),
                  lineHeight: 1,
                  padding: `0 ${pxToRem(settingsSections.eventsTabPaddingX)}`,
                }}
                type="button"
              >
                {t(`server.settings.events.tab.${value}`)}
              </button>
            );
          })}
        </div>
        {canManage ? (
          <button
            className="ml-auto flex items-center border-0 text-[hsl(var(--primary-foreground))] transition-[filter] hover:brightness-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-settings-events-create"
            onClick={onCreate}
            style={{
              background: "hsl(var(--primary))",
              borderRadius: pxToRem(settingsSections.eventsCreateRadius),
              boxShadow: "0 12px 26px -18px hsl(var(--primary))",
              fontSize: pxToRem(settingsSections.eventsCreateFontSize),
              fontWeight: 600,
              gap: pxToRem(settingsSections.eventsCreateGap),
              height: pxToRem(settingsSections.eventsCreateHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(settingsSections.eventsCreatePaddingX)}`,
              whiteSpace: "nowrap",
            }}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height={pxToEm(14, settingsSections.eventsCreateFontSize)}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.4}
              viewBox="0 0 24 24"
              width={pxToEm(14, settingsSections.eventsCreateFontSize)}
            >
              <path d={PLUS_PATH} />
            </svg>
            {t("server.settings.events.create")}
          </button>
        ) : null}
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(settingsSections.eventsListGap),
          marginTop: pxToRem(settingsSections.eventsListMarginTop),
        }}
      >
        {rows.map((event) => {
          const dateBox = toServerEventDateBox(event.scheduledStartAt, locale);
          const cancelled = event.status === "CANCELLED";

          return (
            <div
              className="flex items-center border bg-[hsl(var(--surface-card))]"
              data-testid={`server-settings-event-${event.id}`}
              key={event.id}
              style={{
                borderColor: `hsl(var(--border)/${settingsSections.membersRowBorderAlpha})`,
                borderRadius: pxToRem(settingsSections.eventsCardRadius),
                gap: pxToRem(settingsSections.eventsCardGap),
                opacity: cancelled ? settingsSections.eventsCancelledOpacity : 1,
                padding: `${pxToRem(settingsSections.eventsCardPaddingY)} ${pxToRem(
                  settingsSections.eventsCardPaddingX,
                )}`,
              }}
            >
              <div
                className="flex flex-none flex-col items-center justify-center"
                style={{
                  background: `hsl(var(--primary)/${settingsSections.eventsDateBoxBackgroundAlpha})`,
                  borderRadius: pxToRem(settingsSections.eventsDateBoxRadius),
                  color: "hsl(var(--primary))",
                  gap: pxToRem(settingsSections.eventsDateBoxGap),
                  height: pxToRem(settingsSections.eventsDateBoxHeight),
                  width: pxToRem(settingsSections.eventsDateBoxWidth),
                }}
              >
                <span
                  style={{
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settingsSections.eventsDayFontSize),
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {dateBox.day}
                </span>
                <span
                  style={{
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settingsSections.eventsMonthFontSize),
                    fontWeight: 600,
                    letterSpacing: `${settingsSections.eventsMonthLetterSpacing}em`,
                    lineHeight: 1,
                  }}
                >
                  {dateBox.month}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center"
                  style={{ gap: pxToRem(settingsSections.eventsTitleGap) }}
                >
                  <span
                    className="min-w-0 truncate text-[hsl(var(--foreground))]"
                    style={{
                      fontFamily: DISPLAY_FONT,
                      fontSize: pxToRem(settingsSections.eventsTitleFontSize),
                      fontWeight: 600,
                      letterSpacing: DISPLAY_TRACKING,
                      lineHeight: 1.2,
                    }}
                  >
                    {event.name}
                  </span>
                  {cancelled ? (
                    <span
                      className="flex-none"
                      style={{
                        background: "hsl(var(--danger)/0.14)",
                        borderRadius: pxToRem(settingsSections.eventsCancelledChipRadius),
                        color: "hsl(var(--danger))",
                        fontFamily: DISPLAY_FONT,
                        fontSize: pxToRem(settingsSections.eventsCancelledChipFontSize),
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: `${pxToRem(
                          settingsSections.eventsCancelledChipPaddingY,
                        )} ${pxToRem(settingsSections.eventsCancelledChipPaddingX)}`,
                      }}
                    >
                      {t("server.settings.events.cancelledBadge")}
                    </span>
                  ) : null}
                </div>
                <div
                  className="text-pretty text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(settingsSections.eventsDescriptionFontSize),
                    lineHeight: settingsSections.eventsDescriptionLineHeight,
                    marginTop: pxToRem(settingsSections.eventsDescriptionMarginTop),
                  }}
                >
                  {event.description ?? t("server.settings.events.noDescription")}
                </div>
                <div
                  className="flex flex-wrap items-center"
                  style={{
                    gap: pxToRem(settingsSections.eventsChipsGap),
                    marginTop: pxToRem(settingsSections.eventsChipsMarginTop),
                  }}
                >
                  <EventChip iconPath={CLOCK_PATH}>
                    {formatServerEventTimeRange(
                      event.scheduledStartAt,
                      event.scheduledEndAt,
                      locale,
                    )}
                  </EventChip>
                  {event.channelName ? (
                    <EventChip iconPath={SPEAKER_PATH} tone="success">
                      {event.channelName}
                    </EventChip>
                  ) : null}
                  <EventChip iconPath={PEOPLE_PATH}>
                    {t("server.settings.events.interested", { count: event.interestedCount })}
                  </EventChip>
                </div>
              </div>

              {canManage ? (
                <div
                  className="flex flex-none items-center"
                  style={{ gap: pxToRem(settingsSections.eventsActionGap) }}
                >
                  {canEditServerEvent(event) ? (
                    <button
                      className="border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      data-testid={`server-settings-event-edit-${event.id}`}
                      onClick={() => onEdit(event.id)}
                      style={{
                        borderRadius: pxToRem(settingsSections.eventsActionRadius),
                        fontSize: pxToRem(settingsSections.eventsActionFontSize),
                        fontWeight: 600,
                        height: pxToRem(settingsSections.eventsActionHeight),
                        lineHeight: 1,
                        padding: `0 ${pxToRem(settingsSections.eventsActionPaddingX)}`,
                      }}
                      type="button"
                    >
                      {t("server.settings.events.edit")}
                    </button>
                  ) : null}
                  {canCancelServerEvent(event) ? (
                    <button
                      className="border text-[hsl(var(--danger))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      data-testid={`server-settings-event-cancel-${event.id}`}
                      onClick={() => onCancel(event.id)}
                      style={{
                        background: "transparent",
                        borderColor: "hsl(var(--danger)/0.35)",
                        borderRadius: pxToRem(settingsSections.eventsActionRadius),
                        fontSize: pxToRem(settingsSections.eventsActionFontSize),
                        fontWeight: 600,
                        height: pxToRem(settingsSections.eventsActionHeight),
                        lineHeight: 1,
                        padding: `0 ${pxToRem(settingsSections.eventsActionPaddingX)}`,
                      }}
                      type="button"
                    >
                      {t("server.settings.events.cancel")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center border border-dashed border-[hsl(var(--border))] text-[hsl(var(--text-muted))]"
          data-testid="server-settings-events-empty"
          style={{
            borderRadius: pxToRem(settingsSections.eventsEmptyRadius),
            gap: pxToRem(settingsSections.eventsEmptyGap),
            marginTop: pxToRem(settingsSections.eventsEmptyMarginTop),
            padding: `${pxToRem(settingsSections.eventsEmptyPaddingY)} ${pxToRem(
              settingsSections.eventsEmptyPaddingX,
            )}`,
          }}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height={pxToRem(settingsSections.eventsEmptyIconSize)}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            viewBox="0 0 24 24"
            width={pxToRem(settingsSections.eventsEmptyIconSize)}
          >
            <path d={CALENDAR_PATH} />
          </svg>
          <span
            style={{
              fontSize: pxToRem(settingsSections.eventsEmptyFontSize),
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {t(`server.settings.events.empty.${tab}`)}
          </span>
        </div>
      ) : null}

      {error ? (
        <div
          className="text-[hsl(var(--danger))]"
          role="alert"
          style={{
            fontSize: pxToRem(settingsSections.eventsChipFontSize),
            lineHeight: 1.45,
            marginTop: pxToRem(settingsSections.eventsListMarginTop),
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function EventChip({
  children,
  iconPath,
  tone = "neutral",
}: {
  readonly children: React.ReactNode;
  readonly iconPath: string;
  readonly tone?: "neutral" | "success";
}) {
  const { settingsSections } = SERVER_METRICS;

  return (
    <span
      className="flex items-center"
      style={{
        background: tone === "success" ? "hsl(var(--success)/0.14)" : "hsl(var(--surface-soft))",
        borderRadius: pxToRem(settingsSections.eventsChipRadius),
        color: tone === "success" ? "hsl(var(--success))" : "hsl(var(--text-secondary))",
        fontSize: pxToRem(settingsSections.eventsChipFontSize),
        fontWeight: 600,
        gap: pxToRem(settingsSections.eventsChipGap),
        lineHeight: 1,
        padding: `${pxToRem(settingsSections.eventsChipPaddingY)} ${pxToRem(
          settingsSections.eventsChipPaddingX,
        )}`,
      }}
    >
      <svg
        aria-hidden="true"
        fill="none"
        height={pxToEm(12, settingsSections.eventsChipFontSize)}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        viewBox="0 0 24 24"
        width={pxToEm(12, settingsSections.eventsChipFontSize)}
      >
        <path d={iconPath} />
      </svg>
      {children}
    </span>
  );
}

/** 00 §5 · lane §3 — `MANAGE_EVENTS` kapısı **kancalardan önce** (gerekçe: `danger-section`). */
export function EventsSection(props: ServerSettingsSectionProps) {
  if (!viewerCan(props.permissions, "MANAGE_EVENTS")) {
    return null;
  }

  return <EventsSectionContent {...props} />;
}

function EventsSectionContent({ detail }: ServerSettingsSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const openServerEventModal = useAppStore((store) => store.openServerEventModal);
  const serverId = detail.server.id;
  const [tab, setTab] = useState<ServerEventsTab>("upcoming");
  const [error, setError] = useState<string | null>(null);
  /**
   * `includePast` **her zaman** açık: iki sekme tek listeden türüyor ve `İptal edilen` sekmesi
   * filtresiz uçtan hiç beslenemezdi (uç yalnız `SCHEDULED`/`ACTIVE` döndürüyor).
   */
  const eventsQuery = useQuery({
    queryFn: () => listServerEventsRequest(serverId, true),
    queryKey: workspaceQueryKeys.serverEvents(serverId),
    staleTime: 15_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (eventId: string) => cancelServerEventRequest(serverId, eventId),
    onError: () => setError(t("server.settings.events.error")),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.serverEvents(serverId) });
    },
  });

  return (
    <EventsSectionView
      canManage
      error={error}
      events={eventsQuery.data?.events ?? []}
      onCancel={(eventId) => cancelMutation.mutate(eventId)}
      onCreate={() => openServerEventModal(serverId)}
      onEdit={(eventId) => openServerEventModal(serverId, { eventId })}
      onTabChange={setTab}
      tab={tab}
    />
  );
}

export default EventsSection;
