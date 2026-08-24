"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ConversationRowDTO } from "@wizards/types";

import { Modal } from "@/components/ui/modal";
import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * `Mesajı ilet` hedef seçici — SPEC-MESAJLAR §5.3.
 *
 * Hedefler **sohbetler**, arkadaşlar değil: iletmenin karşılığı "bunu şu
 * konuşmaya at" ve bir grup da geçerli bir hedef. Arkadaş listesinden seçilse
 * grup sohbetleri hedef olamazdı.
 *
 * Arama basit alt dize (Türkçe küçültmeyle): liste zaten kısa ve sıralı, bulanık
 * eşleme burada yanlış sohbete göndermek riskini getirirdi.
 */

const { groupModal } = MESSAGES_METRICS;

export type ForwardMessageSheetProps = {
  conversations: readonly ConversationRowDTO[];
  /** Kaynak sohbet listeden düşer: bir mesajı bulunduğu yere iletmek anlamsız. */
  excludeConversationId?: string | null;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  open: boolean;
  /** Uç hata verdiyse gösterilecek metin. */
  errorText?: string | null;
};

export function ForwardMessageList({
  conversations,
  excludeConversationId = null,
  errorText,
  onSelect,
}: Omit<ForwardMessageSheetProps, "onClose" | "open">) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr");

    return conversations.filter((conversation) => {
      if (conversation.id === excludeConversationId) {
        return false;
      }

      return needle.length === 0 || conversation.name.toLocaleLowerCase("tr").includes(needle);
    });
  }, [conversations, excludeConversationId, search]);

  return (
    <div data-testid="forward-message-sheet">
      <div
        className="flex items-center bg-[hsl(var(--surface-soft)/0.6)]"
        style={{
          border: `${hairline()} solid hsl(var(--border)/0.6)`,
          borderRadius: pxToRem(groupModal.searchRadius),
          gap: pxToRem(groupModal.searchGap),
          height: pxToRem(groupModal.searchHeight),
          padding: `0 ${pxToRem(groupModal.searchPaddingX)}`,
        }}
      >
        <Search
          aria-hidden="true"
          className="shrink-0 text-[hsl(var(--text-soft))]"
          style={{
            height: pxToRem(groupModal.searchIconSize),
            width: pxToRem(groupModal.searchIconSize),
          }}
        />
        <input
          aria-label={t("messages.rail.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] focus-visible:outline-hidden"
          data-testid="forward-message-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("messages.rail.searchPlaceholder")}
          style={{ fontSize: pxToRem(groupModal.searchFontSize) }}
          type="search"
          value={search}
        />
      </div>

      {errorText ? (
        <p
          className="text-[hsl(var(--danger))]"
          data-testid="forward-message-error"
          role="alert"
          style={{
            fontSize: pxToRem(groupModal.candidateStatusFontSize),
            marginTop: pxToRem(groupModal.candidatesPaddingTop),
          }}
        >
          {errorText}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p
          className="py-6 text-center text-[hsl(var(--text-secondary))]"
          data-testid="forward-message-empty"
          style={{ fontSize: pxToRem(groupModal.candidateNameFontSize) }}
        >
          {t("messages.conversation.menu.forwardEmpty")}
        </p>
      ) : (
        <ul
          className="flex flex-col overflow-y-auto"
          style={{
            gap: pxToRem(groupModal.candidateRowGap),
            marginTop: pxToRem(groupModal.candidatesPaddingTop),
            maxHeight: pxToRem(groupModal.candidatesMaxHeight),
          }}
        >
          {visible.map((conversation) => (
            <li key={conversation.id}>
              <button
                className="flex w-full items-center text-left transition hover:bg-[hsl(var(--surface-soft)/0.7)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid="forward-message-row"
                onClick={() => onSelect(conversation.id)}
                style={{
                  borderRadius: pxToRem(groupModal.candidateRowRadius),
                  gap: pxToRem(groupModal.candidateRowGap),
                  padding: `${pxToRem(groupModal.candidateRowPaddingY)} ${pxToRem(groupModal.candidateRowPaddingX)}`,
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn("grid shrink-0 place-items-center text-white", DISPLAY_FONT)}
                  style={{
                    background: getGroupSwatchBackground(conversation.tileColor),
                    ...(getGroupSwatchInk(conversation.tileColor)
                      ? { color: getGroupSwatchInk(conversation.tileColor) }
                      : {}),
                    borderRadius: pxToRem(groupModal.candidateRowRadius),
                    fontSize: pxToRem(groupModal.candidateAvatarFontSize),
                    fontWeight: 600,
                    height: pxToRem(groupModal.candidateAvatarSize),
                    width: pxToRem(groupModal.candidateAvatarSize),
                  }}
                >
                  {conversation.initials}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
                  style={{
                    fontSize: pxToRem(groupModal.candidateNameFontSize),
                    fontWeight: 600,
                  }}
                >
                  {conversation.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ForwardMessageSheet({ onClose, open, ...list }: ForwardMessageSheetProps) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-w-md"
      onClose={onClose}
      open={open}
      title={t("messages.conversation.menu.forwardTitle")}
    >
      <ForwardMessageList {...list} />
    </Modal>
  );
}
