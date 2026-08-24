"use client";

import { useMemo } from "react";
import type { ConversationRowDTO } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { findOtherParticipant, getConversationPreview } from "@/lib/dm/client";
import {
  getGroupConversationTitle,
  getGroupPreviewAuthorPrefix,
  isGroupConversation,
} from "@/lib/dm/group-presentation";
import { toConversationRow, type RailTimeLabels } from "@/lib/messages/rail-presentation";

/**
 * Sohbet listesinin satır türetimi — SPEC §3.
 *
 * Hem sohbet rayı hem boş durumun `Hızlı başla` çipleri aynı satırları istiyor.
 * İki yerde iki türetim, aynı sohbetin iki farklı adla görünmesi demek olurdu:
 * grup adı üyelerden türeyen bir cümle ve o cümlenin iki ayrı kopyası zamanla
 * ayrışır.
 */
export function useConversationRows(currentUserId: string): {
  isLoading: boolean;
  rows: ConversationRowDTO[];
} {
  const { locale, t } = useI18n();
  const { conversations, isLoading } = useDMConversations(currentUserId);

  const timeLabels = useMemo<RailTimeLabels>(
    () => ({
      // Gün adları `Intl` üzerinden: sözlüğe yedi anahtar daha koymak, iki dilde
      // el yazısı bir takvim tutmak olurdu.
      weekdays: Array.from({ length: 7 }, (_unused, day) =>
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 6, 5 + day)),
      ),
      yesterday: t("messages.conversation.dateYesterday"),
    }),
    [locale, t],
  );

  const rows = useMemo<ConversationRowDTO[]>(() => {
    // Tek `now`: liste içinde her satırın kendi saatini okuması, gece yarısını
    // geçen bir render'da yarısı "Dün" yarısı saat gösteren bir sütun demek.
    const now = new Date();

    return conversations.map((conversation) => {
      const group = isGroupConversation(conversation);
      const counterpart = findOtherParticipant(conversation, currentUserId);
      const name = group
        ? getGroupConversationTitle(
            conversation,
            currentUserId,
            t("dm.sidebar.unknownUser"),
            locale,
          )
        : (conversation.name ??
          counterpart?.displayName ??
          counterpart?.username ??
          t("dm.sidebar.unknownUser"));
      const authorPrefix = group
        ? getGroupPreviewAuthorPrefix(conversation, currentUserId, t("dm.group.selfLabel")) || null
        : conversation.lastMessage?.userId === currentUserId
          ? `${t("messages.rail.ownMessagePrefix")} `
          : null;

      return toConversationRow({
        authorPrefix,
        conversation,
        currentUserId,
        locale,
        name,
        now,
        preview: conversation.lastMessage
          ? getConversationPreview(
              conversation,
              58,
              t("chat.attachments.image"),
              t("chat.attachments.file"),
              t("chat.attachments.gif"),
            )
          : t("dm.sidebar.emptyConversation"),
        timeLabels,
      });
    });
  }, [conversations, currentUserId, locale, t, timeLabels]);

  return { isLoading, rows };
}
