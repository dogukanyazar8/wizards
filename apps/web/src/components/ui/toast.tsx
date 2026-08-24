"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Genel toast yüzeyi — Bahsedilmeler Ş8 (karar K11'in ön koşulu).
 *
 * Web'de bugüne kadar genel bir toast yoktu; yalnız `voice/voice-invite-toasts.tsx` vardı ve o
 * sese özeldir (kendi soket akışını dinler, kendi kabul/ret düğmelerini taşır). Bu dosya onun
 * **görsel dilini** örnek alır, davranışını değil.
 *
 * Dosya iki şey içerir ve ikisi bilerek ayrıdır:
 *
 *   1. **Saf kuyruk mantığı** (`enqueueToast` · `dismissToast` · `tickToasts`). Zamanlayıcısız,
 *      React'sız, saat okumayan fonksiyonlar. Bir geri alma penceresinin gerçek saatle
 *      beklenmesi testi yavaş değil **kırılgan** yapar; burada süre bir sayıdır ve test onu
 *      istediği kadar ilerletir.
 *   2. **Çizim** (`ToastViewport`). Durum tutmaz; ne gösterileceğini sağlayıcı söyler.
 *
 * Sayaç iki durumda durur: fare yığının üzerindeyken ve pencere odak dışındayken. İkincisi
 * `Geri al` için şart — başka bir sekmeye geçen kullanıcı döndüğünde penceresini kapanmış
 * bulmamalı.
 */

export type ToastTone = "default" | "danger";

export type ToastAction = {
  readonly label: string;
  readonly onAct: () => void;
};

export type ToastOptions = {
  readonly action?: ToastAction | undefined;
  /** Varsayılan: eylemsizde 5 sn, eylemlide 10 sn (geri alma penceresi). */
  readonly durationMs?: number | undefined;
  readonly message: string;
  readonly testId?: string | undefined;
  readonly tone?: ToastTone | undefined;
};

export type ToastEntry = {
  readonly action?: ToastAction | undefined;
  readonly durationMs: number;
  readonly id: string;
  readonly message: string;
  /** Kalan süre; `tickToasts` düşürür. Kuyrukta bekleyen bir toast'ta hiç azalmaz. */
  readonly remainingMs: number;
  readonly testId?: string | undefined;
  readonly tone: ToastTone;
};

/** SPEC §7 tarafından değil, K11 tarafından belirlenir: eylemsiz toast 5 sn durur. */
export const TOAST_DEFAULT_DURATION_MS = 5_000;
/** `Geri al` taşıyan toast 10 sn durur — `read-all` geri alma penceresiyle aynı büyüklük. */
export const TOAST_ACTION_DURATION_MS = 10_000;
/** Aynı anda en çok üç toast görünür; fazlası kuyrukta bekler. */
export const TOAST_MAX_VISIBLE = 3;
/** Sayaç bu adımla düşer. 250 ms, bir insanın fark edemeyeceği kadar sık, boşuna render açmayacak kadar seyrek. */
export const TOAST_TICK_MS = 250;

export function resolveToastDuration(options: ToastOptions): number {
  if (typeof options.durationMs === "number" && options.durationMs > 0) {
    return options.durationMs;
  }

  return options.action ? TOAST_ACTION_DURATION_MS : TOAST_DEFAULT_DURATION_MS;
}

export function createToastEntry(id: string, options: ToastOptions): ToastEntry {
  const durationMs = resolveToastDuration(options);

  return {
    durationMs,
    id,
    message: options.message,
    remainingMs: durationMs,
    tone: options.tone ?? "default",
    ...(options.action ? { action: options.action } : {}),
    ...(options.testId ? { testId: options.testId } : {}),
  };
}

/**
 * Yeni toast **sona** eklenir. Başa eklemek, kullanıcının okumakta olduğu toast'ı aşağı iter ve
 * `Geri al` düğmesinin yerini tıklama anında değiştirir.
 */
export function enqueueToast(current: readonly ToastEntry[], entry: ToastEntry): ToastEntry[] {
  return [...current, entry];
}

export function dismissToast(current: readonly ToastEntry[], id: string): ToastEntry[] {
  return current.filter((entry) => entry.id !== id);
}

