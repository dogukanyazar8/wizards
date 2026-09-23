/**
 * Zustand's `createJSONStorage` treats a throwing getter as "no storage available"
 * but accepts whatever a returning getter hands back. Node 26 defines `localStorage`
 * as a global whose value is `undefined` unless `--localstorage-file` is passed, so
 * a bare `localStorage` reference stopped throwing on the server and the persisted
 * stores started calling `setItem` on `undefined`.
 */
export function requireBrowserLocalStorage(): Storage {
  const storage = globalThis.localStorage as Storage | undefined;

  if (!storage) {
    throw new Error("localStorage is unavailable outside the browser.");
  }

  return storage;
}
