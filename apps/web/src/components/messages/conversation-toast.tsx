"use client";

import React from "react";
import { Check, X } from "lucide-react";
import {
  ConversationMuteDurationSchema,
  type ConversationToast,
  type ConversationToastKind,
} from "@wizards/types";

import { MUTE_DURATION_LABEL_KEYS } from "@/components/messages/mute-submenu";
import { useI18n } from "@/components/providers/locale-provider";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Toast şeridi — SPEC-MESAJLAR §17.
 *
 * Başlığın **altında**, sabitlenen şeridin **üstünde** (`Mesajlar.dc.html`; SPEC'in
 * "sabitlenen şeridin altında" cümlesi otorite sırasında kaybetti ve `SPEC_DEVIATIONS`
 * içine yazıldı). Yerleştirme `chat-area.tsx`in işi; bu dosya yalnız şeridin kendisi.
 *
 * **Tek şerit, kuyruk yok.** Yeni toast eskisinin yerini alır: üst üste binen iki şerit
 * başlığı aşağı iter ve mesaj listesini kaydırırdı, sıraya giren ikinci bir şerit ise
 * kullanıcının artık ilgilenmediği bir eylemi beş saniye daha gösterirdi.
 */

const { toast: toastMetrics } = MESSAGES_METRICS;

/** Şeridin kendi cümlesi olan iki kip; danger tonu bunların doğal hâlidir. */
const FAILURE_KINDS: ReadonlySet<ConversationToastKind> = new Set<ConversationToastKind>([
  "actionFailed",
  "copyFailed",
]);

export type ConversationToastCopy = {
  readonly key: string;
  readonly params: Record<string, number | string> | undefined;
  readonly tone: "success" | "danger";
};

/**
 * Kayıt → cümle.
 *
 * İki düzeltme burada yaşıyor, çünkü ikisi de "hangi cümle" sorusunun cevabı:
 *
 * 1. **Kırmızı bir başarı cümlesi basılmaz.** Danger tonlu bir `inviteCopied`
 *    `Davet bağlantısı kopyalandı` derdi — kopyalama tam da başarısız olmuşken.
 *    Kopyalama yolu `copyFailed`e, kalan her mutasyon `actionFailed`e düşer.
 *    (Ş7 ve Ş8 hata yollarında hâlâ başarı kiplerini danger tonuyla gönderiyor;
 *    şerit bunu tolere eder, ama kaynağın düzeltilmesi gerekiyor — bkz. 11-rapor.)
 * 2. **Çoğul ekleme kendi cümlesini alır.** `membersAdded` bir isim taşır;
 *    `{name} ve {count} kişi` cümlesi sözlükte `membersAddedMany` olarak duruyor ve
 *    `params.count` geldiğinde o kazanır.
 */
export function resolveToastCopy(toast: ConversationToast): ConversationToastCopy {
  const tone = toast.tone ?? "success";

  if (tone === "danger" && !FAILURE_KINDS.has(toast.kind)) {
    return {
      key: `messages.toast.${toast.kind === "inviteCopied" ? "copyFailed" : "actionFailed"}`,
      params: undefined,
      tone: "danger",
    };
  }

  const count = toast.params?.count;
  const kind =
    toast.kind === "membersAdded" && typeof count === "number" && count > 0
      ? "membersAddedMany"
      : toast.kind;

  return {
    key: `messages.toast.${kind}`,
    params: toast.params,
    tone,
  };
}

/**
 * `{duration}` parametresi bir **süre kaydı** taşır (`8h`), cümle değil: toast'ı üreten
 * yer sözlüğe erişmek zorunda kalmasın diye. Çeviri burada, cümlenin kurulduğu yerde
 * yapılır; İngilizce sözlükte `8 hours` yazan bir şerit Türkçe kayıttan doğar.
 */
function localizeParams(
  params: Record<string, number | string> | undefined,
  t: (key: string, values?: Record<string, number | string>) => string,
): Record<string, number | string> | undefined {
  if (params === undefined) {
    return undefined;
  }

  const duration = params.duration;
  const parsed =
    typeof duration === "string" ? ConversationMuteDurationSchema.safeParse(duration) : null;

  return parsed?.success === true
    ? { ...params, duration: t(MUTE_DURATION_LABEL_KEYS[parsed.data]) }
    : params;
}

