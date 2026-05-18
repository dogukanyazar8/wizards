export type VoiceAudioHealthMetric = {
  audioLevel?: number;
  packetsLost?: number;
  packetsSent?: number;
  roundTripTimeMs?: number;
  totalAudioEnergy?: number;
  totalSamplesDuration?: number;
};

export type VoiceAudioHealthStatsReport = {
  forEach: (callback: (report: unknown) => void) => void;
};

export type VoiceAudioHealthSender = {
  getStats?: () => Promise<VoiceAudioHealthStatsReport>;
};

function readNumber(report: Record<string, unknown>, key: string) {
  const value = report[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function assignNumber<Key extends keyof VoiceAudioHealthMetric>(
  metric: VoiceAudioHealthMetric,
  key: Key,
  value: number | undefined,
) {
  if (value !== undefined) {
    metric[key] = value;
  }
}

function isAudioRtpReport(report: Record<string, unknown>) {
  const kind = report.kind;
  const mediaType = report.mediaType;

  if (kind === "audio" || mediaType === "audio") {
    return true;
  }

  return kind === undefined && mediaType === undefined;
}

export function collectVoiceAudioHealthFromStats(
  stats: VoiceAudioHealthStatsReport,
): VoiceAudioHealthMetric | null {
  const metric: VoiceAudioHealthMetric = {};

  stats.forEach((rawReport) => {
    if (!rawReport || typeof rawReport !== "object") {
      return;
    }

    const report = rawReport as Record<string, unknown>;
    const reportType = report.type;

    if (reportType === "outbound-rtp" && isAudioRtpReport(report)) {
      assignNumber(metric, "packetsSent", readNumber(report, "packetsSent"));
      return;
    }

    if (reportType === "remote-inbound-rtp" && isAudioRtpReport(report)) {
      assignNumber(metric, "packetsLost", readNumber(report, "packetsLost"));
      const roundTripTimeSeconds = readNumber(report, "roundTripTime");
      assignNumber(
        metric,
        "roundTripTimeMs",
        roundTripTimeSeconds === undefined
          ? undefined
          : Math.round(roundTripTimeSeconds * 100_000) / 100,
      );
      return;
    }

    if (reportType === "media-source" || reportType === "audio-source") {
      assignNumber(metric, "audioLevel", readNumber(report, "audioLevel"));
      assignNumber(metric, "totalAudioEnergy", readNumber(report, "totalAudioEnergy"));
      assignNumber(metric, "totalSamplesDuration", readNumber(report, "totalSamplesDuration"));
    }
  });

  return Object.keys(metric).length > 0 ? metric : null;
}

export async function collectVoiceAudioHealthFromSender(
  sender: VoiceAudioHealthSender | null | undefined,
) {
  const stats = await sender?.getStats?.();
  return stats ? collectVoiceAudioHealthFromStats(stats) : null;
}
