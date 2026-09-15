import type { MobileReleaseChannel } from "@wizards/types";

/** Normalize deployment names to the two channels shown to users. */
export function resolveWebReleaseChannel(value: string | undefined): MobileReleaseChannel {
  switch (value?.trim().toLowerCase()) {
    case "prod":
    case "production":
    case "stable":
      return "stable";
    case undefined:
    case "":
    case "development":
    case "dev":
    case "test":
    case "preview":
    case "uat":
    case "beta":
      return "beta";
    default:
      throw new Error("Unsupported release channel; expected stable/PROD or beta/UAT.");
  }
}
