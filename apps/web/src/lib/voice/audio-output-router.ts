type AudioOutput = { setSinkId?: (deviceId: string) => Promise<void> };
export type AudioOutputResult =
  | { status: "applied" }
  | { status: "fallback"; error: unknown }
  | { status: "failed"; error: unknown };

/** Serialize the same element's sink changes; only the latest request may report or recover. */
export function createAudioOutputRouter(
  output: AudioOutput,
  onResult: (result: AudioOutputResult, requestedDeviceId: string) => void,
) {
  let generation = 0;
  let disposed = false;
  let pending = Promise.resolve();
  return {
    select(deviceId: string) {
      const request = ++generation;
      const current = () => !disposed && generation === request;
      pending = pending.then(async () => {
        if (!current()) return;
        const sinkId = deviceId === "default" ? "" : deviceId;
        if (!output.setSinkId) {
          onResult(
            sinkId === ""
              ? { status: "applied" }
              : {
                  status: "failed",
                  error: new Error("Audio output selection is unavailable"),
                },
            deviceId,
          );
          return;
        }
        let result: AudioOutputResult;
        try {
          await output.setSinkId(sinkId);
          result = { status: "applied" };
        } catch (error) {
          if (!current()) return;
          const name = error && typeof error === "object" && "name" in error ? error.name : "";
          if (sinkId && (name === "NotFoundError" || name === "AbortError")) {
            try {
              await output.setSinkId("");
              result = { status: "fallback", error };
            } catch (fallbackError) {
              result = { status: "failed", error: fallbackError };
            }
          } else {
            result = { status: "failed", error };
          }
        }
        if (current()) onResult(result, deviceId);
      });
      return pending;
    },
    dispose() {
      disposed = true;
      generation += 1;
    },
  };
}
