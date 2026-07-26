import { Platform } from "react-native";
import { MobileFeedbackDiagnosticsSchema, type MobileFeedbackDiagnostics } from "@wizards/types";

import type { MobileLocale } from "../locale/mobile-copy";
import { getExpoDeviceModule } from "../media/expo-mobile-media-modules";
import { readMobileFaultLog } from "./mobile-fault-log";

export interface MobileFeedbackDiagnosticsInput {
  readonly appVersion: string;
  readonly locale: MobileLocale;
  readonly theme: "dark" | "light";
}

/**
 * Builds exactly the payload the "Neler gönderilir?" sheet lists — no more.
 * The sheet and this function are the contract: if one grows a field the other
 * has to, which is why both read the same key list.
 */
export function buildMobileFeedbackDiagnostics(
  input: MobileFeedbackDiagnosticsInput,
): MobileFeedbackDiagnostics {
  const device = getExpoDeviceModule();

  return MobileFeedbackDiagnosticsSchema.parse({
    appVersion: input.appVersion,
    deviceModel: device.modelName ?? null,
    locale: input.locale,
    osName: device.osName ?? Platform.OS,
    osVersion: device.osVersion ?? String(Platform.Version),
    recentFaults: readMobileFaultLog(),
    theme: input.theme,
  });
}
