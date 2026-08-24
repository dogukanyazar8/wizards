"use client";

import React from "react";
import type { PollDTO, PollVoterDTO } from "@wizards/types";

import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * Oy verenler — SPEC-MESAJLAR §5.5.
 *
 * Anonim ankette buraya **hiç gelinmez**: kart bağlantıyı `canSeeVoters` ile
 * çiziyor ve uç zaten 403 veriyor. Yani gizlilik iki katmanda birden duruyor;
 * bağlantıyı gizlemek tek başına bir koruma sayılmaz.
 */

const { poll: pollMetrics, messageList } = MESSAGES_METRICS;

export type PollVotersListProps = {
  poll: PollDTO;
  voters: readonly PollVoterDTO[];
};

export type PollVotersSheetProps = PollVotersListProps & {
  onClose: () => void;
  open: boolean;
};

/** Liste gövdesi — `Modal` portalı sunucuda `null` döndüğü için ayrı. */
export function PollVotersList({ poll, voters }: PollVotersListProps) {
  return (
    <div
      className="flex flex-col"
      data-testid="poll-voters-list"
      style={{ gap: pxToRem(pollMetrics.optionsMarginTop) }}
    >
      {poll.options.map((option) => {
        const optionVoters = voters.filter((voter) => voter.optionId === option.id);

        return (
          <section key={option.id}>
            <h3
              className="text-[hsl(var(--text-secondary))]"
              style={{ fontSize: pxToRem(pollMetrics.footerFontSize), fontWeight: 600 }}
            >
              {option.label} · {option.votes}
            </h3>
            <ul
              className="flex flex-col"
              style={{
                gap: pxToRem(messageList.reactionGap),
                marginTop: pxToRem(messageList.reactionGap),
              }}
            >
              {optionVoters.map((voter) => (
                <li
                  className="flex items-center"
                  data-testid="poll-voter"
                  key={`${option.id}:${voter.id}`}
                  style={{ gap: pxToRem(messageList.attachmentGap) }}
                >
                  <Avatar
                    alt={voter.displayName ?? voter.username}
                    className="rounded-full"
                    fallback={voter.displayName ?? voter.username}
                    src={voter.avatarUrl}
                    style={{
                      height: pxToRem(messageList.threadStripAvatarSize),
                      width: pxToRem(messageList.threadStripAvatarSize),
                    }}
                  />
                  <span
                    className="min-w-0 truncate text-[hsl(var(--foreground))]"
                    style={{ fontSize: pxToRem(messageList.attachmentMetaFontSize) }}
                  >
                    {voter.displayName ?? voter.username}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function PollVotersSheet({ onClose, open, poll, voters }: PollVotersSheetProps) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-w-md"
      onClose={onClose}
      open={open}
      title={t("messages.poll.votersTitle")}
    >
      <PollVotersList poll={poll} voters={voters} />
    </Modal>
  );
}
