"use client";

import React from "react";
import {
  CONVERSATION_MUTE_DURATION_MINUTES,
  isMuteActive,
  type ConversationMuteDuration,
  type SetMutedRequest,
} from "@wizards/types";

import { ContextMenuItem } from "@/components/ui/context-menu";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * `Sessize al` alt menüsü — SPEC-MESAJLAR §17.
 *
 * Ana menünün **çocuğu**, komşusu değil: `dc.html` listeyi menü kutusunun içine, mute
 * satırının hemen altına 36px girintiyle koyuyor. Ayrı bir kutu olsaydı iki yüzey iki
 * kez konumlanır, iki kez kapanır ve `Esc` hangisinin önce kapanacağına dair ikinci bir
 * kural isterdi.
 *
 * Süre merdiveninin **tek** kaydı burada: satır etiketleri, toast'ın `{duration}`
 * parametresi ve başlıktaki pill aynı haritadan okur. `@wizards/types` süreyi dakikaya
 * çeviriyor, bu dosya dakikayı cümleye çeviriyor; ikisi arasında üçüncü bir liste yok.
 */

const { moreMenu } = MESSAGES_METRICS;

/** §17'nin merdiveni, tasarımdaki sırayla. */
export const CONVERSATION_MUTE_DURATIONS = ["15m", "1h", "8h", "forever"] as const;

/** Süre → sözlük anahtarı. Satır, pill ve toast üçü de buradan okur. */
export const MUTE_DURATION_LABEL_KEYS: Readonly<Record<ConversationMuteDuration, string>> =
  Object.freeze({
    "15m": "messages.more.mute.15m",
    "1h": "messages.more.mute.1h",
    "8h": "messages.more.mute.8h",
    forever: "messages.more.mute.forever",
  });

/**
 * Süre seçiminin gövdesi (karar K8).
 *
 * `Süresiz` de bir süredir: `{ duration: "forever", muted: true }` gönderilir ve sunucu
 * onu `mutedUntil: null` diye yazar. Gövdeden `duration`'ı düşürmek eski `{ muted: true }`
 * biçimine dönmek olurdu — o biçim hâlâ geçerli, ama "süresiz" demenin **kaza eseri**
 * doğru olan hâli, bilerek seçilmiş hâli değil.
 */
export function muteRequestBody(duration: ConversationMuteDuration): SetMutedRequest {
  return { duration, muted: true };
}

/** Pill'in gövdesi. Süre taşımaz: sessizliği kaldırmak bir süre seçmek değildir. */
export const UNMUTE_REQUEST_BODY: SetMutedRequest = Object.freeze({ muted: false });

/**
 * Başlıktaki pill'in göstereceği süre — ya da pill hiç çizilmeyecekse `null`.
 *
 * Sessizliğin **açık mı** olduğuna tek karar noktası `isMuteActive` verir; bu fonksiyon
 * ikinci bir tarih karşılaştırması yapmaz, yalnız kalan süreyi merdivene oturtur.
 *
 * Seçilen süreyi saklayan bir kolon yok (`DMParticipant` yalnız `muted` + `mutedUntil`
 * taşıyor), yani sayfa yenilendiğinde "8 saat seçmişti" bilgisi kayıptır. Kalan süre
 * **en küçük yeterli** basamağa yuvarlanır: 7 saat kalan bir sessizlik `8 saat sessiz`
 * der, çünkü merdivenin o basamağından geliyor olabilir ve pill hiçbir zaman gerçekte
 * olduğundan uzun bir süre vaat etmez.
 */
