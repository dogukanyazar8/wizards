export type MobileDirectCallStarter = (input: {
  conversationId: string;
  title: string;
  video: boolean;
}) => Promise<void>;

let starter: MobileDirectCallStarter | null = null;
let joiner: MobileDirectCallStarter | null = null;

/**
 * The DM call ring handshake lives in `useMobileDMCallFeature`, which is mounted
 * once inside the product shell. Surfaces outside that tree — the 11b profile
 * card — reach the *same* starter through this module instead of standing up a
 * second call flow. Pure module: no React, no globals beyond this slot.
 */
export function setMobileDirectCallStarter(next: MobileDirectCallStarter | null): () => void {
  starter = next;
  return () => {
    if (starter === next) {
      starter = null;
    }
  };
}

/**
 * Faz 5 §B5. The same slot for the other verb: entering a call that is already
 * running. 2d's "Katıl" banner and any other surface outside the shell reach the
 * one mounted flow rather than emitting `dm:call:join` on their own — a second
 * emitter would put a user in the roster without a room.
 */
export function setMobileDirectCallJoiner(next: MobileDirectCallStarter | null): () => void {
  joiner = next;
  return () => {
    if (joiner === next) {
      joiner = null;
    }
  };
}

/** Resolves to false when no shell is mounted, so callers can stay silent. */
export async function startMobileDirectCall(input: {
  conversationId: string;
  title: string;
  video: boolean;
}): Promise<boolean> {
  if (!starter) {
    return false;
  }

  await starter(input);
  return true;
}

export async function joinMobileOngoingCall(input: {
  conversationId: string;
  title: string;
  video: boolean;
}): Promise<boolean> {
  if (!joiner) {
    return false;
  }

  await joiner(input);
  return true;
}