/**
 * Sayacı `elapsedMs` kadar ilerletir ve süresi dolanları düşürür.
 *
 * Yalnız **görünen** ilk üç toast'ın sayacı işler: kuyrukta bekleyen bir toast hiç görünmeden
 * süresini tüketirse kullanıcı onu okuyamaz.
 *
 * `paused` iken hiçbir şey azalmaz ama fonksiyon yine de aynı diziyi döndürür — çağıranın
 * "değişti mi" karşılaştırması referans eşitliğiyle yapılabilsin diye.
 */
export function tickToasts(
  current: readonly ToastEntry[],
  elapsedMs: number,
  paused = false,
): ToastEntry[] {
  if (paused || current.length === 0 || elapsedMs <= 0) {
    return current as ToastEntry[];
  }

  const next: ToastEntry[] = [];

  for (const [index, entry] of current.entries()) {
    if (index >= TOAST_MAX_VISIBLE) {
      next.push(entry);
      continue;
    }

    const remainingMs = entry.remainingMs - elapsedMs;
    if (remainingMs > 0) {
      next.push({ ...entry, remainingMs });
    }
  }

  return next;
}

export function visibleToasts(current: readonly ToastEntry[]): ToastEntry[] {
  return current.slice(0, TOAST_MAX_VISIBLE);
}

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------

export type ToastViewportProps = {
  readonly closeLabel: string;
  readonly onAct: (entry: ToastEntry) => void;
  readonly onDismiss: (id: string) => void;
  readonly onPauseChange: (paused: boolean) => void;
  readonly toasts: readonly ToastEntry[];
};

/**
 * Tek yığın, sağ altta. `pointer-events-none` kapta, kartlarda `auto`: yığının kapladığı boş
 * alan altındaki arayüzü tıklanamaz yapmamalı.
 *
 * `aria-live` **karta** konur, kaba değil. Kapta olsaydı yığın her değiştiğinde ekran okuyucu
 * bütün listeyi yeniden okurdu.
 */
export function ToastViewport({
  closeLabel,
  onAct,
  onDismiss,
  onPauseChange,
  toasts,
}: ToastViewportProps) {
  const shown = visibleToasts(toasts);

  return (
    <div
      aria-hidden={shown.length === 0 ? true : undefined}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex flex-col items-end gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0"
      data-testid="toast-viewport"
      onMouseEnter={() => onPauseChange(true)}
      onMouseLeave={() => onPauseChange(false)}
    >
      <AnimatePresence initial={false}>
        {shown.map((entry) => (
          <ToastCard
            closeLabel={closeLabel}
            entry={entry}
            key={entry.id}
            onAct={onAct}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

type ToastCardProps = {
  readonly closeLabel: string;
  readonly entry: ToastEntry;
  readonly onAct: (entry: ToastEntry) => void;
  readonly onDismiss: (id: string) => void;
};

function ToastCard({ closeLabel, entry, onAct, onDismiss }: ToastCardProps) {
  const danger = entry.tone === "danger";
  const Icon = danger ? TriangleAlert : Check;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      // `danger` kesintiye uğratır: bir hata, kullanıcının o an okuduğu şeyi bölmeyi hak eder.
      aria-live={danger ? "assertive" : "polite"}
      className={cn(
        "app-overlay pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_18px_40px_hsl(var(--shadow-color)/0.18)] backdrop-blur-xl",
        danger && "border-[hsl(var(--danger)/0.45)]",
      )}
      data-testid={entry.testId ?? "toast"}
      data-tone={entry.tone}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      role="status"
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full",
          danger
            ? "bg-[hsl(var(--danger)/0.16)] text-[hsl(var(--danger))]"
            : "bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))]",
        )}
      >
        <Icon className="size-4" />
      </span>

      <p className="text-app-foreground min-w-0 flex-1 text-sm leading-snug">{entry.message}</p>

      {entry.action ? (
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="toast-action"
          onClick={() => onAct(entry)}
          type="button"
        >
          {entry.action.label}
        </button>
      ) : null}

      <button
        aria-label={closeLabel}
        className="text-app-muted grid size-7 shrink-0 place-items-center rounded-lg transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="toast-close"
        onClick={() => onDismiss(entry.id)}
        type="button"
      >
        <X className="size-4" />
      </button>
    </motion.div>
  );
}
