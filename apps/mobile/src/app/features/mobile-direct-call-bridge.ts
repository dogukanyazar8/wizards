export type MobileDirectCallStarter = (input: {
  conversationId: string;
  title: string;
  video: boolean;
}) => Promise<void>;

let starter: MobileDirectCallStarter | null = null;

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

export function hasMobileDirectCallStarter(): boolean {
  return starter !== null;
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
