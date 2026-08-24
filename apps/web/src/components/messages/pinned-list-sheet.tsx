"use client";

import React from "react";
import { CornerUpRight, PinOff } from "lucide-react";
import type { PinnedMessageDTO } from "@wizards/types";

import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";

/**
 * `Tümünü gör` — SPEC-MESAJLAR §5.2.
 *
 * Sabitlenenlerin tamamı, her satırda mesaja gitme ve **yetkisi olanda**
 * sabitlemeyi kaldırma. Yetkiyi uç söylüyor (`removable`); istemci "kendi mesajı
 * mı" diye tahmin etmez, çünkü yönetici başkasının mesajını da kaldırabilir ve
 * tahmin o durumu kaçırırdı.
 */

const { messageList } = MESSAGES_METRICS;

export type PinnedListProps = {
  onJump: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
  pins: readonly PinnedMessageDTO[];
};

export type PinnedListSheetProps = PinnedListProps & {
  onClose: () => void;
  open: boolean;
};

/**
 * Listenin kendisi — `Modal`'dan ayrı.
 *
 * `Modal` bir portal ve sunucuda `null` döner; gövde onun içine gömülü kalsaydı
 * sunucu render'ıyla test edilemez, yalnız gerçek tarayıcıda görülebilirdi.
 * Ayrılınca hem test edilebiliyor hem de başka bir yüzey (ör. sağ panel) aynı
 * listeyi çizebiliyor.
 */
export function PinnedList({ onJump, onUnpin, pins }: PinnedListProps) {
  const { t } = useI18n();

  return (
    <>
      {pins.length === 0 ? (
        <p
          className="py-6 text-center text-[hsl(var(--text-secondary))]"
          data-testid="pinned-list-empty"
          style={{ fontSize: pxToRem(messageList.bodyFontSize) }}
        >
          {t("messages.conversation.pinnedList.empty")}
        </p>
      ) : (
        <ul
          className="flex flex-col"
          data-testid="pinned-list"
          style={{ gap: pxToRem(messageList.reactionGap) }}
        >
          {pins.map((pin) => (
            <li
              className="flex items-center bg-[hsl(var(--surface-card))]"
              data-testid="pinned-list-row"
              key={pin.messageId}
              style={{
                border: `${hairline()} solid hsl(var(--border)/0.6)`,
                borderRadius: pxToRem(messageList.attachmentRadius),
                gap: pxToRem(messageList.attachmentGap),
                padding: `${pxToRem(messageList.attachmentPaddingY)} ${pxToRem(messageList.attachmentPaddingX)}`,
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[hsl(var(--foreground))]"
                  style={{ fontSize: pxToRem(messageList.attachmentNameFontSize), fontWeight: 600 }}
                >
                  {pin.authorName}
                </p>
                <p
                  className="truncate text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(messageList.attachmentMetaFontSize),
                    marginTop: pxToRem(messageList.attachmentMetaMarginTop),
                  }}
                >
                  {pin.excerpt}
                </p>
              </div>

              <button
                aria-label={t("messages.conversation.pinnedList.jump")}
                className="grid shrink-0 place-items-center text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft)/0.7)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid="pinned-list-jump"
                onClick={() => onJump(pin.messageId)}
                style={{
                  borderRadius: pxToRem(messageList.attachmentActionRadius),
                  height: pxToRem(messageList.attachmentActionSize),
                  width: pxToRem(messageList.attachmentActionSize),
                }}
                title={t("messages.conversation.pinnedList.jump")}
                type="button"
              >
                <CornerUpRight aria-hidden="true" className="h-4 w-4" />
              </button>

              {pin.removable ? (
                <button
                  aria-label={t("messages.conversation.pinnedList.unpin")}
                  className="grid shrink-0 place-items-center text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  data-testid="pinned-list-unpin"
                  onClick={() => onUnpin(pin.messageId)}
                  style={{
                    borderRadius: pxToRem(messageList.attachmentActionRadius),
                    height: pxToRem(messageList.attachmentActionSize),
                    width: pxToRem(messageList.attachmentActionSize),
                  }}
                  title={t("messages.conversation.pinnedList.unpin")}
                  type="button"
                >
                  <PinOff aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function PinnedListSheet({ onClose, onJump, onUnpin, open, pins }: PinnedListSheetProps) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-w-lg"
      onClose={onClose}
      open={open}
      title={t("messages.conversation.pinnedList.title")}
    >
      <PinnedList onJump={onJump} onUnpin={onUnpin} pins={pins} />
    </Modal>
  );
}
