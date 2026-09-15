"use client";

import React, { useId } from "react";
import { ChevronDown, Hash, Link2, MapPin, Podcast, Volume2 } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import {
  isValidEventExternalLocation,
  selectEventPlaceChannels,
  type EventCreateFormAction,
  type EventCreateFormState,
  type EventPlaceChannel,
  type EventPlaceServer,
} from "@/lib/events/create-form";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import { resolveServerIconPresentation } from "@/lib/servers/server-icon-presentation";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";

/**
 * Yer seçici — SPEC §6 `YER` alanı, K10.
 *
 * Kanal listesi **türe göre** süzülür ve süzgeç `create-form.ts`te yaşar; bu dosya yalnız çizer.
 * Tür değişimi seçili kanalı düşürdüyse alan bunu **söyler**: sessizce geçersiz bir kanalla
 * `POST` atmak 422 döndürür ve kullanıcı nedenini görmez.
 *
 * Açılır panelin ölçüleri SPEC'te ve referans HTML'de **yok** (tasarım yalnız kapalı alanı
 * çiziyor); sözlüğün `createModal` bloğundan türetildi ve rapora sapma olarak yazıldı.
 */

const { createModal } = EVENTS_METRICS;

export type EventPlacePickerProps = {
  /** Seçili sunucunun **ham** kanal listesi; süzme burada yapılır. */
  readonly channels: readonly EventPlaceChannel[];
  readonly dispatch: (action: EventCreateFormAction) => void;
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly servers: readonly EventPlaceServer[];
  readonly state: EventCreateFormState;
};

const fieldStyle = {
  background: "hsl(var(--surface-base))",
  border: `${hairline()} solid hsl(var(--border)/${createModal.inputBorderAlpha})`,
  borderRadius: pxToRem(createModal.inputRadius),
  gap: pxToRem(createModal.fieldGap),
  height: pxToRem(createModal.inputHeight),
  padding: `0 ${pxToRem(createModal.inputPaddingX)}`,
} as const;

const optionStyle = {
  borderRadius: pxToRem(createModal.kindTileRadius),
  fontSize: pxToRem(createModal.fieldValueFontSize),
  fontWeight: createModal.fieldValueWeight,
  gap: pxToRem(createModal.fieldGap),
  padding: `${pxToRem(createModal.kindBoxPaddingY)} ${pxToRem(createModal.kindBoxPaddingX)}`,
} as const;

function sectionLabelStyle() {
  return {
    color: "hsl(var(--text-muted))",
    fontSize: pxToRem(createModal.fieldLabelFontSize),
    fontWeight: createModal.fieldLabelWeight,
    letterSpacing: `${createModal.fieldLabelLetterSpacing}em`,
    lineHeight: 1,
    paddingBottom: pxToRem(createModal.fieldLabelPaddingBottom),
  } as const;
}

function EventPlaceServerTile({ server }: { readonly server: EventPlaceServer }) {
  const presentation = resolveServerIconPresentation({
    iconColor: server.iconColor,
    iconUrl: server.iconUrl,
    name: server.name,
    shortName: server.shortName,
  });

  return (
    <span
      aria-hidden="true"
      className="font-display grid shrink-0 place-items-center"
      style={{
        background:
          presentation.kind === "fallback"
            ? getServerIconToneColor(presentation.tone)
            : "hsl(var(--surface-tertiary))",
        backgroundImage:
          presentation.kind === "image" ? `url("${presentation.imageUrl}")` : undefined,
        backgroundPosition: "center",
        backgroundSize: "cover",
        borderRadius: pxToRem(createModal.placeTileRadius),
        color: "white",
        fontSize: pxToRem(createModal.placeTileFontSize),
        fontWeight: 600,
        height: pxToRem(createModal.placeTileSize),
        lineHeight: 1,
        width: pxToRem(createModal.placeTileSize),
      }}
    >
      {presentation.kind === "fallback" ? presentation.label : null}
    </span>
  );
}