export type ConversationToastStripProps = {
  readonly onDismiss: () => void;
  readonly toast: ConversationToast | null | undefined;
};

export function ConversationToastStrip({ onDismiss, toast }: ConversationToastStripProps) {
  if (!toast) {
    return null;
  }

  /*
   * Kayıt değişince şerit **yeniden doğar**: giriş hareketi bir bileşen durumu ve
   * aynı düğüm ayakta kalsaydı ikinci toast sessizce içeriğini değiştirir, kullanıcı
   * da yeni bir şey söylendiğini fark etmezdi.
   */
  return (
    <ToastRow
      key={`${toast.kind}:${toast.tone ?? "success"}:${JSON.stringify(toast.params ?? {})}`}
      onDismiss={onDismiss}
      toast={toast}
    />
  );
}

function ToastRow({ onDismiss, toast }: { onDismiss: () => void; toast: ConversationToast }) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const [entered, setEntered] = React.useState(false);
  const copy = resolveToastCopy(toast);
  const token = copy.tone === "danger" ? "--danger" : "--success";

  /**
   * Giriş, **bir sonraki karede** başlar.
   *
   * Efektin gövdesinde doğrudan `setState` çağırmak zincirleme render demek (ve lint
   * kuralı onu reddediyor); bir kare beklemek ayrıca tarayıcının kaymış hâli en az bir
   * kez boyamasını garanti eder — aynı render'da düşen bir durum geçişi hiç görünmezdi.
   */
  React.useEffect(() => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(() => setEntered(true));

      return () => window.cancelAnimationFrame(frame);
    }

    const handle = setTimeout(() => setEntered(true), 0);

    return () => clearTimeout(handle);
  }, []);

  const shifted = !entered && !reducedMotion;

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center"
      data-testid="conversation-toast"
      data-tone={copy.tone}
      role="status"
      style={{
        background: `hsl(var(${token})/0.12)`,
        borderBottom: `${hairline()} solid hsl(var(${token})/0.28)`,
        gap: pxToRem(toastMetrics.gap),
        padding: `${pxToRem(toastMetrics.paddingY)} ${pxToRem(toastMetrics.paddingX)}`,
        /*
         * Yalnız kayma; opaklık sabit. Sunucuda çizilen işaretleme de görünür kalır —
         * `opacity: 0` ile başlayan bir şerit, betik geç çalıştığında hiç görünmezdi.
         */
        transform: shifted ? "translateY(-0.25rem)" : "none",
        ...(reducedMotion
          ? {}
          : { transition: `transform ${MESSAGES_METRICS.transition.base}s ease-out` }),
      }}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-full text-white"
        style={{
          background: `hsl(var(${token}))`,
          height: pxToRem(toastMetrics.iconSize),
          width: pxToRem(toastMetrics.iconSize),
        }}
      >
        {copy.tone === "danger" ? (
          <X
            style={{
              height: pxToRem(toastMetrics.iconGlyphSize),
              width: pxToRem(toastMetrics.iconGlyphSize),
            }}
          />
        ) : (
          <Check
            style={{
              height: pxToRem(toastMetrics.iconGlyphSize),
              width: pxToRem(toastMetrics.iconGlyphSize),
            }}
          />
        )}
      </span>

      <span
        className="min-w-0 text-[hsl(var(--foreground))]"
        data-testid="conversation-toast-message"
        style={{
          fontSize: pxToRem(toastMetrics.fontSize),
          fontWeight: 600,
          lineHeight: toastMetrics.lineHeight,
        }}
      >
        {t(copy.key, localizeParams(copy.params, t))}
      </span>

      <button
        aria-label={t("messages.toast.close")}
        className={cn(
          "ml-auto grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition",
          "hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
        data-testid="conversation-toast-close"
        onClick={onDismiss}
        style={{
          borderRadius: pxToRem(toastMetrics.closeRadius),
          height: pxToRem(toastMetrics.closeSize),
          width: pxToRem(toastMetrics.closeSize),
        }}
        type="button"
      >
        <X
          aria-hidden="true"
          style={{
            height: pxToRem(toastMetrics.closeIconSize),
            width: pxToRem(toastMetrics.closeIconSize),
          }}
        />
      </button>
    </div>
  );
}
