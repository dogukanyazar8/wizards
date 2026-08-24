"use client";

// The default import is what the node test runner's classic JSX transform resolves this
// provider's elements against; Next's compiler does not need it (`ui/avatar.tsx` carries the
// same note). Without it a component tree rendered under this provider cannot be
// server-rendered in a unit test.
import React, { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import {
  ACCOUNT_PREFERENCES_DEFAULT,
  formatAccountDate,
  formatAccountDateTime,
  formatAccountTime,
  getInterfaceDensityMetrics,
  type AccountPreferences,
  type InterfaceDensityMetrics,
} from "@wizards/types";

type RegionalPreferences = Pick<
  AccountPreferences,
  "dateFormat" | "interfaceDensity" | "timeFormat" | "timeZone"
>;

interface AccountPreferenceRuntime {
  readonly density: AccountPreferences["interfaceDensity"];
  readonly densityMetrics: InterfaceDensityMetrics;
  readonly formatDate: (input: Date | number | string) => string;
  readonly formatDateTime: (input: Date | number | string) => string;
  readonly formatTime: (input: Date | number | string) => string;
  readonly preferences: RegionalPreferences;
}

const DEFAULT_RUNTIME: AccountPreferenceRuntime = {
  density: ACCOUNT_PREFERENCES_DEFAULT.interfaceDensity,
  densityMetrics: getInterfaceDensityMetrics(ACCOUNT_PREFERENCES_DEFAULT.interfaceDensity),
  formatDate: (input) =>
    formatAccountDate(input, {
      dateFormat: ACCOUNT_PREFERENCES_DEFAULT.dateFormat,
      locale: "en-US",
      timeZone: ACCOUNT_PREFERENCES_DEFAULT.timeZone,
    }),
  formatDateTime: (input) =>
    formatAccountDateTime(input, {
      dateFormat: ACCOUNT_PREFERENCES_DEFAULT.dateFormat,
      locale: "en-US",
      timeFormat: ACCOUNT_PREFERENCES_DEFAULT.timeFormat,
      timeZone: ACCOUNT_PREFERENCES_DEFAULT.timeZone,
    }),
  formatTime: (input) =>
    formatAccountTime(input, {
      locale: "en-US",
      timeFormat: ACCOUNT_PREFERENCES_DEFAULT.timeFormat,
      timeZone: ACCOUNT_PREFERENCES_DEFAULT.timeZone,
    }),
  preferences: ACCOUNT_PREFERENCES_DEFAULT,
};

const AccountPreferenceContext = createContext<AccountPreferenceRuntime>(DEFAULT_RUNTIME);

export function AccountPreferenceProvider({
  children,
  locale,
  preferences,
}: PropsWithChildren<{
  readonly locale: string;
  readonly preferences: RegionalPreferences | null | undefined;
}>) {
  const value = useMemo<AccountPreferenceRuntime>(() => {
    const resolved = preferences ?? ACCOUNT_PREFERENCES_DEFAULT;
    const base = { locale, timeZone: resolved.timeZone } as const;
    return {
      density: resolved.interfaceDensity,
      densityMetrics: getInterfaceDensityMetrics(resolved.interfaceDensity),
      formatDate: (input) => formatAccountDate(input, { ...base, dateFormat: resolved.dateFormat }),
      formatDateTime: (input) =>
        formatAccountDateTime(input, {
          ...base,
          dateFormat: resolved.dateFormat,
          timeFormat: resolved.timeFormat,
        }),
      formatTime: (input) => formatAccountTime(input, { ...base, timeFormat: resolved.timeFormat }),
      preferences: resolved,
    };
  }, [locale, preferences]);

  return (
    <AccountPreferenceContext.Provider value={value}>{children}</AccountPreferenceContext.Provider>
  );
}

export function useAccountPreferenceRuntime(): AccountPreferenceRuntime {
  return useContext(AccountPreferenceContext);
}
