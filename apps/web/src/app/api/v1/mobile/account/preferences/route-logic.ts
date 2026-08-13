import {
  AccountPreferencesPatchSchema,
  AccountPreferencesSchema,
  type AccountPreferences,
  type AccountPreferencesPatch,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import {
  normalizeTimeZonePreference,
  serializeTimeZonePreference,
} from "@/lib/settings/account-preferences";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

export type AccountPreferencesPersistence = Omit<AccountPreferences, "timeZone"> & {
  timeZone: string | null;
};

export type AccountPreferencesPersistencePatch = Partial<AccountPreferencesPersistence>;

export type MobileAccountPreferencesDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string): Promise<void>;
  loadPreferences(userId: string): Promise<AccountPreferencesPersistence | null>;
  onPresenceVisibilityChanged?(userId: string): Promise<void>;
  updatePreferences(
    userId: string,
    patch: AccountPreferencesPersistencePatch,
  ): Promise<AccountPreferencesPersistence>;
};

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}

function toResponse(record: AccountPreferencesPersistence): AccountPreferences {
  return AccountPreferencesSchema.parse({
    ...record,
    timeZone: serializeTimeZonePreference(record.timeZone),
  });
}

function toPersistencePatch(patch: AccountPreferencesPatch): AccountPreferencesPersistencePatch {
  return {
    ...(patch.dateFormat === undefined ? {} : { dateFormat: patch.dateFormat }),
    ...(patch.interfaceDensity === undefined ? {} : { interfaceDensity: patch.interfaceDensity }),
    ...(patch.presenceVisibility === undefined
      ? {}
      : { presenceVisibility: patch.presenceVisibility }),
    ...(patch.profileVisibility === undefined
      ? {}
      : { profileVisibility: patch.profileVisibility }),
    ...(patch.timeFormat === undefined ? {} : { timeFormat: patch.timeFormat }),
    ...(patch.timeZone === undefined
      ? {}
      : { timeZone: normalizeTimeZonePreference(patch.timeZone) }),
  };
}

export async function mobileAccountPreferencesGetRoute(
  request: Request,
  dependencies: MobileAccountPreferencesDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId);
    const record = await dependencies.loadPreferences(userId);
    if (!record) {
      throw new ApiError("Account preferences not found", 404, "NOT_FOUND");
    }
    return Response.json(toResponse(record), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}

export async function mobileAccountPreferencesPatchRoute(
  request: Request,
  dependencies: MobileAccountPreferencesDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId);
    const patch = await parseJsonBody(request, AccountPreferencesPatchSchema);
    const updated = await dependencies.updatePreferences(userId, toPersistencePatch(patch));
    if (patch.presenceVisibility !== undefined) {
      await dependencies.onPresenceVisibilityChanged?.(userId);
    }
    return Response.json(toResponse(updated), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}
