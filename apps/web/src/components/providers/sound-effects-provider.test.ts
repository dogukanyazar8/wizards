import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Execute the real provider effects with isolated socket/audio boundaries; no
// browser autoplay policy or live connection should affect notification tests.
const providerCode = transformSync(
  readFileSync(new URL("./sound-effects-provider.tsx", import.meta.url), "utf8"),
  { format: "cjs", loader: "tsx" },
).code;

function mountProvider(
  options: {
    activeChannelId?: string | null;
    streamerModeActive?: boolean;
    voiceJoinEnabled?: boolean;
    voiceLeaveEnabled?: boolean;
  } = {},
) {
  const effects: Array<() => void | (() => void)> = [];
  const listeners = new Map<string, (data: unknown) => void>();
  const played: string[] = [];
  const voiceState = {
    activeChannelId: options.activeChannelId === undefined ? "channel-1" : options.activeChannelId,
    masterOutputVolume: 100,
  };
  const useVoiceStore = Object.assign(
    (selector: (state: typeof voiceState) => unknown) => selector(voiceState),
    {
      getState: () => voiceState,
    },
  );
  const modules: Record<string, unknown> = {
    react: {
      useCallback: (callback: unknown) => callback,
      useEffect: (effect: () => void | (() => void)) => effects.push(effect),
      useRef: (current: unknown) => ({ current }),
    },
    "@tanstack/react-query": { useQuery: () => ({ data: {} }) },
    "zustand/react/shallow": { useShallow: (selector: unknown) => selector },
    "@/hooks/use-socket": {
      useSocket: () => ({
        on: (name: string, handler: (data: unknown) => void) => listeners.set(name, handler),
        off: (name: string) => listeners.delete(name),
      }),
    },
    "@/lib/settings/client": { fetchLayoutSettings: () => ({}), settingsQueryKeys: { layout: [] } },
    "@/lib/store": {
      useAppStore: (selector: (state: unknown) => unknown) =>
        selector({
          desktopStreamerModeEnabled: options.streamerModeActive ?? false,
          desktopStreamerModeDetected: false,
        }),
    },
    "@/lib/voice/output-volume": { masterOutputGain: () => 1 },
    "@/store/voice-store": { useVoiceStore },
    "@/store/sound-store": {
      resolveSoundEffectPath: (effect: string) => effect,
      SOUND_PROFILE_PATHS: {},
      useSoundStore: (selector: (state: unknown) => unknown) =>
        selector({
          notificationVolume: 50,
          voiceJoinEnabled: options.voiceJoinEnabled ?? true,
          voiceLeaveEnabled: options.voiceLeaveEnabled ?? true,
          voiceJoinVolume: 50,
          voiceLeaveVolume: 50,
        }),
    },
  };
  const providerModule = { exports: {} as { SoundEffectsProvider: (props: unknown) => unknown } };
  runInNewContext(providerCode, {
    module: providerModule,
    exports: providerModule.exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected provider dependency: ${name}`);
      return modules[name];
    },
    window: { addEventListener() {}, removeEventListener() {} },
    Audio: class {
      constructor(readonly source: string) {}
      cloneNode() {
        return this;
      }
      play() {
        played.push(this.source);
        return Promise.resolve();
      }
    },
  });
  providerModule.exports.SoundEffectsProvider({ children: null, currentUserId: "self" });
  const cleanups = effects.map((effect) => effect());
  return {
    played,
    listeners,
    emit(
      action: string,
      userId = "other",
      channelId = "channel-1",
      participants = [{ userId: "self" }, { userId: "other" }],
    ) {
      listeners.get("voice:state:update")?.({ action, userId, channelId, participants });
    },
    unmount() {
      cleanups.forEach((cleanup) => cleanup?.());
    },
  };
}

test("voice metadata updates stay silent while real remote joins and leaves play", () => {
  const provider = mountProvider();
  assert.deepEqual(provider.played, [], "initial mount is silent");
  for (let tick = 0; tick < 12; tick += 1) provider.emit("update");
  assert.deepEqual(provider.played, [], "metadata updates are neither joins nor leaves");
  provider.emit("join");
  provider.emit("leave", "other", "channel-1", [{ userId: "self" }]);
  assert.deepEqual(provider.played, ["voiceJoin", "voiceLeave"]);
  provider.unmount();
  assert.equal(provider.listeners.size, 0);
});

test("voice sounds ignore self, other channels, absent listeners and unknown actions", () => {
  const provider = mountProvider();
  for (const action of ["join", "leave", "update"]) {
    provider.emit(action, "self");
    provider.emit(action, "other", "channel-2");
    provider.emit(action, "other", "channel-1", [{ userId: "other" }]);
  }
  provider.emit("unknown");
  assert.deepEqual(provider.played, []);
  provider.unmount();
});

test("voice sounds respect disabled preferences, streamer mode and disconnected state", () => {
  for (const options of [
    { voiceJoinEnabled: false, voiceLeaveEnabled: false },
    { streamerModeActive: true },
    { activeChannelId: null },
  ]) {
    const provider = mountProvider(options);
    provider.emit("join");
    provider.emit("leave");
    provider.emit("update");
    assert.deepEqual(provider.played, []);
    provider.unmount();
  }
});
