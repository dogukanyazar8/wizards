"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import {
  measureScrollArea,
  resolveMenuPlacement,
  SETTINGS_MENU_MAX_HEIGHT,
  type SettingsMenuDirection,
} from "@/lib/settings/menu-placement";
import { cn } from "@/lib/utils";

/**
 * Açılır menü — SPEC-AYARLAR §4.4, tuzak #6.
 *
 * Yön **tıklama anında ölçülür** (`resolveMenuPlacement`), render sırasında tahmin edilmez ve
 * kaydırma sırasında **yeniden konumlandırılmaz, kapatılır**: yeniden konumlandırmak menüyü
 * parmağın altında zıplatır, kapatmak kullanıcının kaydırma niyetine saygı duyar. `scroll`
 * dinleyicisi `passive` — kaydırma yolunda iş yapmayan bir dinleyici tarayıcıyı bekletmemeli.
 *
 * Klavye sözleşmesi düğmede değil listede: menü açılınca odak listeye geçer, etkin seçenek
 * `aria-activedescendant` ile bildirilir. `↑/↓`, `Home`/`End`, `Enter`, `Esc` ve **tip-ahead**
 * (`Eu` → `Europe/Istanbul`) burada. Odak seçeneklerin kendisine taşınmadı: 27 seçenekli bir
 * saat dilimi listesinde her ok tuşu bir odak değişimi demek olurdu ve ekran okuyucu listeyi
 * baştan okurdu.
 */

const { select } = SETTINGS_METRICS.controls;

/** Tip-ahead tamponu bu süre sessizlikten sonra sıfırlanır. */
export const SETTING_SELECT_TYPE_AHEAD_RESET_MS = 600;

/**
 * Tampona uyan ilk seçeneğin dizini.
 *
 * Arama `fromIndex`'ten sonra başlar ve listeyi dolanır: aynı harfle başlayan iki seçenek varken
 * ikinci kez basmak ikincisine geçmeli. Karşılaştırma Türkçe yerelinde ve büyük/küçük harf
 * duyarsız — `İ`/`ı` çiftini kaçıran bir karşılaştırma `İstanbul`'u hiç bulamaz.
 */
export function resolveTypeAheadIndex(
  labels: readonly string[],
  buffer: string,
  fromIndex: number,
): number {
  const needle = buffer.toLocaleLowerCase("tr");

  if (needle.length === 0) {
    return -1;
  }

  // Tek harflik tampon "sıradaki eşleşme"dir; çok harflik tampon aynı seçeneği daraltır.
  const start = buffer.length === 1 ? fromIndex + 1 : fromIndex;

  for (let step = 0; step < labels.length; step += 1) {
    const index = (start + step + labels.length) % labels.length;
    const label = labels[index];

    if (label && label.toLocaleLowerCase("tr").startsWith(needle)) {
      return index;
    }
  }

  return -1;
}

export type SettingSelectOption = {
  readonly label: string;
  /** Ton **token adı** (`--success`); renk değeri değil. Sunum bunu `hsl(var(...))` yapar. */
  readonly toneToken?: string | undefined;
};

export type SettingSelectProps = {
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly labelledById?: string | undefined;
  readonly onChange: (index: number) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly options: readonly SettingSelectOption[];
  readonly testId?: string;
  readonly value: number;
  /** İkincil yüzeyler aynı seçiciyi daha dar alanda kullanabilir; varsayılan ayarlar ölçüsüdür. */
  readonly width?: number;
};

