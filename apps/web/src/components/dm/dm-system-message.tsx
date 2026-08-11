"use client";

import React from "react";
import type { DMParticipantDTO, DMSystemMessageTypeValue } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";

export type DmSystemMessageParticipant = Pick<
  DMParticipantDTO,
  "displayName" | "userId" | "username"
>;

type DmSystemMessageProps = {
  actorUserId: string;
  currentUserId: string;
  participants: readonly DmSystemMessageParticipant[];
  systemTargetUserIds?: readonly string[] | undefined;
  systemType?: DMSystemMessageTypeValue | null | undefined;
  systemValue?: string | null | undefined;
};

const TEMPLATE_KEYS: Record<DMSystemMessageTypeValue, string> = {
  DISAPPEARING_CHANGED: "dm.group.system.disappearingChanged",
  GROUP_CREATED: "dm.group.system.created",
  ICON_CHANGED: "dm.group.system.iconChanged",
  MEMBER_ADDED: "dm.group.system.added",
  MEMBER_LEFT: "dm.group.system.left",
  MEMBER_REMOVED: "dm.group.system.removed",
  NAME_CHANGED: "dm.group.system.nameChanged",
};

const DISAPPEARING_WINDOWS = new Set<string>(["OFF", "H24", "D7", "D90"]);

function resolveName(
  participants: readonly DmSystemMessageParticipant[],
  userId: string,
): string | null {
  const participant = participants.find((entry) => entry.userId === userId);
  return participant ? (participant.displayName ?? participant.username) : null;
}

/**
 * The web half of the mobile `formatGroupSystemMessage`. Separate from the
 * component because the sidebar needs the same sentence as a plain string for
 * its row preview, and two builders would be two ways to describe one event.
 * Returns an empty string for an ordinary message.
 */
export function buildDmSystemMessageSentence(
  input: Omit<DmSystemMessageProps, "participants"> & {
    participants: readonly DmSystemMessageParticipant[];
    t: (key: string, values?: Record<string, number | string>) => string;
  },
): string {
  if (!input.systemType) {
    return "";
  }

  const actor =
    input.actorUserId === input.currentUserId
      ? input.t("dm.group.selfLabel")
      : (resolveName(input.participants, input.actorUserId) ?? "");
  // A target who has since left is dropped rather than printed as a blank name.
  const targets = (input.systemTargetUserIds ?? [])
    .map((userId) => resolveName(input.participants, userId))
    .filter((name): name is string => Boolean(name))
    .join(", ");

  // K3 / C2. `systemValue` carries the enum, not prose — the row is stored once
  // and read in whatever locale each member is using.
  const value =
    input.systemType === "DISAPPEARING_CHANGED" &&
    input.systemValue &&
    DISAPPEARING_WINDOWS.has(input.systemValue)
      ? input.t(`dm.group.disappearing.${input.systemValue}`)
      : (input.systemValue ?? "");

  return input.t(TEMPLATE_KEYS[input.systemType], {
    actor,
    targets,
    value,
  });
}

/**
 * Faz 6 §19.1. A centred, muted line — not a bubble, no avatar, no timestamp,
 * nothing to act on.
 */
export function DmSystemMessage({
  actorUserId,
  currentUserId,
  participants,
  systemTargetUserIds,
  systemType,
  systemValue,
}: DmSystemMessageProps) {
  const { t } = useI18n();
  const sentence = buildDmSystemMessageSentence({
    actorUserId,
    currentUserId,
    participants,
    systemTargetUserIds,
    systemType,
    systemValue,
    t,
  });

  if (!sentence) {
    return null;
  }

  return (
    <p
      className="my-1.5 px-4 text-center text-xs font-semibold leading-5 text-app-soft"
      data-testid="dm-system-message"
    >
      {sentence}
    </p>
  );
}
