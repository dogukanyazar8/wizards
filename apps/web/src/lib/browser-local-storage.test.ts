import assert from "node:assert/strict";
import test from "node:test";

import { requireBrowserLocalStorage } from "./browser-local-storage";

function withLocalStorage(value: unknown, run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value,
    writable: true,
  });

  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
}

// Node 26 ships `localStorage` as a global that is `undefined` without
// `--localstorage-file`, so "the global exists" no longer means "storage works".
test("rejects the undefined localStorage global Node 26 defines on the server", () => {
  withLocalStorage(undefined, () => {
    assert.throws(() => requireBrowserLocalStorage(), /localStorage is unavailable/u);
  });
});

test("returns the browser storage when one is present", () => {
  const storage = { getItem: () => null } as unknown as Storage;

  withLocalStorage(storage, () => {
    assert.equal(requireBrowserLocalStorage(), storage);
  });
});
