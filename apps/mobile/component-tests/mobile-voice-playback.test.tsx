import React, { type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

type AudioStatusStub = {
  currentTime: number;
  didJustFinish: boolean;
  duration: number;
  isLoaded: boolean;
  playing: boolean;
};

type AudioPlayerStub = {
  readonly id: string;
  readonly pause: jest.Mock;
  readonly play: jest.Mock;
  readonly seekTo: jest.Mock;
};

// `mock`-prefixed so the jest.mock factory may close over them: babel hoists the
// factory above every other binding in the file.
const mockAudioModeCalls: unknown[] = [];
const mockPlayers = new Map<string, AudioPlayerStub>();
const mockStatuses = new Map<string, AudioStatusStub>();

// The shared setup mock returns a throwaway player; this suite needs one player
// per source so two bubbles can be told apart, and a status it can drive.
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(async (mode: unknown) => {
    mockAudioModeCalls.push(mode);
  }),
  useAudioPlayer: (source: { uri: string } | null) => mockPlayers.get(source?.uri ?? "none"),
  useAudioPlayerStatus: (player: AudioPlayerStub) => mockStatuses.get(player.id),
}));

import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MessageVoiceAttachment } from "../src/app/components/message-voice-attachment";

function ProviderWrapper({ children }: PropsWithChildren) {
  return (
    <MobileThemeProvider>
      <MobileLocaleProvider>{children}</MobileLocaleProvider>
    </MobileThemeProvider>
  );
}

/** Providers survive `rerender`, which is how a status change is delivered. */
function renderVoice(ui: React.ReactElement) {
  return render(ui, { wrapper: ProviderWrapper });
}

function seedPlayer(url: string, status: Partial<AudioStatusStub> = {}): AudioPlayerStub {
  const player: AudioPlayerStub = {
    id: url,
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(),
  };
  mockPlayers.set(url, player);
  mockStatuses.set(url, {
    currentTime: 0,
    didJustFinish: false,
    duration: 12,
    isLoaded: true,
    playing: false,
    ...status,
  });

  return player;
}

function setStatus(url: string, status: Partial<AudioStatusStub>): void {
  const current = mockStatuses.get(url);
  if (!current) {
    throw new Error(`no status seeded for ${url}`);
  }
  mockStatuses.set(url, { ...current, ...status });
}

function voiceAttachment(id: string, url: string) {
  return { contentType: "audio/mp4", duration: 12, id, url };
}

describe("voice message playback", () => {
  beforeEach(() => {
    mockAudioModeCalls.length = 0;
    mockPlayers.clear();
    mockStatuses.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("arms a silent-mode-proof playback session before it starts a player", async () => {
    const url = "https://cdn.example.com/one.m4a";
    const player = seedPlayer(url);
    const view = await renderVoice(
      <MessageVoiceAttachment attachment={voiceAttachment("a-1", url)} />,
    );

    await fireEvent.press(view.getByTestId("mobile-message-voice-toggle-a-1"));

    expect(mockAudioModeCalls).toEqual([
      {
        allowsRecording: false,
        interruptionMode: "duckOthers",
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      },
    ]);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("replays the intent once a source that was still loading reports itself ready", async () => {
    const url = "https://cdn.example.com/two.m4a";
    const player = seedPlayer(url, { isLoaded: false });
    const view = await renderVoice(
      <MessageVoiceAttachment attachment={voiceAttachment("a-2", url)} />,
    );

    await fireEvent.press(view.getByTestId("mobile-message-voice-toggle-a-2"));
    expect(player.play).not.toHaveBeenCalled();

    setStatus(url, { isLoaded: true });
    await view.rerender(<MessageVoiceAttachment attachment={voiceAttachment("a-2", url)} />);

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("cancels an older pending source when a second loading note is selected", async () => {
    const firstUrl = "https://cdn.example.com/pending-one.m4a";
    const secondUrl = "https://cdn.example.com/pending-two.m4a";
    const first = seedPlayer(firstUrl, { isLoaded: false });
    const second = seedPlayer(secondUrl, { isLoaded: false });
    const view = await renderVoice(
      <>
        <MessageVoiceAttachment attachment={voiceAttachment("pending-1", firstUrl)} />
        <MessageVoiceAttachment attachment={voiceAttachment("pending-2", secondUrl)} />
      </>,
    );

    await fireEvent.press(view.getByTestId("mobile-message-voice-toggle-pending-1"));
    await fireEvent.press(view.getByTestId("mobile-message-voice-toggle-pending-2"));
    expect(first.play).not.toHaveBeenCalled();
    expect(second.play).not.toHaveBeenCalled();

    setStatus(firstUrl, { isLoaded: true });
    await view.rerender(
      <>
        <MessageVoiceAttachment attachment={voiceAttachment("pending-1", firstUrl)} />
        <MessageVoiceAttachment attachment={voiceAttachment("pending-2", secondUrl)} />
      </>,
    );
    expect(first.play).not.toHaveBeenCalled();

    setStatus(secondUrl, { isLoaded: true });
    await view.rerender(
      <>
        <MessageVoiceAttachment attachment={voiceAttachment("pending-1", firstUrl)} />
        <MessageVoiceAttachment attachment={voiceAttachment("pending-2", secondUrl)} />
      </>,
    );
    expect(second.play).toHaveBeenCalledTimes(1);
  });

  it("pauses the note that was playing when another one is started", async () => {
    const firstUrl = "https://cdn.example.com/three.m4a";
    const secondUrl = "https://cdn.example.com/four.m4a";
    const first = seedPlayer(firstUrl);
    const second = seedPlayer(secondUrl);
    const view = await renderVoice(
      <>
        <MessageVoiceAttachment attachment={voiceAttachment("a-3", firstUrl)} />
        <MessageVoiceAttachment attachment={voiceAttachment("a-4", secondUrl)} />
      </>,
    );

    await fireEvent.press(view.getByTestId("mobile-message-voice-toggle-a-3"));
    await fireEvent.press(view.getByTestId("mobile-message-voice-toggle-a-4"));

    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(second.play).toHaveBeenCalledTimes(1);
  });

  it("stops a finished note before rewinding it, so it cannot restart itself", async () => {
    const url = "https://cdn.example.com/five.m4a";
    const player = seedPlayer(url);
    const view = await renderVoice(
      <MessageVoiceAttachment attachment={voiceAttachment("a-5", url)} />,
    );

    setStatus(url, { currentTime: 12, didJustFinish: true });
    await view.rerender(<MessageVoiceAttachment attachment={voiceAttachment("a-5", url)} />);

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).not.toHaveBeenCalled();
    // ExoPlayer holds `playWhenReady` through the end of a track: seeking a
    // finished note without pausing first is what made it loop.
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.pause.mock.invocationCallOrder[0]).toBeLessThan(
      player.seekTo.mock.invocationCallOrder[0] as number,
    );
  });
});
