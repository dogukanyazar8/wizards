import { afterEach, describe, expect, it } from "@jest/globals";

import {
  configureMobileAccountPreferenceRuntime,
  formatMobileAccountRuntimeTime,
  resetMobileAccountPreferenceRuntime,
} from "../src/account/mobile-account-preference-runtime";

afterEach(resetMobileAccountPreferenceRuntime);

describe("mobile account preference runtime", () => {
  it("formats the same instant with the selected zone and 24-hour preference", () => {
    configureMobileAccountPreferenceRuntime({
      locale: "en-US",
      preferences: {
        dateFormat: "DMY",
        interfaceDensity: "COMPACT",
        presenceVisibility: "EVERYONE",
        profileVisibility: "EVERYONE",
        timeFormat: "H24",
        timeZone: "America/New_York",
      },
      systemTimeZone: "Europe/Istanbul",
    });

    expect(formatMobileAccountRuntimeTime("2026-03-08T07:30:00.000Z")).toBe("03:30");
  });

  it("re-evaluates AUTO when the system zone changes", () => {
    const preferences = {
      dateFormat: "LOCALE" as const,
      interfaceDensity: "COMFORTABLE" as const,
      presenceVisibility: "EVERYONE" as const,
      profileVisibility: "EVERYONE" as const,
      timeFormat: "H24" as const,
      timeZone: "AUTO" as const,
    };
    configureMobileAccountPreferenceRuntime({
      locale: "en-US",
      preferences,
      systemTimeZone: "UTC",
    });
    expect(formatMobileAccountRuntimeTime("2026-08-13T17:05:00.000Z")).toBe("17:05");

    configureMobileAccountPreferenceRuntime({
      locale: "en-US",
      preferences,
      systemTimeZone: "Europe/Istanbul",
    });
    expect(formatMobileAccountRuntimeTime("2026-08-13T17:05:00.000Z")).toBe("20:05");
  });
});
