import { z } from "zod";

export const ProfileVisibilitySchema = z.enum(["EVERYONE", "FRIENDS", "NOBODY"]);
export const PresenceVisibilitySchema = z.enum(["EVERYONE", "FRIENDS", "NOBODY"]);
export const UserDateFormatSchema = z.enum(["LOCALE", "DMY", "MDY", "YMD"]);
export const UserTimeFormatSchema = z.enum(["LOCALE", "H12", "H24"]);
export const InterfaceDensitySchema = z.enum(["COMFORTABLE", "COMPACT"]);

export const TimeZonePreferenceSchema = z.union([
  z.literal("AUTO"),
  z.string().trim().min(1).max(64),
]);

export const AccountPreferencesSchema = z
  .object({
    dateFormat: UserDateFormatSchema.default("LOCALE"),
    interfaceDensity: InterfaceDensitySchema.default("COMFORTABLE"),
    presenceVisibility: PresenceVisibilitySchema.default("EVERYONE"),
    profileVisibility: ProfileVisibilitySchema.default("EVERYONE"),
    timeFormat: UserTimeFormatSchema.default("LOCALE"),
    timeZone: TimeZonePreferenceSchema.default("AUTO"),
  })
  .strict();

export const ACCOUNT_PREFERENCES_DEFAULT = Object.freeze(AccountPreferencesSchema.parse({}));

export const AccountPreferencesPatchSchema = z
  .object({
    dateFormat: UserDateFormatSchema.optional(),
    interfaceDensity: InterfaceDensitySchema.optional(),
    presenceVisibility: PresenceVisibilitySchema.optional(),
    profileVisibility: ProfileVisibilitySchema.optional(),
    timeFormat: UserTimeFormatSchema.optional(),
    timeZone: TimeZonePreferenceSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one account preference field is required",
  });

export type AccountPreferences = z.infer<typeof AccountPreferencesSchema>;
export type AccountPreferencesPatch = z.infer<typeof AccountPreferencesPatchSchema>;
export type InterfaceDensity = z.infer<typeof InterfaceDensitySchema>;
export type PresenceVisibility = z.infer<typeof PresenceVisibilitySchema>;
export type ProfileVisibility = z.infer<typeof ProfileVisibilitySchema>;
export type TimeZonePreference = z.infer<typeof TimeZonePreferenceSchema>;
export type UserDateFormat = z.infer<typeof UserDateFormatSchema>;
export type UserTimeFormat = z.infer<typeof UserTimeFormatSchema>;
