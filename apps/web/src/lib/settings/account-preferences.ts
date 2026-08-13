import { ApiError } from "@/lib/api";

export function normalizeTimeZonePreference(value: string): string | null {
  if (value === "AUTO") {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new ApiError("Invalid time zone", 400, "INVALID_TIME_ZONE");
  }
}

export function serializeTimeZonePreference(value: string | null): "AUTO" | string {
  return value ?? "AUTO";
}
