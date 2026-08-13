export async function disposeMobileVoiceRecording(input: {
  readonly deleteFile: (uri: string) => void | Promise<void>;
  readonly getUri: () => string | null;
  readonly isRecording: () => boolean;
  readonly restorePlayback: () => Promise<void>;
  readonly settleStart: () => Promise<void>;
  readonly stop: () => Promise<void>;
}): Promise<boolean> {
  await input.settleStart();
  if (!input.isRecording()) {
    return false;
  }

  try {
    await input.stop();
    const uri = input.getUri();
    if (uri) {
      await input.deleteFile(uri);
    }
  } catch {
    // Native teardown may race the host screen. Playback still must reclaim
    // the audio session even when the recorder or cache file is already gone.
  } finally {
    await input.restorePlayback();
  }

  return true;
}
