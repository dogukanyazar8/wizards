import type { MobileReleaseChannel } from "@wizards/types";

/** Publication needs an explicit deployment channel; never infer PROD from an unknown value. */
export function parsePublishedReleaseChannel(value: string | undefined): "STABLE" | "UAT" | null {
  switch (value?.trim().toLowerCase()) {
    case "uat":
    case "beta":
      return "UAT";
    case "prod":
    case "production":
    case "stable":
      return "STABLE";
    default:
      return null;
  }
}

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
