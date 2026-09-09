"use client";

import React, { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Mic, Volume2 } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import type { AudioDeviceOption } from "@/hooks/use-audio-devices";
import { buildAudioDeviceOptions } from "@/lib/voice/audio-device-options";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

/**
 * Ayarlar Ş12 §3 — `GİRİŞ CİHAZI` / `ÇIKIŞ CİHAZI` satırı.
 *
 * Liste satırın **altında** açılır, menünün dışında değil: 308 px kutu tasarımın sabitidir ve
 * yana taşan bir açılır menü onu ilk dokunuşta bozar. Bu yüzden burada portal yok, `position`
 * hilesi yok — liste satırın kardeşi olarak akışın içinde büyür.
 *
 * Cihaz adları `enumerateDevices()` sonucundan gelir; tasarımdaki `MacBook Pro Mikrofonu`
 * örnek veridir. Etiketlerin normalizasyonu (`Sistem varsayılanı`, boş etiketli cihazlar)
 * `buildAudioDeviceOptions` içinde, ses ayarlarıyla **aynı** yerde durur.
 *
 * Aynı anda tek liste açık kalır; kararı bu bileşen vermez, `open`/`onToggle` ile menü verir.
 */

const { devices } = SETTINGS_METRICS.userMenu;

export type UserBarDeviceRowProps = {
  readonly devices: readonly AudioDeviceOption[];
  /**
   * Tarayıcı bu ekseni seçtirmiyorsa satır **çizilir ama açılmaz**: tasarımın iki satırı yerinde
   * kalır ve kullanıcı eksik bir menüyü değil, çalışmayan bir yeteneği görür.
   */
  readonly disabled?: boolean;
  readonly disabledValue?: string;
  readonly kind: "input" | "output";
  readonly onSelect: (deviceId: string) => void;
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly selectedDeviceId: string;
};

