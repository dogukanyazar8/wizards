"use client";

import React from "react";
import { MessageCircle, Plus, UserPlus } from "lucide-react";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  selectQuickStart,
  type ConversationRowDTO,
} from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Mesajlar boş durumu — SPEC-MESAJLAR §9.
 *
 * `Hızlı başla` çipleri **gerçek** sohbetlerden geliyor (karar #12): önce
 * sabitlenenler, yetmezse en son konuşulanlar. Hiç sohbet yoksa hem çip şeridi
 * hem `Hızlı başla:` etiketi çizilmez — boş bir etiketin altında hiçbir şey
 * olmaması, kullanıcıya bir şeyin yüklenmediğini düşündürürdü.
 */

const { emptyState } = MESSAGES_METRICS;

export type MessagesEmptyStateProps = {
  conversations: readonly ConversationRowDTO[];
  onNewGroup: () => void;
  onNewMessage: () => void;
  onOpenConversation: (conversationId: string) => void;
};

export function MessagesEmptyState({
  conversations,
  onNewGroup,
  onNewMessage,
  onOpenConversation,
}: MessagesEmptyStateProps) {
  const { t } = useI18n();
  const quickStart = selectQuickStart(conversations, emptyState.quickChipCount);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
      data-testid="messages-empty-state"
      style={{ padding: pxToRem(emptyState.padding) }}
    >
      <span
        aria-hidden="true"
        className="grid place-items-center bg-[hsl(var(--primary)/0.12)] text-[var(--primary-readable)]"
        style={{
          borderRadius: pxToRem(emptyState.iconBoxRadius),
          height: pxToRem(emptyState.iconBoxSize),
          width: pxToRem(emptyState.iconBoxSize),
        }}
      >
        <MessageCircle
          style={{
            height: pxToRem(emptyState.iconSize),
            width: pxToRem(emptyState.iconSize),
          }}
        />
      </span>

      <h2
        className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
        data-testid="messages-empty-title"
        style={{
          fontSize: pxToRem(emptyState.titleFontSize),
          fontWeight: 600,
          lineHeight: emptyState.titleLineHeight,
          marginTop: pxToRem(emptyState.titleMarginTop),
        }}
      >
        {t("messages.empty.title")}
      </h2>

      <p
        className="text-[hsl(var(--text-secondary))]"
        style={{
          fontSize: pxToRem(emptyState.descriptionFontSize),
          lineHeight: emptyState.descriptionLineHeight,
          marginTop: pxToRem(emptyState.descriptionMarginTop),
          maxWidth: pxToRem(emptyState.descriptionMaxWidth),
        }}
      >
        {t("messages.empty.description", { count: GROUP_DM_MAX_PARTICIPANTS })}
      </p>

      <div
        className="flex items-center"
        style={{
          gap: pxToRem(emptyState.actionsGap),
          marginTop: pxToRem(emptyState.actionsMarginTop),
        }}
      >
        <button
          className="inline-flex items-center bg-[hsl(var(--primary))] text-white transition hover:bg-[hsl(var(--primary)/0.9)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="messages-empty-new-message"
          onClick={onNewMessage}
          style={{
            borderRadius: pxToRem(emptyState.actionRadius),
            fontSize: pxToRem(emptyState.actionFontSize),
            fontWeight: 600,
            gap: pxToRem(emptyState.actionGap),
            height: pxToRem(emptyState.actionHeight),
            padding: `0 ${pxToRem(emptyState.actionPaddingX)}`,
          }}
          type="button"
        >
          <Plus
            aria-hidden="true"
            style={{
              height: pxToRem(emptyState.actionIconSize),
              width: pxToRem(emptyState.actionIconSize),
            }}
          />
          {t("messages.empty.newMessage")}
        </button>

        <button
          className="inline-flex items-center bg-transparent text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--surface-soft)/0.7)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="messages-empty-new-group"
          onClick={onNewGroup}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(emptyState.actionRadius),
            fontSize: pxToRem(emptyState.actionFontSize),
            fontWeight: 600,
            gap: pxToRem(emptyState.actionGap),
            height: pxToRem(emptyState.actionHeight),
            padding: `0 ${pxToRem(emptyState.actionPaddingX)}`,
          }}
          type="button"
        >
          <UserPlus
            aria-hidden="true"
            style={{
              height: pxToRem(emptyState.actionIconSize),
              width: pxToRem(emptyState.actionIconSize),
            }}
          />
          {t("messages.empty.newGroup")}
        </button>
      </div>

      {quickStart.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-center"
          data-testid="messages-empty-quick-start"
          style={{
            gap: pxToRem(emptyState.quickGap),
            marginTop: pxToRem(emptyState.quickMarginTop),
          }}
        >
          <span
            className="text-[hsl(var(--text-soft))]"
            style={{ fontSize: pxToRem(emptyState.quickLabelFontSize) }}
          >
            {t("messages.empty.quickStart")}
          </span>
          {quickStart.map((conversation) => (
            <button
              className="inline-flex items-center bg-transparent text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--surface-soft)/0.7)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="messages-empty-quick-chip"
              key={conversation.id}
              onClick={() => onOpenConversation(conversation.id)}
              style={{
                border: `${hairline()} solid hsl(var(--border)/0.7)`,
                borderRadius: pxToRem(emptyState.quickChipRadius),
                fontSize: pxToRem(emptyState.quickChipFontSize),
                gap: pxToRem(emptyState.quickChipGap),
                height: pxToRem(emptyState.quickChipHeight),
                padding: `0 ${pxToRem(emptyState.quickChipPaddingX)}`,
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn("grid place-items-center text-white", DISPLAY_FONT)}
                style={{
                  background: getGroupSwatchBackground(conversation.tileColor),
                  ...(getGroupSwatchInk(conversation.tileColor)
                    ? { color: getGroupSwatchInk(conversation.tileColor) }
                    : {}),
                  borderRadius: pxToRem(emptyState.quickChipTileRadius),
                  fontSize: pxToRem(emptyState.quickChipTileFontSize),
                  fontWeight: 600,
                  height: pxToRem(emptyState.quickChipTileSize),
                  width: pxToRem(emptyState.quickChipTileSize),
                }}
              >
                {conversation.initials}
              </span>
              {conversation.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
