type Confirmation = { message: string; danger: boolean };
let current: Confirmation | null = null;
let resolveCurrent: ((accepted: boolean) => void) | null = null;
const listeners = new Set<() => void>();
export const confirmationSnapshot = () => current;
export function finishConfirmation(accepted: boolean) {
  const resolve = resolveCurrent;
  current = null;
  resolveCurrent = null;
  for (const listener of listeners) listener();
  resolve?.(accepted);
}
export function subscribeConfirmation(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) finishConfirmation(false);
  };
}
/** Never replace an active approval or implicitly approve when its UI is absent. */
export function confirmAction(message: string, danger = false): Promise<boolean> {
  if (current || !listeners.size) return Promise.resolve(false);
  return new Promise((resolve) => {
    resolveCurrent = resolve;
    current = { message, danger };
    for (const listener of listeners) listener();
  });
}