export function UserBarDeviceRow({
  devices: deviceList,
  disabled = false,
  disabledValue,
  kind,
  onSelect,
  onToggle,
  open: openRequested,
  selectedDeviceId,
}: UserBarDeviceRowProps) {
  const { t } = useI18n();
  const listboxId = useId();
  /** Klavye odağı listeye taşınmaz; etkin seçenek `aria-activedescendant` ile bildirilir. */
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(
    () =>
      buildAudioDeviceOptions(kind === "input" ? "audioinput" : "audiooutput", deviceList, {
        communications: t(
          kind === "input"
            ? "voice.devices.communicationsInput"
            : "voice.devices.communicationsOutput",
        ),
        default: t(kind === "input" ? "voice.devices.defaultInput" : "voice.devices.defaultOutput"),
        fallback: (index) =>
          t(kind === "input" ? "voice.devices.inputFallback" : "voice.devices.outputFallback", {
            index: String(index + 1),
          }),
      }),
    [deviceList, kind, t],
  );

  const open = openRequested && !disabled;
  const selectedIndex = Math.max(
    options.findIndex((option) => option.deviceId === selectedDeviceId),
    0,
  );
  const selectedLabel =
    disabled && disabledValue
      ? disabledValue
      : (options[selectedIndex]?.label ?? t("voice.devices.defaultInput"));
  const label = t(
    kind === "input" ? "settings.userMenu.devices.input" : "settings.userMenu.devices.output",
  );
  const Icon = kind === "input" ? Mic : Volume2;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        onToggle();
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setActiveIndex(selectedIndex);
        onToggle();
        return;
      }

      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + delta + options.length) % options.length);
      return;
    }

    if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        onSelect(option.deviceId);
      }
      return;
    }

    // Tip-ahead: yazılan harf listedeki ilk eşleşmeye götürür.
    if (open && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const needle = event.key.toLocaleLowerCase();
      const index = options.findIndex((option) =>
        option.label.toLocaleLowerCase().startsWith(needle),
      );

      if (index >= 0) {
        setActiveIndex(index);
      }
    }
  };

  return (
    <div data-device-row={kind}>
      <button
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label} · ${selectedLabel}`}
        className="flex w-full items-center bg-[var(--user-menu-device-row-bg)] text-left transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
        data-testid={`user-menu-device-${kind}`}
        disabled={disabled}
        onClick={() => {
          setActiveIndex(selectedIndex);
          onToggle();
        }}
        onKeyDown={handleKeyDown}
        style={
          {
            // Dinlenme zemini **değişkenle** iniyor, satır içi `background` ile değil: satır içi
            // bir zemin `hover:bg-*` kuralının ezemeyeceği tek şeydir ve vurguyu öldürürdü.
            border: `${hairline()} solid hsl(var(--${open ? "primary" : "border"}) / ${open ? 0.4 : 0.55})`,
            borderRadius: pxToRem(devices.rowRadius),
            gap: pxToRem(devices.rowGutter),
            padding: `${pxToRem(devices.rowPaddingY)} ${pxToRem(devices.rowPaddingX)}`,
            "--user-menu-device-row-bg": `hsl(var(--surface-soft) / ${open ? 0.7 : 0.35})`,
          } as React.CSSProperties
        }
        type="button"
      >
        <span
          className="grid flex-none place-items-center"
          style={{
            background: "hsl(var(--surface-soft))",
            borderRadius: pxToRem(devices.iconRadius),
            color: "hsl(var(--text-secondary))",
            height: pxToRem(devices.iconSize),
            width: pxToRem(devices.iconSize),
          }}
        >
          <Icon
            aria-hidden="true"
            style={{ height: pxToEm(devices.iconGlyphSize), width: pxToEm(devices.iconGlyphSize) }}
          />
        </span>

        <span className="block min-w-0 flex-1">
          <span
            className="block uppercase"
            style={{
              color: "hsl(var(--text-muted))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(devices.labelFontSize),
              fontWeight: devices.labelWeight,
              letterSpacing: `${devices.labelTracking}em`,
              lineHeight: 1,
            }}
          >
            {label}
          </span>
          <span
            className="block truncate"
            style={{
              color: "hsl(var(--foreground))",
              fontSize: pxToRem(devices.valueFontSize),
              fontWeight: 500,
              lineHeight: 1.2,
              marginTop: pxToRem(devices.valueMarginTop),
            }}
          >
            {selectedLabel}
          </span>
        </span>

        <ChevronDown
          aria-hidden="true"
          className={cn("flex-none transition", open && "rotate-180")}
          style={{
            color: "hsl(var(--text-muted))",
            height: pxToRem(devices.caretSize),
            width: pxToRem(devices.caretSize),
          }}
        />
      </button>

      {open ? (
        <div
          aria-label={label}
          className="flex flex-col"
          data-testid={`user-menu-device-${kind}-list`}
          id={listboxId}
          onKeyDown={handleKeyDown}
          ref={listRef}
          role="listbox"
          style={{
            background: `hsl(var(--surface-soft) / ${devices.listSurfaceAlpha})`,
            border: `${hairline()} solid hsl(var(--border) / ${devices.listBorderAlpha})`,
            borderRadius: pxToRem(devices.listRadius),
            gap: pxToRem(1),
            margin: `${pxToRem(devices.listMarginTop)} 0 ${pxToRem(devices.listMarginBottom)}`,
            padding: pxToRem(devices.listPadding),
          }}
          tabIndex={-1}
        >
          {options.map((option, index) => {
            const selected = option.deviceId === selectedDeviceId;

            return (
              <button
                aria-selected={selected}
                className="flex w-full items-center bg-[var(--user-menu-device-option-bg)] text-left transition hover:bg-[var(--surface-hover)] data-[active=true]:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                data-active={index === activeIndex ? "true" : undefined}
                id={optionId(index)}
                key={option.deviceId}
                onClick={() => onSelect(option.deviceId)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                style={
                  {
                    border: 0,
                    borderRadius: pxToRem(devices.optionRadius),
                    color: `hsl(var(--${selected ? "foreground" : "text-secondary"}))`,
                    fontSize: pxToRem(devices.optionFontSize),
                    fontWeight: selected ? 600 : 500,
                    gap: pxToRem(devices.optionGap),
                    lineHeight: 1.2,
                    padding: `${pxToRem(devices.optionPaddingY)} ${pxToRem(devices.optionPaddingX)}`,
                    "--user-menu-device-option-bg": selected
                      ? "hsl(var(--surface-card))"
                      : "transparent",
                  } as React.CSSProperties
                }
                type="button"
              >
                <span
                  className="grid flex-none place-items-center"
                  style={{ color: "hsl(var(--primary))", width: pxToRem(devices.optionTickColumn) }}
                >
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      style={{
                        height: pxToRem(devices.optionTickSize),
                        width: pxToRem(devices.optionTickSize),
                      }}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