export function EventPlacePicker({
  channels,
  dispatch,
  onToggle,
  open,
  servers,
  state,
}: EventPlacePickerProps) {
  const { t } = useI18n();
  const panelId = useId();
  const external = state.placeMode === "external";
  const eligible = selectEventPlaceChannels(channels, state.kind);
  const externalInvalid =
    external &&
    state.externalLocation.trim().length > 0 &&
    !isValidEventExternalLocation(state.externalLocation);

  const value = external
    ? state.externalLocation.trim() || t("events.create.placeExternal")
    : state.server && state.channel
      ? t("events.card.place", { channel: state.channel.name, server: state.server.name })
      : state.server
        ? `${state.server.name} · ${t("events.create.placeNone")}`
        : t("events.create.placePlaceholder");

  return (
    <div>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex w-full items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="events-place-trigger"
        onClick={onToggle}
        style={fieldStyle}
        type="button"
      >
        {state.server && !external ? (
          <EventPlaceServerTile server={state.server} />
        ) : (
          <Link2
            aria-hidden="true"
            style={{
              color: "hsl(var(--text-muted))",
              height: pxToEm(createModal.fieldIconSize),
              width: pxToEm(createModal.fieldIconSize),
            }}
          />
        )}

        <span
          className="min-w-0 flex-1 truncate"
          style={{
            color: "hsl(var(--foreground))",
            fontSize: pxToRem(createModal.fieldValueFontSize),
            fontWeight: createModal.fieldValueWeight,
            lineHeight: 1,
          }}
        >
          {value}
        </span>

        <ChevronDown
          aria-hidden="true"
          style={{
            color: "hsl(var(--text-muted))",
            height: pxToEm(createModal.placeChevronSize),
            width: pxToEm(createModal.placeChevronSize),
          }}
        />
      </button>

      {state.channelCleared ? (
        <p
          data-testid="events-place-cleared"
          role="status"
          style={{
            color: "hsl(var(--warning))",
            fontSize: pxToRem(createModal.publicSubFontSize),
            marginTop: pxToRem(createModal.publicSubMarginTop),
          }}
        >
          {t("events.create.channelCleared")}
        </p>
      ) : null}

      {external ? (
        <div style={{ marginTop: pxToRem(createModal.fieldRowGap) }}>
          <Input
            aria-label={t("events.create.placeExternal")}
            data-testid="events-place-external-input"
            inputMode="url"
            onChange={(event) =>
              dispatch({ type: "setExternalLocation", value: event.target.value })
            }
            placeholder={t("events.create.externalPlaceholder")}
            style={{
              borderRadius: pxToRem(createModal.inputRadius),
              fontSize: pxToRem(createModal.inputFontSize),
              height: pxToRem(createModal.inputHeight),
              paddingLeft: pxToRem(createModal.inputPaddingX),
              paddingRight: pxToRem(createModal.inputPaddingX),
            }}
            type="url"
            value={state.externalLocation}
          />
          {externalInvalid ? (
            <p
              data-testid="events-place-external-invalid"
              style={{
                color: "hsl(var(--danger))",
                fontSize: pxToRem(createModal.publicSubFontSize),
                marginTop: pxToRem(createModal.publicSubMarginTop),
              }}
            >
              {t("events.create.externalInvalid")}
            </p>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div
          className="flex flex-col"
          data-testid="events-place-panel"
          id={panelId}
          style={{
            background: "hsl(var(--surface-secondary)/0.8)",
            border: `${hairline()} solid hsl(var(--border)/${createModal.publicRowBorderAlpha})`,
            borderRadius: pxToRem(createModal.publicRowRadius),
            gap: pxToRem(createModal.kindGridGap),
            marginTop: pxToRem(createModal.fieldRowGap),
            padding: `${pxToRem(createModal.publicRowPaddingY)} ${pxToRem(createModal.publicRowPaddingX)}`,
          }}
        >
          <div>
            <div style={sectionLabelStyle()}>{t("events.create.placeServerLabel")}</div>
            <div className="flex flex-col" style={{ gap: pxToRem(createModal.durationSegmentGap) }}>
              {servers.map((server) => (
                <button
                  aria-pressed={state.server?.id === server.id}
                  className="flex items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  data-testid={`events-place-server-${server.id}`}
                  key={server.id}
                  onClick={() => dispatch({ server, type: "selectServer" })}
                  style={{
                    ...optionStyle,
                    background:
                      state.server?.id === server.id
                        ? `hsl(var(--primary)/${createModal.kindBoxSelectedSurfaceAlpha})`
                        : "transparent",
                    color: "hsl(var(--foreground))",
                  }}
                  type="button"
                >
                  <EventPlaceServerTile server={server} />
                  <span className="min-w-0 flex-1 truncate">{server.name}</span>
                </button>
              ))}
            </div>
          </div>

          {external ? null : (
            <div>
              <div style={sectionLabelStyle()}>{t("events.create.placeChannelLabel")}</div>
              {eligible.length === 0 ? (
                <p
                  data-testid="events-place-empty"
                  style={{
                    color: "hsl(var(--text-muted))",
                    fontSize: pxToRem(createModal.publicSubFontSize),
                  }}
                >
                  {t("events.create.placeEmpty")}
                </p>
              ) : (
                <div
                  className="flex flex-col"
                  style={{ gap: pxToRem(createModal.durationSegmentGap) }}
                >
                  {eligible.map((channel) => (
                    <button
                      aria-pressed={state.channel?.id === channel.id}
                      className="flex items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      data-testid={`events-place-channel-${channel.id}`}
                      key={channel.id}
                      onClick={() => dispatch({ channel, type: "selectChannel" })}
                      style={{
                        ...optionStyle,
                        background:
                          state.channel?.id === channel.id
                            ? `hsl(var(--primary)/${createModal.kindBoxSelectedSurfaceAlpha})`
                            : "transparent",
                        color: "hsl(var(--foreground))",
                      }}
                      type="button"
                    >
                      {React.createElement(
                        channel.type === "TEXT"
                          ? Hash
                          : channel.type === "STAGE"
                            ? Podcast
                            : Volume2,
                        {
                          "aria-hidden": true,
                          className: "h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]",
                        },
                      )}
                      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            aria-pressed={!external && state.channel === null}
            className="flex items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="events-place-none"
            onClick={() => dispatch({ type: "clearPlace" })}
            style={{ ...optionStyle, color: "hsl(var(--foreground))" }}
            type="button"
          >
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
            <span>{t("events.create.placeNone")}</span>
          </button>

          <button
            aria-pressed={external}
            className="flex items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="events-place-external"
            onClick={() => dispatch({ type: "selectExternal" })}
            style={{
              ...optionStyle,
              background: external
                ? `hsl(var(--primary)/${createModal.kindBoxSelectedSurfaceAlpha})`
                : "transparent",
              color: "hsl(var(--foreground))",
            }}
            type="button"
          >
            <Link2
              aria-hidden="true"
              style={{
                color: "hsl(var(--text-muted))",
                height: pxToEm(createModal.fieldIconSize),
                width: pxToEm(createModal.fieldIconSize),
              }}
            />
            <span className="min-w-0 flex-1 truncate">{t("events.create.placeExternal")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
