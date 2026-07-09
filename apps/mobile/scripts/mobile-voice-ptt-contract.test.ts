import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  DEFAULT_MOBILE_VOICE_INPUT_MODE,
  MOBILE_PUSH_TO_TALK_HANGOVER_MS,
  createInitialMobilePushToTalkState,
  createMobilePushToTalkController,
  loadMobileVoiceInputModePreference,
  sanitizeMobileVoiceInputMode,
  saveMobileVoiceInputModePreference,
} from "../src/voice/mobile-voice-ptt-contract";

function createMemoryPreferenceStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    async getItemAsync() {
      return value;
    },
    async setItemAsync(_key: string, nextValue: string) {
      value = nextValue;
    },
  };
}

function createFakePushToTalkTimers() {
  let now = 1_000;
  let nextId = 1;
  const timers = new Map<
    number,
    {
      callback(): void | Promise<void>;
      cleared: boolean;
      delay: number;
    }
  >();

  return {
    clearCalls: [] as number[],
    clearTimeout(id: number) {
      this.clearCalls.push(id);
      const timer = timers.get(id);
      if (timer) {
        timer.cleared = true;
      }
    },
    getPendingDelays() {
      return [...timers.values()]
        .filter((timer) => !timer.cleared)
        .map((timer) => timer.delay);
    },
    now() {
      return now;
    },
    async runNext() {
      const entry = [...timers.entries()].find(([, timer]) => !timer.cleared);
      if (!entry) {
        return false;
      }

      const [id, timer] = entry;
      timer.cleared = true;
      now += timer.delay;
      await timer.callback();
      timers.delete(id);
      return true;
    },
    async runTimer(id: number) {
      const timer = timers.get(id);
      if (!timer || timer.cleared) {
        return false;
      }

      timer.cleared = true;
      now += timer.delay;
      await timer.callback();
      timers.delete(id);
      return true;
    },
    setTimeout(callback: () => void | Promise<void>, delay: number) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, cleared: false, delay });
      return id;
    },
  };
}

describe("mobile voice push-to-talk contract", () => {
  it("keeps push-to-talk opt-in and persists only normalized input modes", async () => {
    assert.equal(DEFAULT_MOBILE_VOICE_INPUT_MODE, "voice-activity");
    assert.equal(sanitizeMobileVoiceInputMode("push-to-talk"), "push-to-talk");
    assert.equal(sanitizeMobileVoiceInputMode("voice-activity"), "voice-activity");
    assert.equal(sanitizeMobileVoiceInputMode("unexpected"), "voice-activity");

    const storage = createMemoryPreferenceStorage("push-to-talk");
    assert.equal(await loadMobileVoiceInputModePreference(storage), "push-to-talk");
    assert.equal(await saveMobileVoiceInputModePreference(storage, "unexpected"), "voice-activity");
    assert.equal(await loadMobileVoiceInputModePreference(storage), "voice-activity");
  });

  it("opens the microphone while held and closes it after the web-matched hangover", async () => {
    assert.equal(MOBILE_PUSH_TO_TALK_HANGOVER_MS, 200);

    const timers = createFakePushToTalkTimers();
    const microphoneCalls: boolean[] = [];
    const controller = createMobilePushToTalkController({
      setMicrophoneEnabled: async (enabled) => {
        microphoneCalls.push(enabled);
      },
      timers,
    });

    assert.deepEqual(controller.getState(), createInitialMobilePushToTalkState());

    await controller.begin({ isMicrophoneEnabled: false });
    assert.deepEqual(microphoneCalls, [true]);
    assert.equal(controller.getState().phase, "holding");
    assert.equal(controller.getState().restoreMuted, true);
    assert.equal(controller.getState().startedAt, 1_000);

    controller.end();
    assert.equal(controller.getState().phase, "release-cushion");
    assert.deepEqual(timers.getPendingDelays(), [MOBILE_PUSH_TO_TALK_HANGOVER_MS]);
    assert.deepEqual(microphoneCalls, [true]);

    assert.equal(await timers.runNext(), true);
    assert.deepEqual(microphoneCalls, [true, false]);
    assert.deepEqual(controller.getState(), createInitialMobilePushToTalkState());
  });

  it("clears a pending release-cushion timer when push-to-talk is pressed again", async () => {
    const timers = createFakePushToTalkTimers();
    const microphoneCalls: boolean[] = [];
    const controller = createMobilePushToTalkController({
      setMicrophoneEnabled: async (enabled) => {
        microphoneCalls.push(enabled);
      },
      timers,
    });

    await controller.begin({ isMicrophoneEnabled: false });
    controller.end();
    await controller.begin({ isMicrophoneEnabled: true });

    assert.equal(timers.clearCalls.length, 1);
    assert.equal(controller.getState().phase, "holding");
    assert.equal(controller.getState().restoreMuted, false);
    assert.deepEqual(microphoneCalls, [true, true]);
    assert.deepEqual(timers.getPendingDelays(), []);
  });

  it("closes the microphone and clears timers when leaving while push-to-talk is active", async () => {
    const timers = createFakePushToTalkTimers();
    const microphoneCalls: boolean[] = [];
    const controller = createMobilePushToTalkController({
      setMicrophoneEnabled: async (enabled) => {
        microphoneCalls.push(enabled);
      },
      timers,
    });

    await controller.begin({ isMicrophoneEnabled: false });
    await controller.cancel({ closeMicrophone: true });

    assert.deepEqual(microphoneCalls, [true, false]);
    assert.deepEqual(controller.getState(), createInitialMobilePushToTalkState());

    await controller.begin({ isMicrophoneEnabled: false });
    controller.end();
    await controller.cancel({ closeMicrophone: true });

    assert.equal(timers.clearCalls.length, 1);
    assert.deepEqual(microphoneCalls, [true, false, true, false]);
    assert.equal(await timers.runNext(), false);
  });

  it("keeps the mobile LiveKit hook wired to the push-to-talk controller", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(hookSource, /createMobilePushToTalkController/);
    assert.match(hookSource, /beginPushToTalk/);
    assert.match(hookSource, /endPushToTalk/);
    assert.match(hookSource, /voiceInputMode === "push-to-talk"/);
    assert.match(hookSource, /cancel\(\{ closeMicrophone: true \}\)/);
  });

  it("stores the non-sensitive input mode preference outside SecureStore", () => {
    const preferenceSource = readFileSync(
      resolve(__dirname, "../src/voice/expo-mobile-voice-preferences.ts"),
      "utf8",
    );

    assert.doesNotMatch(preferenceSource, /expo-secure-store|SecureStore/);
    assert.match(preferenceSource, /@react-native-async-storage\/async-storage/);
    assert.match(preferenceSource, /AsyncStorage\.getItem/);
    assert.match(preferenceSource, /AsyncStorage\.setItem/);
  });
});