export function SettingSelect({
  describedById,
  disabled = false,
  labelledById,
  onChange,
  onOpenChange,
  open,
  options,
  testId,
  value,
  width = select.width,
}: SettingSelectProps) {
  const scope = useId();
  const listboxId = `${scope}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeAhead = useRef<{ at: number; buffer: string }>({ at: 0, buffer: "" });

  const [placement, setPlacement] = useState<{
    direction: SettingsMenuDirection;
    maxHeight: number;
  }>({ direction: "down", maxHeight: SETTINGS_MENU_MAX_HEIGHT });
  const [activeIndex, setActiveIndex] = useState(value);

  const selected = options[value];

  const measure = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const area = measureScrollArea(trigger, trigger.ownerDocument.defaultView?.innerHeight ?? 0);

    setPlacement(
      resolveMenuPlacement({
        menuHeight: SETTINGS_MENU_MAX_HEIGHT,
        scrollAreaBottom: area.bottom,
        scrollAreaTop: area.top,
        triggerBottom: rect.bottom,
        triggerTop: rect.top,
      }),
    );
  }, []);

  const close = useCallback(
    (restoreFocus: boolean) => {
      onOpenChange(false);

      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    },
    [onOpenChange],
  );

  /** Kaydırma menüyü kapatır; dış tıklama da. `Esc` liste üzerinde yakalanıyor. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const view = triggerRef.current?.ownerDocument.defaultView;

    if (!view) {
      return;
    }

    const handleScroll = () => close(false);
    const handlePointerDown = (event: Event) => {
      const target = event.target as Node | null;

      if (target && !listRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    };

    view.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    view.addEventListener("resize", handleScroll, { passive: true });
    view.document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      view.removeEventListener("scroll", handleScroll, true);
      view.removeEventListener("resize", handleScroll);
      view.document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [close, open]);

  /**
   * Menü açıldığında etkin seçenek seçili olana döner.
   *
   * Bu bir efekt **değil**: efekt içinde `setState` bir tur fazla render doğurur ve menü ilk
   * karede yanlış satırı vurgulu gösterir. React'in "prop değişince state'i ayarla" kalıbı
   * render sırasında çalışır ve fazladan tur bırakmaz.
   */
  const [openSnapshot, setOpenSnapshot] = useState(open);

  if (open !== openSnapshot) {
    setOpenSnapshot(open);

    if (open) {
      setActiveIndex(value);
    }
  }

  /**
   * Odak bir dış sistem işi (DOM), state değil — o yüzden efektte kalıyor.
   *
   * `preventScroll` **zorunlu**: menü kaydırma alanının altına yakın bir satırda açıldığında
   * tarayıcı listeyi görünür yapmak için kabı kaydırıyor, kaydırma da yukarıdaki dinleyiciye
   * düşüp menüyü **aynı karede** kapatıyordu. Sonuç, sayfanın dibindeki her açılır menünün
   * tıklamaya hiç cevap vermemesiydi (üstteki satırlarda menü açıldığı için hata seçici
   * görünüyordu, oysa kural genel). Menünün yeri zaten `measure()` ile ölçülüyor; kaydırma
   * o ölçümü de geçersiz kılardı.
   */
  useEffect(() => {
    if (open) {
      listRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const commit = (index: number) => {
    if (disabled) return;
    onChange(index);
    close(true);
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const last = options.length - 1;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + step + options.length) % options.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(last);
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      const buffer =
        now - typeAhead.current.at > SETTING_SELECT_TYPE_AHEAD_RESET_MS
          ? event.key
          : typeAhead.current.buffer + event.key;

      typeAhead.current = { at: now, buffer };

      const hit = resolveTypeAheadIndex(
        options.map((option) => option.label),
        buffer,
        activeIndex,
      );

      if (hit >= 0) {
        event.preventDefault();
        setActiveIndex(hit);
      }
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      measure();
      onOpenChange(true);
    }
  };

  return (
    <div className="relative shrink-0" style={{ width: pxToRem(width), maxWidth: "100%" }}>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-describedby={describedById}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled || undefined}
        aria-labelledby={labelledById}
        className="settings-hit-target flex w-full items-center bg-[hsl(var(--surface-base))] transition-colors hover:border-[hsl(var(--primary)/0.5)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid={testId}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close(false);
            return;
          }

          measure();
          onOpenChange(true);
        }}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        style={{
          // Açıkken kenar birincil tona geçer (referans `selBd`); kapalıyken nötr kenar.
          border: open
            ? `${hairline()} solid hsl(var(--primary) / 0.5)`
            : `${hairline()} solid hsl(var(--border) / ${select.borderAlpha})`,
          borderRadius: pxToRem(select.radius),
          gap: pxToRem(select.gap),
          height: pxToRem(select.height),
          padding: `0 ${pxToRem(select.paddingX)}`,
          transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
        }}
        type="button"
      >
        {selected?.toneToken ? <SettingSelectDot toneToken={selected.toneToken} /> : null}
        <span
          className="min-w-0 flex-1 truncate text-left text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(select.valueFontSize),
            fontWeight: select.valueWeight,
            lineHeight: 1.2,
          }}
        >
          {selected?.label ?? ""}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 text-[hsl(var(--text-muted))]"
          style={{
            height: pxToEm(select.caretSize, select.valueFontSize),
            transform: open ? "rotate(180deg)" : undefined,
            width: pxToEm(select.caretSize, select.valueFontSize),
          }}
        />
      </button>

      {open && !disabled ? (
        <div
          aria-activedescendant={`${scope}-option-${activeIndex}`}
          aria-labelledby={labelledById}
          className="absolute right-0 w-full overflow-y-auto bg-[hsl(var(--surface-card))] focus-visible:outline-hidden"
          data-direction={placement.direction}
          data-testid={testId ? `${testId}-menu` : undefined}
          id={listboxId}
          onKeyDown={handleListKeyDown}
          ref={listRef}
          role="listbox"
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(select.menuRadius),
            boxShadow: `${pxToRem(select.menuShadow.x)} ${pxToRem(select.menuShadow.y)} ${pxToRem(select.menuShadow.blur)} ${pxToRem(select.menuShadow.spread)} hsl(var(--shadow-color))`,
            maxHeight: pxToRem(Math.min(placement.maxHeight, SETTINGS_MENU_MAX_HEIGHT)),
            minWidth: `min(100%, ${pxToRem(select.menuMinWidth)})`,
            padding: pxToRem(select.menuPadding),
            zIndex: select.menuZIndex,
            ...(placement.direction === "down"
              ? { top: pxToRem(select.menuOffset) }
              : { bottom: pxToRem(select.menuOffset) }),
          }}
          tabIndex={-1}
        >
          {options.map((option, index) => {
            const isSelected = index === value;

            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-center text-left transition-colors",
                  index === activeIndex && "bg-[hsl(var(--surface-soft))]",
                )}
                id={`${scope}-option-${index}`}
                key={option.label}
                onClick={() => commit(index)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                style={{
                  background: isSelected ? "hsl(var(--primary))" : undefined,
                  borderRadius: pxToRem(select.optionRadius),
                  color: isSelected ? "#fff" : "hsl(var(--text-secondary))",
                  gap: pxToRem(select.optionGap),
                  padding: `${pxToRem(select.optionPaddingY)} ${pxToRem(select.optionPaddingX)}`,
                  transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
                }}
                tabIndex={-1}
                type="button"
              >
                {option.toneToken ? <SettingSelectDot toneToken={option.toneToken} /> : null}
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{
                    fontSize: pxToRem(select.optionFontSize),
                    fontWeight: isSelected ? 600 : 500,
                    lineHeight: 1.2,
                  }}
                >
                  {option.label}
                </span>
                {isSelected ? (
                  <Check
                    aria-hidden="true"
                    className="shrink-0 text-current"
                    style={{
                      height: pxToEm(select.optionTickSize, select.optionFontSize),
                      width: pxToEm(select.optionTickSize, select.optionFontSize),
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SettingSelectDot({ toneToken }: { toneToken: string }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{
        background: `hsl(var(${toneToken}))`,
        height: pxToRem(select.dotSize),
        width: pxToRem(select.dotSize),
      }}
    />
  );
}
