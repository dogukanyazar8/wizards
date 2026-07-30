export function scheduleMobileIdleTask(callback: () => void): { cancel(): void } {
  if (
    typeof globalThis.requestIdleCallback === "function" &&
    typeof globalThis.cancelIdleCallback === "function"
  ) {
    const handle = globalThis.requestIdleCallback(callback);

    return {
      cancel: () => globalThis.cancelIdleCallback(handle),
    };
  }

  const handle = globalThis.setTimeout(callback, 0);

  return {
    cancel: () => globalThis.clearTimeout(handle),
  };
}
