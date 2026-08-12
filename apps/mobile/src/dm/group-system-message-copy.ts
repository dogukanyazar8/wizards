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
  /** Faz 2 §C2. `{value}` is one of `disappearingWindows`, not a raw enum. */
  readonly disappearingChanged: string;
  readonly disappearingWindows: Readonly<Record<string, string>>;
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
    case "DISAPPEARING_CHANGED":
      return labels.disappearingChanged;
  }
}

/**
 * Faz 2 §C2. The server stores the window enum, never prose — so the reader
 * turns `H24` into "24 saat" here, the same way they turn the template into a
 * sentence. An unknown value falls through unchanged rather than blanking the
 * row, which is what a client older than a future window would do.
 */
function resolveSystemValue(
  systemType: DMSystemMessageTypeValue,
  systemValue: string | null,
  labels: GroupSystemMessageLabels,
): string {
  if (systemType !== "DISAPPEARING_CHANGED" || !systemValue) {
    return systemValue ?? "";
  }

  return labels.disappearingWindows[systemValue] ?? systemValue;
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
    .replace("{value}", resolveSystemValue(input.systemType, input.systemValue, input.labels));
}

export type GroupSystemMessageParticipant = {
  readonly displayName?: string | null | undefined;
  readonly userId: string;
  readonly username: string;
};

export type GroupSystemMessageSource = {
  /**
   * The row's own author, carried on every message the server sends. It is what
   * makes "{actor} gruptan ayrıldı" readable: `MEMBER_LEFT` is written by the
   * person leaving, and by the time anybody reads the row that person is no
   * longer in `participants` — the membership row is deleted, not flagged — so
   * the lookup below finds nothing and the sentence used to start with a blank.
   */
  readonly author?:
    | {
        readonly displayName?: string | null | undefined;
        readonly username: string;
      }
    | null
    | undefined;
  readonly systemTargetUserIds?: readonly string[] | undefined;
  readonly systemType?: DMSystemMessageTypeValue | null | undefined;
  readonly systemValue?: string | null | undefined;
  readonly userId: string;
};

/** The strings the sentence is assembled from, pulled off the active copy. */
export function toGroupSystemMessageLabels(source: {
  readonly groupDisappearing24h: string;
  readonly groupDisappearing7d: string;
  readonly groupDisappearing90d: string;
  readonly groupDisappearingOff: string;
  readonly groupSystemActorSelf: string;
  readonly groupSystemAdded: string;
  readonly groupSystemCreated: string;
  readonly groupSystemDisappearingChanged: string;
  readonly groupSystemIconChanged: string;
  readonly groupSystemLeft: string;
  readonly groupSystemNameChanged: string;
  readonly groupSystemRemoved: string;
}): GroupSystemMessageLabels {
  return {
    actorSelf: source.groupSystemActorSelf,
    added: source.groupSystemAdded,
    created: source.groupSystemCreated,
    disappearingChanged: source.groupSystemDisappearingChanged,
    disappearingWindows: {
      D7: source.groupDisappearing7d,
      D90: source.groupDisappearing90d,
      H24: source.groupDisappearing24h,
      OFF: source.groupDisappearingOff,
    },
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

/** The name the row carries itself, for an actor who is no longer a member. */
function resolveAuthorName(author: GroupSystemMessageSource["author"]): string | null {
  return author ? (author.displayName ?? author.username) : null;
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
    // The roster first — a member may have changed their display name since the
    // row was written — then the row's own author, who survives leaving.
    actorName:
      resolveParticipantName(input.participants, input.message.userId) ??
      resolveAuthorName(input.message.author) ??
      "",
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
