"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";

/**
 * "Yazıyor" göstergesi — SPEC-SUNUCU §3.3 son maddesi.
 *
 * Ş6. Eskiden üç nokta metnin **sağındaydı**, `4px`ti ve `animate-bounce` ile zıplıyordu;
 * referans noktaları metnin **soluna** koyuyor, `5px` çiziyor ve renkleri opaklıkla
 * kademelendiriyor (`primary → .6 → .3`) — animasyon yok. Hareket olmadığı için
 * `prefers-reduced-motion` altında kapatılacak bir şey de kalmıyor.
 *
 * Ölçüler sözlükten; bileşende çıplak sayı yok (00 §3). Yatay boşluk **varyanta** bağlı:
 * satır, üstündeki mesaj satırlarıyla hizalanmak zorunda ve iki paketin mesaj satırı farklı
 * yatay boşluk kullanıyor (Mesajlar 26, SPEC-SUNUCU §3.3 24). Tek bir sayı seçmek,
 * ikisinden birinde satırı yarım karakter kaydırırdı.
 *
 * Kimse yazmıyorken satır **yerini korur** (`aria-hidden` boş kutu): yükseklik değişimi
 * mesaj listesini her tuş vuruşunda bir satır zıplatırdı.
 */

const { typing } = SERVER_METRICS;
const { messageList } = MESSAGES_METRICS;

/** DM satırı 26, sunucu kanalı 24 (`--m-pad`in yatay yarısı). Kalan her ölçü ortak. */
const PADDING_X: Record<"channel" | "dm", number> = {
  channel: typing.paddingX,
  dm: messageList.typingPaddingX,
};

interface TypingIndicatorProps {
  mode?: "channel" | "dm";
  typingUsers: string[];
}

export function TypingIndicator({ mode = "dm", typingUsers }: TypingIndicatorProps) {
  const { t } = useI18n();

  const rowStyle: React.CSSProperties = {
    fontSize: pxToRem(typing.fontSize),
    gap: pxToRem(typing.gap),
    minHeight: pxToRem(typing.dotSize + typing.paddingY * 2 + typing.fontSize),
    padding: `${pxToRem(typing.paddingY)} ${pxToRem(PADDING_X[mode])}`,
  };

  if (typingUsers.length === 0) {
    return <div aria-hidden="true" data-testid="typing-indicator-empty" style={rowStyle} />;
  }

  const text =
    typingUsers.length === 1
      ? t("chat.typing.one", { name: typingUsers[0] ?? "" })
      : typingUsers.length === 2
        ? t("chat.typing.two", {
            first: typingUsers[0] ?? "",
            second: typingUsers[1] ?? "",
          })
        : t("chat.typing.many");

  return (
    <div
      aria-live="polite"
      className="flex items-center text-[hsl(var(--text-muted))]"
      data-testid="typing-indicator"
      style={rowStyle}
    >
      <span aria-hidden="true" className="flex flex-none" style={{ gap: pxToRem(typing.dotGap) }}>
        {typing.dotAlphas.map((alpha, index) => (
          <span
            key={index}
            style={{
              background: `hsl(var(--primary)/${alpha})`,
              borderRadius: "50%",
              height: pxToRem(typing.dotSize),
              width: pxToRem(typing.dotSize),
            }}
          />
        ))}
      </span>
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}
