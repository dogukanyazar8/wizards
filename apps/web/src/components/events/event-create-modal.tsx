"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import type { CreateEventInput, WorkspaceServerDetail } from "@wizards/types";

import { EventDateTimeField } from "@/components/events/event-datetime-field";
import { EventKindPicker } from "@/components/events/event-kind-picker";
import { EventPlacePicker } from "@/components/events/event-place-picker";
import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { useToast } from "@/hooks/use-toast";
import { createEvent } from "@/lib/events/client";
import { invalidateEventQueries } from "@/lib/events/invalidate-event-queries";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import {
  EVENT_CREATE_DURATIONS,
  EVENT_CREATE_DESCRIPTION_MAX,
  EVENT_CREATE_TITLE_MAX,
  canListEventInDiscover,
  createEventFormInitialState,
  selectEventPlaceServers,
  validateEventCreateForm,
  withEventServerType,
  type EventCreateDuration,
  type EventCreateFormAction,
  type EventCreateFormErrorCode,
  type EventCreateFormState,
  type EventPlaceChannel,
  type EventPlaceServer,
} from "@/lib/events/create-form";
import { eventCreateFormReducer } from "@/lib/events/create-form";
import type { EventDetailResponse } from "@/lib/events/detail-contract";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import {
  fetchWorkspaceServer,
  fetchWorkspaceServers,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

/**
 * Etkinlik oluştur modalı — SPEC §6.
 *
 * Kural yok, çizim var: alan durumu, türe göre kanal süzme ve doğrulama `lib/events/create-form.ts`
 * içinde yaşıyor. Bu dosya onu bir forma bağlar.
 *
 * **Tekrar alanı yoktur** (K6): alt metnin kendisi "Tekrar eden etkinlikler oluşturulduktan sonra
 * ayarlanır" diyor ve tasarımda bir alan çizilmiyor. `recurrenceRule` kolonu şemada duruyor,
 * kurma yüzeyi bu pakette yok.
 *
 * Kabuk `components/ui/modal`: `Esc`, focus tuzağı ve kapanışta tetikleyiciye dönüş oradan gelir;
 * burada ikinci bir tuzak yazılmaz. Açılışta odak tür ızgarasının **ilk seçeneğine** düşer
 * (`initialFocusRef`), kapat düğmesine değil.
 */

const { createModal } = EVENTS_METRICS;

/** SPEC §6 — 560 px kart, 22 yarıçap. Sınıf ve sözlük `event-create-modal.test.tsx`te kilitli. */
export const EVENT_CREATE_MODAL_CARD_STYLE = {
  borderRadius: pxToRem(createModal.cardRadius),
  width: pxToRem(createModal.width),
} as const;

export const EVENT_CREATE_MODAL_CARD_CLASS =
  "w-full max-w-[35rem] overflow-y-auto rounded-[1.375rem] rounded-t-[1.375rem] bg-[hsl(var(--surface-card))] p-0 sm:rounded-[1.375rem] sm:p-0";

export const EVENT_CREATE_MODAL_OVERLAY_CLASS =
  "items-center bg-[hsl(var(--backdrop)/0.62)] p-10 sm:p-10";

export type EventCreateFormProps = {
  readonly channels: readonly EventPlaceChannel[];
  readonly dispatch: (action: EventCreateFormAction) => void;
  readonly errors: readonly EventCreateFormErrorCode[];
  readonly firstKindRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  readonly onCancel: () => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly onTogglePlace: () => void;
  readonly placeOpen: boolean;
  readonly saveError: string | null;
  readonly servers: readonly EventPlaceServer[];
  readonly state: EventCreateFormState;
  readonly submitting: boolean;
};

function fieldLabelStyle() {
  return {
    color: "hsl(var(--text-muted))",
    fontSize: pxToRem(createModal.fieldLabelFontSize),
    fontWeight: createModal.fieldLabelWeight,
    letterSpacing: `${createModal.fieldLabelLetterSpacing}em`,
    lineHeight: 1,
    paddingBottom: pxToRem(createModal.fieldLabelPaddingBottom),
  } as const;
}

function errorStyle() {
  return {
    color: "hsl(var(--danger))",
    fontSize: pxToRem(createModal.publicSubFontSize),
    marginTop: pxToRem(createModal.publicSubMarginTop),
  } as const;
}

export function EventCreateForm({
  channels,
  dispatch,
  errors,
  firstKindRef,
  onCancel,
  onClose,
  onSubmit,
  onTogglePlace,
  placeOpen,
  saveError,
  servers,
  state,
  submitting,
}: EventCreateFormProps) {
  const { t } = useI18n();
  const kindLabelId = useId();
  const durationLabelId = useId();
  const publicTitleId = useId();
  const publicSubId = useId();
  const publicEnabled = canListEventInDiscover(state.server);
  const disabled = submitting || servers.length === 0;

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/${createModal.headerBorderAlpha})`,
          gap: pxToRem(createModal.headerGap),
          padding: [
            pxToRem(createModal.headerPaddingTop),
            pxToRem(createModal.headerPaddingX),
            pxToRem(createModal.headerPaddingBottom),
          ].join(" "),
        }}
      >
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center"
          style={{
            background: `hsl(var(--primary)/${createModal.headerIconSurfaceAlpha})`,
            borderRadius: pxToRem(createModal.headerIconRadius),
            color: "hsl(var(--primary))",
            height: pxToRem(createModal.headerIconSize),
            width: pxToRem(createModal.headerIconSize),
          }}
        >
          <CalendarPlus
            style={{
              height: pxToEm(createModal.headerIconGlyphSize),
              width: pxToEm(createModal.headerIconGlyphSize),
            }}
          />
        </span>

        <div className="min-w-0">
          <div
            className="font-display"
            style={{
              color: "hsl(var(--foreground))",
              fontSize: pxToRem(createModal.titleFontSize),
              fontWeight: createModal.titleWeight,
              lineHeight: createModal.titleLineHeight,
            }}
          >
            {t("events.create.title")}
          </div>
          <div
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(createModal.subtitleFontSize),
              marginTop: pxToRem(createModal.subtitleMarginTop),
            }}
          >
            {t("events.create.subtitle")}
          </div>
        </div>

        <WindowCloseButton
          aria-label={t("events.create.close")}
          className="ml-auto"
          onClick={onClose}
          testId="events-create-close"
        />
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(createModal.bodyGap),
          padding: `${pxToRem(createModal.bodyPaddingY)} ${pxToRem(createModal.bodyPaddingX)}`,
        }}
      >
        <div>
          <div id={kindLabelId} style={fieldLabelStyle()} className="uppercase font-display">
            {t("events.create.kindLabel")}
          </div>
          <EventKindPicker
            firstOptionRef={firstKindRef}
            labelledById={kindLabelId}
            onSelect={(kind) => dispatch({ kind, type: "setKind" })}
            value={state.kind}
          />
        </div>

        <div>
          <div className="uppercase font-display" style={fieldLabelStyle()}>
            {t("events.create.titleLabel")}
          </div>
          <Input
            className="border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-base))]"
            data-testid="events-create-title"
            maxLength={EVENT_CREATE_TITLE_MAX}
            onChange={(event) => dispatch({ title: event.target.value, type: "setTitle" })}
            placeholder={t("events.create.titlePlaceholder")}
            style={{
              borderRadius: pxToRem(createModal.inputRadius),
              fontSize: pxToRem(createModal.inputFontSize),
              height: pxToRem(createModal.inputHeight),
              paddingLeft: pxToRem(createModal.inputPaddingX),
              paddingRight: pxToRem(createModal.inputPaddingX),
            }}
            value={state.title}
          />
          {errors.includes("title") ? (
            <p style={errorStyle()}>{t("events.create.titleInvalid")}</p>
          ) : null}
        </div>

        <label className="grid gap-2">
          <span className="uppercase font-display" style={fieldLabelStyle()}>
            {t("server.modal.event.field.description")}
          </span>
          <textarea
            className="min-h-20 w-full resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="events-create-description"
            maxLength={EVENT_CREATE_DESCRIPTION_MAX}
            onChange={(event) => dispatch({ type: "setDescription", value: event.target.value })}
            value={state.description}
          />
          {errors.includes("description") ? (
            <span style={errorStyle()}>{t("events.create.descriptionInvalid")}</span>
          ) : null}
        </label>

        <div
          className="grid grid-cols-1 sm:grid-cols-2"
          style={{
            gap: pxToRem(createModal.fieldRowGap),
          }}
        >
          <div>
            <div className="uppercase font-display" style={fieldLabelStyle()}>
              {t("events.create.whenLabel")}
            </div>
            <EventDateTimeField
              invalid={errors.includes("startsAt")}
              onChange={(value) => dispatch({ type: "setStartsAt", value })}
              value={state.startsAtLocal}
            />
            {errors.includes("startsAt") ? (
              <p style={errorStyle()}>{t("events.create.whenInvalid")}</p>
            ) : null}
          </div>

          <div className="min-w-0">
            <div className="uppercase font-display" id={durationLabelId} style={fieldLabelStyle()}>
              {t("events.create.durationLabel")}
            </div>
            {/*
              SegmentedControl ölçülerini `lib/messages/metrics` sözlüğünden alıyor (28 px buton,
              11 yarıçap, kenarsız) ve SPEC §6'nın 40 px'lik, kenarlı, tam genişlik segmentini
              taşıyamıyor. Rapora sapma olarak yazıldı; semantik aynı: radiogroup + roving tabindex.
            */}
            <div
              aria-labelledby={durationLabelId}
              className="flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-testid="events-duration-options"
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!step && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const index =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? EVENT_CREATE_DURATIONS.length - 1
                      : (EVENT_CREATE_DURATIONS.indexOf(state.duration) +
                          step +
                          EVENT_CREATE_DURATIONS.length) %
                        EVENT_CREATE_DURATIONS.length;
                const duration = EVENT_CREATE_DURATIONS[index];
                if (duration === undefined) return;
                dispatch({ duration, type: "setDuration" });
                const button = event.currentTarget.querySelector<HTMLButtonElement>(
                  `[data-testid="events-duration-${duration}"]`,
                );
                button?.focus();
                button?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              role="radiogroup"
              style={{
                background: "hsl(var(--surface-soft))",
                border: `${hairline()} solid hsl(var(--border)/${createModal.durationSegmentBorderAlpha})`,
                borderRadius: pxToRem(createModal.durationSegmentRadius),
                boxSizing: "border-box",
                gap: pxToRem(createModal.durationSegmentGap),
                height: pxToRem(createModal.inputHeight),
                padding: pxToRem(createModal.durationSegmentPadding),
              }}
            >
              {EVENT_CREATE_DURATIONS.map((duration: EventCreateDuration) => {
                const selected = duration === state.duration;

                return (
                  <button
                    aria-checked={selected}
                    className="min-w-16 shrink-0 whitespace-nowrap px-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-safe:transition-colors"
                    data-testid={`events-duration-${duration}`}
                    key={duration}
                    onClick={() => dispatch({ duration, type: "setDuration" })}
                    role="radio"
                    style={{
                      background: selected ? "hsl(var(--primary))" : "transparent",
                      borderRadius: pxToRem(createModal.durationButtonRadius),
                      // Primary zemin üstündeki ters metin: PROMPT §4'ün tek renk istisnası.
                      color: selected
                        ? "hsl(var(--primary-foreground))"
                        : "hsl(var(--text-secondary))",
                      fontSize: pxToRem(createModal.durationButtonFontSize),
                      fontWeight: createModal.durationButtonWeight,
                      lineHeight: 1,
                    }}
                    tabIndex={selected ? 0 : -1}
                    type="button"
                  >
                    {t(`events.create.duration.${duration}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <div className="uppercase font-display" style={fieldLabelStyle()}>
            {t("events.create.placeLabel")}
          </div>
          <EventPlacePicker
            channels={channels}
            dispatch={dispatch}
            onToggle={onTogglePlace}
            open={placeOpen}
            servers={servers}
            state={state}
          />
          <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
            {t("events.create.placeOptional")}
          </p>
          {errors.includes("place") || errors.includes("server") ? (
            <p style={errorStyle()}>{t("events.create.placeInvalid")}</p>
          ) : null}
          {servers.length === 0 ? (
            <p data-testid="events-create-no-servers" style={errorStyle()}>
              {t("events.create.noServers")}
            </p>
          ) : null}
        </div>

        <div
          className="flex items-center"
          style={{
            background: `hsl(var(--surface-secondary)/${createModal.publicRowSurfaceAlpha})`,
            border: `${hairline()} solid hsl(var(--border)/${createModal.publicRowBorderAlpha})`,
            borderRadius: pxToRem(createModal.publicRowRadius),
            gap: pxToRem(createModal.publicRowGap),
            padding: `${pxToRem(createModal.publicRowPaddingY)} ${pxToRem(createModal.publicRowPaddingX)}`,
          }}
        >
          <div className="min-w-0 flex-1">
            <div
              id={publicTitleId}
              style={{
                color: "hsl(var(--foreground))",
                fontSize: pxToRem(createModal.publicTitleFontSize),
                fontWeight: createModal.publicTitleWeight,
                lineHeight: 1.3,
              }}
            >
              {t("events.create.public")}
            </div>
            <div
              id={publicSubId}
              style={{
                color: "hsl(var(--text-muted))",
                fontSize: pxToRem(createModal.publicSubFontSize),
                marginTop: pxToRem(createModal.publicSubMarginTop),
              }}
            >
              {publicEnabled ? t("events.create.publicSub") : t("events.create.publicDisabled")}
            </div>
          </div>

          <ToggleSwitch
            checked={state.isPublic}
            describedById={publicSubId}
            disabled={!publicEnabled}
            label={t("events.create.public")}
            labelledById={publicTitleId}
            onChange={(value) => dispatch({ type: "setPublic", value })}
            testId="events-create-public"
          />
        </div>

        {saveError ? (
          <p data-testid="events-create-error" role="alert" style={errorStyle()}>
            {saveError}
          </p>
        ) : null}
      </div>

      <div
        className="flex items-center"
        style={{
          borderTop: `${hairline()} solid hsl(var(--border)/${createModal.footerBorderAlpha})`,
          gap: pxToRem(createModal.footerGap),
          padding: [
            pxToRem(createModal.footerPaddingTop),
            pxToRem(createModal.footerPaddingX),
            pxToRem(createModal.footerPaddingBottom),
          ].join(" "),
        }}
      >
        <span
          className="flex-1"
          style={{
            color: "hsl(var(--text-muted))",
            fontSize: pxToRem(createModal.footerNoteFontSize),
          }}
        >
          {t("events.create.footerNote")}
        </span>

        <button
          className="focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-safe:transition-colors"
          data-testid="events-create-cancel"
          onClick={onCancel}
          style={{
            background: "hsl(var(--surface-card))",
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(createModal.footerButtonRadius),
            color: "hsl(var(--text-secondary))",
            fontSize: pxToRem(createModal.footerButtonFontSize),
            fontWeight: createModal.footerButtonWeight,
            height: pxToRem(createModal.footerButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(createModal.footerCancelPaddingX)}`,
          }}
          type="button"
        >
          {t("events.create.cancel")}
        </button>

        <button
          className="focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60 motion-safe:transition-[filter]"
          data-testid="events-create-submit"
          disabled={disabled}
          onClick={onSubmit}
          style={{
            background: "hsl(var(--primary))",
            borderRadius: pxToRem(createModal.footerButtonRadius),
            boxShadow: [
              pxToRem(createModal.footerSubmitShadow.x),
              pxToRem(createModal.footerSubmitShadow.y),
              pxToRem(createModal.footerSubmitShadow.blur),
              pxToRem(createModal.footerSubmitShadow.spread),
              "hsl(var(--primary))",
            ].join(" "),
            color: "hsl(var(--primary-foreground))",
            fontSize: pxToRem(createModal.footerButtonFontSize),
            fontWeight: createModal.footerButtonWeight,
            height: pxToRem(createModal.footerButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(createModal.footerSubmitPaddingX)}`,
          }}
          type="button"
        >
          {t("events.create.submit")}
        </button>
      </div>
    </div>
  );
}

