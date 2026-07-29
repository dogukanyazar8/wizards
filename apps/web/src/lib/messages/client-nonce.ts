/**
 * Server-side deduplication for a send the client may repeat.
 *
 * The nonce already travelled: the author's client mints one per send and the
 * server echoes it back so their optimistic bubble can absorb its own realtime
 * copy. Nothing stored it, so a retry — a response lost on a flaky link, an
 * offline replay, a double tap — wrote a second row and the reader saw their
 * message twice.
 *
 * The unique index is the decision-maker. This module is only the protocol around
 * it, kept free of Prisma so it can be tested without a database.
 */

/** Matches the wire schemas; a longer value is a client bug, not a message. */
export const MESSAGE_CLIENT_NONCE_MAX_LENGTH = 128;

export function normalizeMessageClientNonce(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MESSAGE_CLIENT_NONCE_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

/**
 * Whether a failed write lost the race for a nonce.
 *
 * Prisma names the violated constraint either by fields or by index name
 * depending on the connector and version, so both are accepted. Any other unique
 * violation — a reaction, a participant — must keep propagating.
 */
export function isMessageClientNonceConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== "P2002") {
    return false;
  }

  const target = meta?.target;
  if (typeof target === "string") {
    return target.includes("clientNonce");
  }

  return Array.isArray(target) && target.some((field) => String(field).includes("clientNonce"));
}

export interface IdempotentMessageSend<TMessage> {
  readonly clientNonce: string | null;
  readonly create: () => Promise<TMessage>;
  /** The message this author already wrote under this nonce, if any. */
  readonly findExisting: () => Promise<TMessage | null>;
}

export interface IdempotentMessageSendResult<TMessage> {
  /**
   * True when the caller is looking at a message it did not write. Fan-out,
   * unread counters and notifications already ran for it, so repeating them
   * would show the same message arriving twice.
   */
  readonly deduplicated: boolean;
  readonly message: TMessage;
}

export async function resolveIdempotentMessageSend<TMessage>({
  clientNonce,
  create,
  findExisting,
}: IdempotentMessageSend<TMessage>): Promise<IdempotentMessageSendResult<TMessage>> {
  if (!clientNonce) {
    return { deduplicated: false, message: await create() };
  }

  const existing = await findExisting();
  if (existing) {
    return { deduplicated: true, message: existing };
  }

  try {
    return { deduplicated: false, message: await create() };
  } catch (error) {
    if (!isMessageClientNonceConflict(error)) {
      throw error;
    }

    // The lookup above and the write are not one atomic step, so two identical
    // requests can both reach the write. The index picks one; the other reads
    // the winner's row instead of failing the author's send.
    const winner = await findExisting();
    if (!winner) {
      throw error;
    }

    return { deduplicated: true, message: winner };
  }
}
