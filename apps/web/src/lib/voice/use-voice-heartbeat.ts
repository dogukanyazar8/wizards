import { useCallback, useEffect, useRef } from "react";

export type VoiceHeartbeatPayload = {
  selfStream?: boolean;
  selfVideo?: boolean;
};

export type VoiceHeartbeatOptions = {
  getPayload: () => VoiceHeartbeatPayload;
  intervalMs: number;
  onTick?: (sessionId: string) => void;
  sendHeartbeat: (sessionId: string, payload: VoiceHeartbeatPayload) => Promise<unknown>;
};

export type VoiceHeartbeatTimerApi<TimerHandle> = {
  clearInterval: (handle: TimerHandle) => void;
  setInterval: (callback: () => void, ms: number) => TimerHandle;
};

export type VoiceHeartbeatController = {
  isRunning: () => boolean;
  start: (sessionId: string) => void;
  stop: () => void;
  updateOptions: (options: VoiceHeartbeatOptions) => void;
};

export function createVoiceHeartbeatController<TimerHandle>(
  timers: VoiceHeartbeatTimerApi<TimerHandle>,
  initialOptions: VoiceHeartbeatOptions,
): VoiceHeartbeatController {
  let activeInterval: TimerHandle | null = null;
  let options = initialOptions;

  return {
    isRunning() {
      return activeInterval !== null;
    },
    start(sessionId) {
      this.stop();

      const startedOptions = options;
      activeInterval = timers.setInterval(() => {
        void startedOptions
          .sendHeartbeat(sessionId, startedOptions.getPayload())
          .catch(() => undefined);
        startedOptions.onTick?.(sessionId);
      }, startedOptions.intervalMs);
    },
    stop() {
      if (activeInterval === null) {
        return;
      }

      timers.clearInterval(activeInterval);
      activeInterval = null;
    },
    updateOptions(nextOptions) {
      options = nextOptions;
    },
  };
}

export function createVoiceHeartbeatTimerApi(): VoiceHeartbeatTimerApi<ReturnType<typeof setInterval>> {
  return {
    clearInterval: (handle) => globalThis.clearInterval(handle),
    setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  };
}

export function useVoiceHeartbeat(options: VoiceHeartbeatOptions) {
  const controllerRef = useRef<VoiceHeartbeatController | null>(null);
  controllerRef.current ??= createVoiceHeartbeatController<ReturnType<typeof setInterval>>(
    createVoiceHeartbeatTimerApi(),
    options,
  );

  useEffect(() => {
    controllerRef.current?.updateOptions(options);
  }, [options]);

  const startHeartbeat = useCallback((sessionId: string) => {
    controllerRef.current?.start(sessionId);
  }, []);

  const stopHeartbeat = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  useEffect(() => stopHeartbeat, [stopHeartbeat]);

  return {
    startHeartbeat,
    stopHeartbeat,
  };
}