function toEventPlaceChannels(detail: WorkspaceServerDetail): readonly EventPlaceChannel[] {
  // TODO(api): `GET /api/v1/servers/:id` kanal tipini `TEXT`/`VOICE` olarak düzleştiriyor
  // (`server-query-helpers.ts:74`); `STAGE` istemciye hiç ulaşmıyor. `live`/`community` türleri
  // bu yüzden bugün yalnız `Harici bağlantı` ile kurulabilir. Uç gerçek tipi döndürene kadar
  // süzgeç doğru ama liste eksik.
  return [
    ...detail.categories.flatMap((category) => category.channels),
    ...detail.ungroupedChannels,
  ]
    .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }))
    .toSorted((left, right) => left.name.localeCompare(right.name, "tr"));
}

export type EventCreateModalProps = {
  readonly serverDetail?: WorkspaceServerDetail;
  readonly onClose: () => void;
  readonly onCreated?: (event: EventDetailResponse) => void;
};

export function EventCreateModal({ onClose, onCreated, serverDetail }: EventCreateModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const firstKindRef = useRef<HTMLButtonElement | null>(null);
  const layerId = useId();
  const layer = useLayerStack({ id: layerId, kind: "modal", onClose, open: true });

  const [raw, setRaw] = useState<EventCreateFormState>(() =>
    createEventFormInitialState({ now: new Date() }),
  );
  const [errors, setErrors] = useState<readonly EventCreateFormErrorCode[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);

  const serversQuery = useQuery({
    enabled: !serverDetail,
    queryFn: fetchWorkspaceServers,
    queryKey: workspaceQueryKeys.servers,
  });

  const servers = useMemo(
    () =>
      serverDetail
        ? [
            {
              id: serverDetail.server.id,
              name: serverDetail.server.name,
              iconUrl: serverDetail.server.iconUrl,
              iconColor: serverDetail.server.iconColor,
              shortName: serverDetail.server.shortName,
              type: serverDetail.server.type,
            },
          ]
        : selectEventPlaceServers(serversQuery.data ?? []),
    [serversQuery.data, serverDetail],
  );

  const selectedId = raw.server?.id ?? servers[0]?.id ?? null;

  const detailQuery = useQuery({
    enabled: !serverDetail && selectedId !== null,
    queryFn: () => fetchWorkspaceServer(selectedId ?? ""),
    queryKey: workspaceQueryKeys.server(selectedId ?? ""),
  });

  const detail =
    serverDetail ??
    (detailQuery.data?.server.id === selectedId ? (detailQuery.data ?? null) : null);
  const channels = useMemo(() => (detail ? toEventPlaceChannels(detail) : []), [detail]);

  /**
   * Sunucu tipi ve varsayılan sunucu **türetilir**, efektle state'e kopyalanmaz: efektle yazılan
   * bir durum fazladan bir render turu açar ve `set-state-in-effect` kuralına takılır. Aynı
   * türetme `dispatch` içinde de koşuyor, böylece indirgeyici her zaman gerçek sunucu tipini
   * görür.
   */
  const derive = (current: EventCreateFormState): EventCreateFormState =>
    withEventServerType(
      current.server ? current : { ...current, server: servers[0] ?? null },
      detail?.server.type ?? null,
    );

  const state = derive(raw);

  const dispatch = (action: EventCreateFormAction) => {
    setSaveError(null);
    setRaw((current) => eventCreateFormReducer(derive(current), action));
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateEventInput) => createEvent(input),
    onError: () => setSaveError(t("events.create.error")),
    onSuccess: (payload) => {
      // Yanıt güncel etkinliği ve sayaçları taşıyor; yine de açık liste sorguları yeni kartı
      // kendiliğinden bilmiyor.
      void invalidateEventQueries(queryClient, payload.event.serverId);
      show({ message: t("events.create.success") });
      onCreated?.(payload.event);
      onClose();
    },
  });

  const handleSubmit = () => {
    const result = validateEventCreateForm(state);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors([]);
    setSaveError(null);
    createMutation.mutate(result.input);
  };

  return (
    <Modal
      className={EVENT_CREATE_MODAL_CARD_CLASS}
      closeLabel={t("events.create.close")}
      hideHeader
      initialFocusRef={firstKindRef}
      onClose={onClose}
      open
      overlayClassName={EVENT_CREATE_MODAL_OVERLAY_CLASS}
      overlayStyle={{ zIndex: layer.zIndex }}
      style={{
        backgroundColor: "hsl(var(--surface-card))",
        fontFamily: "var(--font-sans), sans-serif",
      }}
      title={t("events.create.title")}
    >
      <EventCreateForm
        channels={channels}
        dispatch={dispatch}
        errors={errors}
        firstKindRef={firstKindRef}
        onCancel={onClose}
        onClose={onClose}
        onSubmit={handleSubmit}
        onTogglePlace={() => setPlaceOpen((open) => !open)}
        placeOpen={placeOpen}
        saveError={saveError}
        servers={servers}
        state={state}
        submitting={createMutation.isPending}
      />
    </Modal>
  );
}
