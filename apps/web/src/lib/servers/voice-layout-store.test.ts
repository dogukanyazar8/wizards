import assert from "node:assert/strict";
import { it } from "node:test";

it("saves layout immediately, restores it and safely handles an invalid saved selection", async () => {
  const values = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  });
  try {
    const { useVoiceLayout } = await import("./voice-layout-store");
    useVoiceLayout.getState().setLayout("compact");
    const saved = JSON.parse(values.get("whispr-voice-layout")!);
    assert.deepEqual(saved.state, { layout: "compact" });

    values.set("whispr-voice-layout", JSON.stringify({ ...saved, state: { layout: "speaker" } }));
    await useVoiceLayout.persist.rehydrate();
    assert.equal(useVoiceLayout.getState().layout, "speaker");

    values.set("whispr-voice-layout", JSON.stringify({ ...saved, state: { layout: "invalid" } }));
    await useVoiceLayout.persist.rehydrate();
    assert.equal(useVoiceLayout.getState().layout, "fit");
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
