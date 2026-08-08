import type { DMSystemMessageTypeValue } from "@wizards/types";

/**
 * Faz 5 §16.2. The server stores a system row with an empty `content` and never
 * writes the sentence: the wording depends on the reader's locale, and the
 * reader's locale is only known on the reader's device. This is where the row
 * becomes a sentence.
 */
export type GroupSystemMessageLabels = {
  readonly actorSelf: string;
  readonly added: string;
  readonly created: string;
  readonly iconChanged: string;
  readonly left: string;
  readonly nameChanged: string;
  readonly removed: string;
};

function selectTemplate(
  systemType: DMSystemMessageTypeValue,
  labels: GroupSystemMessageLabels,
): string {
  switch (systemType) {
    case "GROUP_CREATED":
      return labels.created;
    case "MEMBER_ADDED":
      return labels.added;
    case "MEMBER_LEFT":
      return labels.left;
    case "MEMBER_REMOVED":
      return labels.removed;
    case "ICON_CHANGED":
      return labels.iconChanged;
    case "NAME_CHANGED":
      return labels.nameChanged;
  }
}

export function formatGroupSystemMessage(input: {
  readonly actorName: string;
  readonly isActorSelf: boolean;
  readonly labels: GroupSystemMessageLabels;
  readonly systemType: DMSystemMessageTypeValue | null;
  readonly systemValue: string | null;
  readonly targetNames: readonly string[];
}): string {
  // An ordinary message reaches here whenever the caller does not branch first;
  // an empty string is the signal to draw nothing rather than an empty pill.
  if (!input.systemType) {
    return "";
  }

  return selectTemplate(input.systemType, input.labels)
    .replace("{actor}", input.isActorSelf ? input.labels.actorSelf : input.actorName)
    .replace("{targets}", input.targetNames.join(", "))
    .replace("{value}", input.systemValue ?? "");
}

export type GroupSystemMessageParticipant = {
  readonly displayName?: string | null | undefined;
  readonly userId: string;
  readonly username: string;
};

export type GroupSystemMessageSource = {
  readonly systemTargetUserIds?: readonly string[] | undefined;
  readonly systemType?: DMSystemMessageTypeValue | null | undefined;
  readonly systemValue?: string | null | undefined;
  readonly userId: string;
};

/** The seven strings the sentence is assembled from, pulled off the active copy. */
export function toGroupSystemMessageLabels(source: {
  readonly groupSystemActorSelf: string;
  readonly groupSystemAdded: string;
  readonly groupSystemCreated: string;
  readonly groupSystemIconChanged: string;
  readonly groupSystemLeft: string;
  readonly groupSystemNameChanged: string;
  readonly groupSystemRemoved: string;
}): GroupSystemMessageLabels {
  return {
    actorSelf: source.groupSystemActorSelf,
    added: source.groupSystemAdded,
    created: source.groupSystemCreated,
    iconChanged: source.groupSystemIconChanged,
    left: source.groupSystemLeft,
    nameChanged: source.groupSystemNameChanged,
    removed: source.groupSystemRemoved,
  };
}

function resolveParticipantName(
  participants: readonly GroupSystemMessageParticipant[],
  userId: string,
): string | null {
  const participant = participants.find((entry) => entry.userId === userId);
  return participant ? (participant.displayName ?? participant.username) : null;
}

/**
 * Name resolution plus formatting, shared by the chat row and the inbox preview
 * so the two surfaces cannot drift into describing the same event differently.
 * Returns an empty string for an ordinary message — the signal to draw nothing.
 */
export function buildGroupSystemMessageSentence(input: {
  readonly currentUserId: string;
  readonly labels: GroupSystemMessageLabels;
  readonly message: GroupSystemMessageSource;
  readonly participants: readonly GroupSystemMessageParticipant[];
}): string {
  return formatGroupSystemMessage({
    actorName: resolveParticipantName(input.participants, input.message.userId) ?? "",
    isActorSelf: input.message.userId === input.currentUserId,
    labels: input.labels,
    systemType: input.message.systemType ?? null,
    systemValue: input.message.systemValue ?? null,
    // A target who has since left the conversation is dropped rather than
    // printed as an empty name: the sentence stays readable, one name shorter.
    targetNames: (input.message.systemTargetUserIds ?? [])
      .map((userId) => resolveParticipantName(input.participants, userId))
      .filter((name): name is string => Boolean(name)),
  });
}
