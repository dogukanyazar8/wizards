type MobileAccountDeletionReauthListener = (token: string) => void;

const listeners = new Set<MobileAccountDeletionReauthListener>();
let pendingToken: string | null = null;

export function publishMobileAccountDeletionReauth(token: string): void {
  pendingToken = token;
  if (listeners.size === 0) return;
  pendingToken = null;
  for (const listener of listeners) listener(token);
}

export function consumePendingMobileAccountDeletionReauth(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}

export function subscribeMobileAccountDeletionReauth(
  listener: MobileAccountDeletionReauthListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
