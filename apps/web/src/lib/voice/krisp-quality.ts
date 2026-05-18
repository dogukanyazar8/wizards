import type { KrispProcessorQuality } from "@/lib/voice/noise-filter";

type NavigatorWithDeviceMemory = Navigator & {
  deviceMemory?: number;
};

function getNavigator(): NavigatorWithDeviceMemory | null {
  return typeof navigator === "undefined" ? null : (navigator as NavigatorWithDeviceMemory);
}

export function getPreferredKrispQuality(): KrispProcessorQuality {
  const runtimeNavigator = getNavigator();
  if (!runtimeNavigator) {
    return "high";
  }

  const cores = runtimeNavigator.hardwareConcurrency ?? 4;
  const memory = runtimeNavigator.deviceMemory ?? 4;
  const isTouchDevice = (runtimeNavigator.maxTouchPoints ?? 0) > 0;

  if (cores <= 2 || memory < 2) {
    return "low";
  }

  if (isTouchDevice && (cores < 6 || memory < 4)) {
    return "medium";
  }

  if (cores < 4 || memory < 4) {
    return "medium";
  }

  return "high";
}

export function getFallbackKrispQuality(
  quality: KrispProcessorQuality,
): KrispProcessorQuality | null {
  switch (quality) {
    case "high":
      return "medium";
    case "medium":
      return "low";
    case "low":
      return null;
  }
}

export function shouldPrewarmKrispProcessor() {
  const runtimeNavigator = getNavigator();
  if (!runtimeNavigator) {
    return true;
  }

  return getPreferredKrispQuality() !== "low" && (runtimeNavigator.maxTouchPoints ?? 0) === 0;
}
