"use client";

import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceServerDetail } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import {
  ServerModalShell,
  serverModalFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "@/components/servers/modals/server-modal-shell";
import {
  SERVER_EVENT_DESCRIPTION_MAX_LENGTH,
  SERVER_EVENT_INITIAL_STATE,
  SERVER_EVENT_NAME_MAX_LENGTH,
  buildServerEventPayload,
  buildServerEventUpdatePayload,
  clampServerEventDate,
  clampServerEventDescription,
  clampServerEventName,
  clampServerEventTime,
  formatServerEventCounter,
  isServerEventCounterWarning,
  isServerEventFieldFilled,
  selectServerEventFooterNote,
  toServerEventChannelOptions,
  toServerEventFormState,
  validateServerEventForm,
  type ServerEventChannelOption,
  type ServerEventFormState,
} from "@/lib/servers/event-form";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  createServerEventRequest,
  listServerEventsRequest,
  updateServerEventRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

/**
 * SPEC-SUNUCU §6.5 — "Etkinlik oluştur" penceresi (560).
 *
 * Sunucu ayarları › Etkinlikler'den açılır ve K11 gereği **ayarların üstünde** çizilir
 * (`ui/modal` `z-80`, ayarlar 70); kapanınca ayarlar açık kalır.
 *
 * Alanların hepsi denetimli, karar veren hiçbir şey burada değil: sayaçlar, `gg.aa.yyyy` →
 * ISO çevrimi, sıralama kuralı ve `entityType` türetimi `lib/servers/event-form.ts` içinde.
 * Bu dosya yalnız çiziyor ve `POST /servers/[serverId]/events`'e gövdeyi veriyor.
 */

const { eventModal, modal } = SERVER_METRICS;

const CALENDAR_PATH =
  "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const CLOCK_PATH = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2";
const HASH_PATH = "M10 3 8 21M16 3l-2 18M3.5 8.5h17M3 15.5h17";
const SPEAKER_PATH = "M11 5 6 9H3v6h3l5 4z M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13";

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(19)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={pxToEm(19)}
    >
      <path d={CALENDAR_PATH} />
    </svg>
  );
}

function fieldLabelStyle(): React.CSSProperties {
  return {
    color: "hsl(var(--text-muted))",
    fontFamily: "var(--font-display)",
    fontSize: pxToRem(modal.labelFontSize),
    fontWeight: 600,
    letterSpacing: `${modal.labelLetterSpacing}em`,
    lineHeight: 1,
    textTransform: "uppercase",
  };
}

function badgeStyle(required: boolean): React.CSSProperties {
  return {
    background: required ? "hsl(var(--danger)/0.14)" : "hsl(var(--surface-tertiary))",
    borderRadius: pxToRem(modal.badgeRadius),
    color: required ? "hsl(var(--danger))" : "hsl(var(--text-muted))",
    fontFamily: "var(--font-display)",
    fontSize: pxToRem(modal.badgeFontSize),
    fontWeight: 600,
    lineHeight: 1,
    paddingBlock: pxToRem(modal.badgePaddingY),
    paddingInline: pxToRem(modal.badgePaddingX),
  };
}

function counterStyle(warn: boolean): React.CSSProperties {
  return {
    color: warn ? "hsl(var(--warning))" : "hsl(var(--text-muted))",
    fontFamily: "var(--font-display)",
    fontSize: pxToRem(modal.counterFontSize),
    fontWeight: 600,
    lineHeight: 1,
  };
}

/** Dolu alanın çerçevesi `primary/.5` (§6.5). */
function filledBorderColor(filled: boolean): string {
  return filled ? "hsl(var(--primary)/0.5)" : "hsl(var(--border))";
}

export type CreateEventModalViewProps = {
  readonly channels: readonly ServerEventChannelOption[];
  readonly firstFieldRef?: React.RefObject<HTMLInputElement | null> | undefined;
  readonly onChange: (patch: Partial<ServerEventFormState>) => void;
  readonly state: ServerEventFormState;
};

