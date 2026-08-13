type FrameScheduler = {
  cancelFrame: (frameId: number) => void;
  requestFrame: (callback: () => void) => number;
};

export function createRafThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  scheduler?: FrameScheduler,
) {
  const activeScheduler =
    scheduler ??
    ({
      cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
      requestFrame: (frameCallback) => window.requestAnimationFrame(frameCallback),
    } satisfies FrameScheduler);
  let frameId: number | null = null;
  let latestArgs: Args | null = null;

  return {
    cancel: () => {
      if (frameId !== null) {
        activeScheduler.cancelFrame(frameId);
        frameId = null;
      }
      latestArgs = null;
    },
    run: (...args: Args) => {
      latestArgs = args;
      if (frameId !== null) {
        return;
      }

      frameId = activeScheduler.requestFrame(() => {
        frameId = null;
        const argsToUse = latestArgs;
        latestArgs = null;
        if (argsToUse) {
          callback(...argsToUse);
        }
      });
    },
  };
}
