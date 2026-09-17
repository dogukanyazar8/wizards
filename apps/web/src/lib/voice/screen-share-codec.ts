import type { ScreenShareMode } from "@wizards/types";

export type ScreenShareCodecChoice = {
  codec: "av1" | "vp9" | "h264";
  hardware: boolean | null;
  reason: "hardware" | "software" | "probe-unavailable";
};
export type ScreenShareEncodingProbe = (config: {
  type: "webrtc";
  video: {
    contentType: string;
    width: number;
    height: number;
    framerate: number;
    bitrate: number;
    scalabilityMode?: string;
  };
}) => Promise<{ supported: boolean; powerEfficient: boolean; smooth: boolean }>;

export async function resolveScreenShareCodec(
  input: {
    mode: ScreenShareMode;
    width: number;
    height: number;
    frameRate: number;
    bitrateKbps: number;
  },
  probe?: ScreenShareEncodingProbe,
): Promise<ScreenShareCodecChoice> {
  if (probe) {
    try {
      for (const codec of ["av1", "vp9", "h264"] as const) {
        const result = await probe({
          type: "webrtc",
          video: {
            contentType:
              codec === "h264"
                ? 'video/H264; codecs="avc1.42e01f"'
                : `video/${codec.toUpperCase()}`,
            width: input.width,
            height: input.height,
            framerate: input.frameRate,
            bitrate: input.bitrateKbps * 1000,
            ...(codec === "h264" ? {} : { scalabilityMode: "L3T3_KEY" }),
          },
        });
        if (result.supported && result.powerEfficient)
          return { codec, hardware: true, reason: "hardware" };
      }
      return {
        codec: input.mode === "motion" ? "h264" : "vp9",
        hardware: false,
        reason: "software",
      };
    } catch {
      /* Browsers may reject WebRTC encoding queries entirely. */
    }
  }
  return { codec: "vp9", hardware: null, reason: "probe-unavailable" };
}

export function browserScreenShareEncodingProbe(): ScreenShareEncodingProbe | undefined {
  const capabilities = typeof navigator === "undefined" ? undefined : navigator.mediaCapabilities;
  return capabilities?.encodingInfo
    ? (config) => capabilities.encodingInfo(config as MediaEncodingConfiguration)
    : undefined;
}

export function isScreenShare4kAllowed(
  enabled: boolean,
  screen: { width: number; height: number; dpr: number },
  hardware: boolean | null,
): boolean {
  return (
    enabled &&
    hardware === true &&
    (screen.width * screen.dpr >= 3840 || screen.height * screen.dpr >= 2160)
  );
}