export function CreateEventModalView({
  channels,
  firstFieldRef,
  onChange,
  state,
}: CreateEventModalViewProps) {
  const { t } = useI18n();

  const timeFields = [
    {
      icon: CALENDAR_PATH,
      key: "date" as const,
      label: t("server.modal.event.date.label"),
      placeholder: "18.08.2026",
      value: state.date,
    },
    {
      icon: CLOCK_PATH,
      key: "startTime" as const,
      label: t("server.modal.event.start.label"),
      placeholder: "20:00",
      value: state.startTime,
    },
    {
      icon: CLOCK_PATH,
      key: "endTime" as const,
      label: t("server.modal.event.end.label"),
      placeholder: "21:00",
      value: state.endTime,
    },
  ];

  return (
    <div data-testid="create-event-modal-body">
      <div className="flex items-center" style={{ gap: pxToRem(modal.labelGap) }}>
        <span style={fieldLabelStyle()}>{t("server.modal.event.name.label")}</span>
        <span style={badgeStyle(true)}>{t("server.modal.event.required")}</span>
        <span
          className="ml-auto flex-none"
          data-testid="create-event-name-counter"
          style={counterStyle(
            isServerEventCounterWarning(state.name.length, SERVER_EVENT_NAME_MAX_LENGTH),
          )}
        >
          {formatServerEventCounter(state.name.length, SERVER_EVENT_NAME_MAX_LENGTH)}
        </span>
      </div>
      <input
        aria-label={t("server.modal.event.name.label")}
        className="w-full border bg-[hsl(var(--surface-base))] font-medium text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="create-event-name"
        onChange={(event) => onChange({ name: clampServerEventName(event.target.value) })}
        placeholder={t("server.modal.event.name.placeholder")}
        ref={firstFieldRef}
        style={{
          borderColor: filledBorderColor(isServerEventFieldFilled(state.name)),
          borderRadius: pxToRem(modal.inputRadius),
          borderWidth: hairline(),
          fontSize: pxToRem(modal.inputFontSize),
          marginTop: pxToRem(modal.inputMarginTop),
          paddingBlock: pxToRem(modal.inputPaddingY),
          paddingInline: pxToRem(modal.inputPaddingX),
        }}
        type="text"
        value={state.name}
      />

      <div
        className="flex items-center"
        style={{ gap: pxToRem(modal.labelGap), marginTop: pxToRem(eventModal.gridMarginTop) }}
      >
        <span style={fieldLabelStyle()}>{t("server.modal.event.description.label")}</span>
        <span style={badgeStyle(false)}>{t("server.modal.event.optional")}</span>
        <span
          className="ml-auto flex-none"
          data-testid="create-event-description-counter"
          style={counterStyle(
            isServerEventCounterWarning(
              state.description.length,
              SERVER_EVENT_DESCRIPTION_MAX_LENGTH,
            ),
          )}
        >
          {formatServerEventCounter(state.description.length, SERVER_EVENT_DESCRIPTION_MAX_LENGTH)}
        </span>
      </div>
      <textarea
        aria-label={t("server.modal.event.description.label")}
        className="w-full resize-none border bg-[hsl(var(--surface-base))] font-medium text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="create-event-description"
        onChange={(event) =>
          onChange({ description: clampServerEventDescription(event.target.value) })
        }
        placeholder={t("server.modal.event.description.placeholder")}
        rows={2}
        style={{
          borderColor: "hsl(var(--border))",
          borderRadius: pxToRem(modal.inputRadius),
          borderWidth: hairline(),
          fontSize: pxToRem(modal.textareaFontSize),
          lineHeight: modal.textareaLineHeight,
          marginTop: pxToRem(modal.inputMarginTop),
          paddingBlock: pxToRem(modal.textareaPaddingY),
          paddingInline: pxToRem(modal.inputPaddingX),
        }}
        value={state.description}
      />

      <div
        className="grid"
        style={{
          gap: pxToRem(eventModal.gridGap),
          gridTemplateColumns: `minmax(0,${eventModal.gridDateFraction}fr) minmax(0,1fr) minmax(0,1fr)`,
          marginTop: pxToRem(eventModal.gridMarginTop),
        }}
      >
        {timeFields.map((field) => (
          <div key={field.key}>
            <div className="flex items-center" style={{ gap: pxToRem(eventModal.labelGap) }}>
              <span style={fieldLabelStyle()}>{field.label}</span>
              <span
                aria-hidden="true"
                className="rounded-full"
                style={{
                  background: "hsl(var(--danger))",
                  height: pxToRem(eventModal.requiredDotSize),
                  width: pxToRem(eventModal.requiredDotSize),
                }}
              />
            </div>
            <div
              className="flex items-center border bg-[hsl(var(--surface-base))]"
              style={{
                borderColor: filledBorderColor(isServerEventFieldFilled(field.value)),
                borderRadius: pxToRem(eventModal.fieldRadius),
                borderWidth: hairline(),
                gap: pxToRem(eventModal.fieldGap),
                marginTop: pxToRem(eventModal.fieldMarginTop),
                paddingBlock: pxToRem(eventModal.fieldPaddingY),
                paddingInline: pxToRem(eventModal.fieldPaddingX),
              }}
            >
              <span aria-hidden="true" className="flex-none text-[hsl(var(--text-muted))]">
                <svg
                  fill="none"
                  height={pxToEm(14, 13.5)}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  viewBox="0 0 24 24"
                  width={pxToEm(14, 13.5)}
                >
                  <path d={field.icon} />
                </svg>
              </span>
              <input
                aria-label={field.label}
                aria-required="true"
                className="w-full border-0 bg-transparent font-medium text-[hsl(var(--foreground))] outline-hidden"
                data-testid={`create-event-${field.key}`}
                inputMode="numeric"
                onChange={(event) =>
                  onChange({
                    [field.key]:
                      field.key === "date"
                        ? clampServerEventDate(event.target.value)
                        : clampServerEventTime(event.target.value),
                  } as Partial<ServerEventFormState>)
                }
                placeholder={field.placeholder}
                style={{ fontSize: pxToRem(eventModal.fieldFontSize), lineHeight: 1 }}
                type="text"
                value={field.value}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: pxToRem(eventModal.channelSectionMarginTop) }}>
        <span style={fieldLabelStyle()}>{t("server.modal.event.channel.label")}</span>
      </div>
      <p
        className="text-[hsl(var(--text-muted))]"
        style={{
          fontSize: pxToRem(eventModal.channelHintFontSize),
          lineHeight: eventModal.channelHintLineHeight,
          marginTop: pxToRem(eventModal.channelHintMarginTop),
        }}
      >
        {t("server.modal.event.channel.hint")}
      </p>
      <div
        aria-label={t("server.modal.event.channel.label")}
        className="flex flex-wrap"
        role="group"
        style={{
          gap: pxToRem(eventModal.channelChipsGap),
          marginTop: pxToRem(eventModal.channelChipsMarginTop),
        }}
      >
        {channels.map((channel) => {
          const selected = channel.id === state.channelId;

          return (
            <button
              aria-pressed={selected}
              className="flex items-center border font-semibold whitespace-nowrap transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid={`create-event-channel-${channel.id}`}
              key={channel.id}
              onClick={() => onChange({ channelId: selected ? null : channel.id })}
              style={{
                background: selected ? "hsl(var(--primary)/0.16)" : "hsl(var(--surface-base))",
                borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)",
                borderRadius: pxToRem(eventModal.channelChipRadius),
                borderWidth: hairline(),
                color: selected ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                fontSize: pxToRem(eventModal.channelChipFontSize),
                gap: pxToRem(eventModal.channelChipGap),
                paddingBlock: pxToRem(eventModal.channelChipPaddingY),
                paddingInline: pxToRem(eventModal.channelChipPaddingX),
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="grid flex-none place-items-center"
                style={{
                  color: selected
                    ? "hsl(var(--primary))"
                    : channel.type === "VOICE"
                      ? "hsl(var(--success))"
                      : "hsl(var(--text-muted))",
                  height: pxToEm(eventModal.channelChipIconSize, eventModal.channelChipFontSize),
                  width: pxToEm(eventModal.channelChipIconSize, eventModal.channelChipFontSize),
                }}
              >
                <svg
                  fill="none"
                  height="100%"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  viewBox="0 0 24 24"
                  width="100%"
                >
                  <path d={channel.type === "VOICE" ? SPEAKER_PATH : HASH_PATH} />
                </svg>
              </span>
              {channel.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type CreateEventModalFooterProps = {
  readonly channels: readonly ServerEventChannelOption[];
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  readonly state: ServerEventFormState;
  readonly submitting: boolean;
};

/**
 * Ayak kabuğun `footer` yuvasına gider: gövde kaydırılırken (`scrollBody`) ayak yerinde
 * kalmalı ve kartın tam genişliğini kaplamalı — gövdenin 22px'lik iç boşluğunun içinde
 * çizilseydi ikisi de olmazdı.
 */
export function CreateEventModalFooter({
  channels,
  onCancel,
  onSubmit,
  state,
  submitting,
}: CreateEventModalFooterProps) {
  const { t } = useI18n();
  const note = selectServerEventFooterNote(state, channels);
  const submitEnabled = validateServerEventForm(state).valid && !submitting;

  return (
    <div className="flex flex-wrap items-center" style={serverModalFooterStyle()}>
      <span
        className="flex-1"
        data-testid="create-event-note"
        style={{
          color:
            note.kind === "summary"
              ? "hsl(var(--text-secondary))"
              : note.kind === "error"
                ? "hsl(var(--danger))"
                : "hsl(var(--warning))",
          fontSize: pxToRem(modal.footerNoteFontSize),
          lineHeight: modal.footerNoteLineHeight,
          minWidth: pxToRem(modal.footerNoteMinWidth),
        }}
      >
        {note.kind === "summary" ? note.text : t(note.messageKey)}
      </span>
      <button
        className="flex-none border font-semibold whitespace-nowrap transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="create-event-cancel"
        onClick={onCancel}
        style={serverModalSecondaryButtonStyle()}
        type="button"
      >
        {t("common.cancel")}
      </button>
      <button
        aria-disabled={!submitEnabled}
        className="flex-none border-0 font-semibold whitespace-nowrap transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="create-event-submit"
        disabled={!submitEnabled}
        onClick={onSubmit}
        style={serverModalPrimaryButtonStyle(submitEnabled)}
        type="button"
      >
        {t("server.modal.event.submit")}
      </button>
    </div>
  );
}

export type CreateEventModalProps = {
  readonly detail: WorkspaceServerDetail;
  /**
   * Ş13 — `Sunucu ayarları › Etkinlikler`in `Düzenle` düğmesi **aynı** pencereyi dolu açar.
   * `null` = yeni etkinlik. Ayrı bir düzenleme penceresi iki ayrı doğrulama ve iki ayrı ayak
   * demek olurdu; SPEC §8.8 açıkça aynı pencereyi istiyor.
   */
  readonly eventId?: string | null;
  readonly onClose: () => void;
  readonly open: boolean;
};

export function CreateEventModal({ detail, eventId = null, onClose, open }: CreateEventModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  /**
   * Form durumu **türetilir**, kopyalanmaz.
   *
   * Düzenlemede taban etkinlik listeden asenkron geliyor; onu bir `useEffect` içinde
   * `setState` ile kopyalamak hem bir kademe geç doldururdu hem de React'in
   * "efekt içinde setState" kuralını çiğnerdi. Bunun yerine taban her render'da etkinlikten
   * hesaplanır ve kullanıcı ilk tuşa bastığı anda `override` devralır.
   */
  const [override, setOverride] = useState<ServerEventFormState | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const channels = useMemo(() => toServerEventChannelOptions(detail), [detail]);
  const editing = Boolean(eventId);

  /**
   * Düzenlemede form zaten okunmuş etkinlik listesinden doldurulur. Ayrı bir "tek etkinlik"
   * ucu yok ve açmadık: bölüm listeyi `includePast` ile tam okuyor, pencere onu tekrar
   * çekseydi aynı satırın iki kopyası iki farklı anda tazelenirdi.
   */
  const eventsQuery = useQuery({
    enabled: open && editing,
    queryFn: () => listServerEventsRequest(detail.server.id, true),
    queryKey: workspaceQueryKeys.serverEvents(detail.server.id),
    staleTime: 15_000,
  });
  const editedEvent = eventId
    ? (eventsQuery.data?.events.find((row) => row.id === eventId) ?? null)
    : null;
  const state =
    override ?? (editedEvent ? toServerEventFormState(editedEvent) : SERVER_EVENT_INITIAL_STATE);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (eventId) {
        const updatePayload = buildServerEventUpdatePayload(state, channels);

        if (!updatePayload) {
          throw new Error("validation.event.endBeforeStart");
        }

        return updateServerEventRequest(detail.server.id, eventId, updatePayload);
      }

      const payload = buildServerEventPayload(state, channels);

      if (!payload) {
        throw new Error("validation.event.endBeforeStart");
      }

      return createServerEventRequest(detail.server.id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.serverEvents(detail.server.id),
      });
      onClose();
    },
  });

  return (
    <ServerModalShell
      closeLabel={t("common.close")}
      description={t("server.modal.event.description", { server: detail.server.name })}
      footer={
        <CreateEventModalFooter
          channels={channels}
          onCancel={onClose}
          onSubmit={() => saveMutation.mutate()}
          state={state}
          submitting={saveMutation.isPending}
        />
      }
      icon={<CalendarIcon />}
      initialFocusRef={firstFieldRef}
      onClose={onClose}
      open={open}
      scrollBody
      title={t("server.modal.event.title")}
      tone="primary"
      width="event"
    >
      <CreateEventModalView
        channels={channels}
        firstFieldRef={firstFieldRef}
        onChange={(patch) => setOverride({ ...state, ...patch })}
        state={state}
      />
    </ServerModalShell>
  );
}