export function resolveMutePillDuration(
  state: { readonly muted: boolean; readonly mutedUntil: Date | string | null },
  now: Date,
): ConversationMuteDuration | null {
  if (!isMuteActive(state, now)) {
    return null;
  }

  if (state.mutedUntil === null) {
    return "forever";
  }

  const until = state.mutedUntil instanceof Date ? state.mutedUntil : new Date(state.mutedUntil);

  if (Number.isNaN(until.getTime())) {
    // `isMuteActive` bozuk bir tarihi "sessiz" sayıyor; pill de aynı tarafta durur.
    return "forever";
  }

  const remainingMinutes = (until.getTime() - now.getTime()) / 60_000;
  const step = CONVERSATION_MUTE_DURATIONS.find(
    (duration) =>
      duration !== "forever" && CONVERSATION_MUTE_DURATION_MINUTES[duration] >= remainingMinutes,
  );

  // Merdivenin dışında kalan bir bitiş (elle yazılmış uzun bir `mutedUntil`) en uzun
  // basamağa düşer; `Süresiz` demek yanlış olurdu, çünkü bir bitişi var.
  return step ?? "8h";
}

/** Ana satırdaki tuş: alt menüyü hangi tuşlar açar. */
export function muteRowKeyAction(key: string): "open" | null {
  return key === "ArrowRight" || key === "Enter" ? "open" : null;
}

/** Alt menüdeki tuş: hangi tuşlar kapatır ve odağı ana satıra döndürür. */
export function muteSubmenuKeyAction(key: string): "close" | null {
  return key === "ArrowLeft" || key === "Escape" ? "close" : null;
}

export type MuteSubmenuProps = {
  /** Ana satırın `aria-controls` hedefi. */
  readonly id: string;
  /** Listeyi adlandıran ana satırın id'si. */
  readonly labelledById: string;
  /** `ArrowLeft` / `Esc`: kapat ve odağı ana satıra döndür. */
  readonly onClose: () => void;
  readonly onSelect: (duration: ConversationMuteDuration) => void;
  readonly open: boolean;
  /** Şu an yürürlükte olan süre; yoksa hiçbir satır seçili değildir. */
  readonly value?: ConversationMuteDuration | null | undefined;
};

export function MuteSubmenu({
  id,
  labelledById,
  onClose,
  onSelect,
  open,
  value = null,
}: MuteSubmenuProps) {
  const { t } = useI18n();
  const listRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Açılışta ilk satıra focus. Ana menünün kendi "ilk öğeye focus" efekti yalnız menü
   * açılırken koşuyor; alt menü menü zaten açıkken doğuyor, yani odağı buraya taşıyacak
   * ikinci bir efekt olmadan klavye kullanıcısı listeyi hiç göremezdi.
   */
  React.useEffect(() => {
    if (!open) {
      return;
    }

    listRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby={labelledById}
      className="flex flex-col"
      data-testid="mute-submenu"
      id={id}
      onKeyDown={(event) => {
        if (muteSubmenuKeyAction(event.key) === null) {
          return;
        }

        // `Esc` burada durur: bir tuş bir katman kapatır, alt menü ile ana menü
        // birlikte kapanmaz.
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      ref={listRef}
      role="group"
      style={{
        gap: pxToRem(moreMenu.submenuGap),
        padding: `${pxToRem(moreMenu.submenuPaddingTop)} 0 ${pxToRem(moreMenu.submenuPaddingBottom)} ${pxToRem(moreMenu.submenuIndent)}`,
      }}
    >
      {CONVERSATION_MUTE_DURATIONS.map((duration) => {
        const selected = value === duration;

        return (
          <ContextMenuItem
            aria-checked={selected}
            className={cn(
              "min-h-0 w-full justify-start whitespace-nowrap",
              selected
                ? "bg-[hsl(var(--primary)/0.14)] text-[var(--primary-readable)] hover:bg-[hsl(var(--primary)/0.14)]"
                : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]",
            )}
            data-testid={`mute-submenu-${duration}`}
            key={duration}
            onClick={() => onSelect(duration)}
            role="menuitemradio"
            style={{
              borderRadius: pxToRem(moreMenu.submenuRowRadius),
              fontSize: pxToRem(moreMenu.submenuRowFontSize),
              fontWeight: selected ? 600 : 500,
              lineHeight: 1,
              padding: `${pxToRem(moreMenu.submenuRowPaddingY)} ${pxToRem(moreMenu.submenuRowPaddingX)}`,
            }}
          >
            {t(MUTE_DURATION_LABEL_KEYS[duration])}
          </ContextMenuItem>
        );
      })}
    </div>
  );
}
