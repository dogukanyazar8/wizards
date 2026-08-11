import {
  buildGroupNameFromMembers,
  type DMConversationDTO,
  type DMParticipantDTO,
  type DMReadReceipt,
  type GroupNameLocale,
} from "@wizards/types";

/**
 * Faz 6 §18.3 / §19.3. Everything the web surfaces need to *describe* a group
 * lives here rather than in a component: the sidebar row, the conversation
 * header and the details panel all answer the same three questions, and the
 * mobile app already learned that a second copy is a second answer.
 *
 * Selection and limit rules are not here — those come from `@wizards/types`
 * (`group-dm-selection`), shared with mobile.
 */

export function isGroupConversation(conversation: {
  readonly type: DMConversationDTO["type"];
}): boolean {
  return conversation.type === "GROUP_DM";
}

export function getParticipantDisplayName(participant: {
  readonly displayName: string | null;
  readonly username: string;
}): string {
  return participant.displayName ?? participant.username;
}

/**
 * The named group wins; otherwise the title is the members' names, viewer
 * excluded — a title that led with "you" would read the same on every row.
 *
 * Faz 3 §B3: the join itself is `buildGroupNameFromMembers` in `@wizards/types`,
 * shared with 2c's live hint. `locale` is required rather than defaulted so a
 * new call site cannot silently pick the wrong last separator.
 */
export function getGroupConversationTitle(
  conversation: Pick<DMConversationDTO, "name" | "participants">,
  currentUserId: string,
  fallback: string,
  locale: GroupNameLocale,
): string {
  if (conversation.name && conversation.name.trim().length > 0) {
    return conversation.name;
  }

  const derived = buildGroupNameFromMembers(
    conversation.participants
      .filter((participant) => participant.userId !== currentUserId)
      .map(getParticipantDisplayName),
    locale,
  );

  return derived.length > 0 ? derived : fallback;
}

/** Avatar-stack source: the other members, newest-page order, capped by the caller. */
export function getGroupAvatarParticipants(
  conversation: Pick<DMConversationDTO, "participants">,
  currentUserId: string,
  limit = 3,
): DMParticipantDTO[] {
  return conversation.participants
    .filter((participant) => participant.userId !== currentUserId)
    .slice(0, Math.max(0, limit));
}

export function getGroupMemberCount(conversation: Pick<DMConversationDTO, "participants">): number {
  return conversation.participants.length;
}

/**
 * 2d §8 — the "4 kişi okudu" line under an outgoing bubble.
 *
 * §4.5: this is computed from a participant list the caller has already loaded,
 * and only for the newest outgoing message of a group. A per-message version of
 * this would be one query per bubble on every page of history.
 */
export function buildGroupReadReceipt(input: {
  readonly authorId: string;
  readonly createdAt: Date;
  readonly participants: ReadonlyArray<{
    readonly lastReadAt: Date | null;
    readonly userId: string;
  }>;
}): DMReadReceipt {
  const createdAtMs = input.createdAt.getTime();
  // The author is dropped first: their own read mark always overtakes their own
  // message, so counting it would put "1 kişi okudu" under every bubble the
  // instant it was sent.
  const others = input.participants.filter((participant) => participant.userId !== input.authorId);
  const readerIds = others
    .filter(
      (participant) =>
        participant.lastReadAt !== null && participant.lastReadAt.getTime() >= createdAtMs,
    )
    .map((participant) => participant.userId);

  return {
    count: readerIds.length,
    // A group of one has nobody to have read it, so "Herkes okudu" would be a
    // claim about an empty set.
    everyone: others.length > 0 && readerIds.length === others.length,
    readerIds,
  };
}

/**
 * §18.3: in a group the preview says who spoke, because the row title is the
 * group and not a person. A 1:1 preview is unprefixed — the title already names
 * the only person who could have written it.
 */
export function getGroupPreviewAuthorPrefix(
  conversation: Pick<DMConversationDTO, "lastMessage" | "participants" | "type">,
  currentUserId: string,
  selfLabel: string,
): string {
  const lastMessage = conversation.lastMessage;
  if (!isGroupConversation(conversation) || !lastMessage) {
    return "";
  }

  // A system row is already a sentence about the group; prefixing it with an
  // author would produce "Ada: Ada created the group".
  if (lastMessage.systemType) {
    return "";
  }

  if (lastMessage.userId === currentUserId) {
    return `${selfLabel}: `;
  }

  const author = conversation.participants.find(
    (participant) => participant.userId === lastMessage.userId,
  );

  return author ? `${getParticipantDisplayName(author)}: ` : "";
}

/**
 * §18.3: search matches the group's own name *and* its members' names, so a
 * user can find an unnamed group by anybody in it.
 */
export function getConversationSearchTerms(
  conversation: Pick<DMConversationDTO, "name" | "participants" | "type">,
  currentUserId: string,
): string[] {
  const terms = conversation.name ? [conversation.name] : [];

  for (const participant of conversation.participants) {
    // The viewer is never searchable, in a group or a 1:1: their own name would
    // match every row they are in, which is all of them.
    if (participant.userId === currentUserId) {
      continue;
    }

    terms.push(getParticipantDisplayName(participant), `@${participant.username}`);
  }

  return terms;
}
