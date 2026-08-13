import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_PREFERENCES_DEFAULT,
  AccountPreferencesPatchSchema,
  AccountPreferencesSchema,
  InterfaceDensitySchema,
  PresenceVisibilitySchema,
  ProfileVisibilitySchema,
  TimeZonePreferenceSchema,
  UserDateFormatSchema,
  UserTimeFormatSchema,
} from "./account-preferences";

describe("account preference contracts", () => {
  it("defaults old accounts to the behavior they already have", () => {
    assert.deepEqual(AccountPreferencesSchema.parse({}), {
      dateFormat: "LOCALE",
      interfaceDensity: "COMFORTABLE",
      presenceVisibility: "EVERYONE",
      profileVisibility: "EVERYONE",
      timeFormat: "LOCALE",
      timeZone: "AUTO",
    });
    assert.deepEqual(ACCOUNT_PREFERENCES_DEFAULT, {
      dateFormat: "LOCALE",
      interfaceDensity: "COMFORTABLE",
      presenceVisibility: "EVERYONE",
      profileVisibility: "EVERYONE",
      timeFormat: "LOCALE",
      timeZone: "AUTO",
    });
  });

  it("accepts every approved enum member and rejects unapproved values", () => {
    assert.deepEqual(ProfileVisibilitySchema.options, ["EVERYONE", "FRIENDS", "NOBODY"]);
    assert.deepEqual(PresenceVisibilitySchema.options, ["EVERYONE", "FRIENDS", "NOBODY"]);
    assert.deepEqual(UserDateFormatSchema.options, ["LOCALE", "DMY", "MDY", "YMD"]);
    assert.deepEqual(UserTimeFormatSchema.options, ["LOCALE", "H12", "H24"]);
    assert.deepEqual(InterfaceDensitySchema.options, ["COMFORTABLE", "COMPACT"]);
    assert.equal(ProfileVisibilitySchema.safeParse("MUTUAL_SERVERS").success, false);
    assert.equal(InterfaceDensitySchema.safeParse("DENSE").success, false);
  });

  it("accepts automatic and bounded IANA timezone candidates", () => {
    assert.equal(TimeZonePreferenceSchema.parse("AUTO"), "AUTO");
    assert.equal(TimeZonePreferenceSchema.parse(" Europe/Istanbul "), "Europe/Istanbul");
    assert.equal(TimeZonePreferenceSchema.safeParse("").success, false);
    assert.equal(TimeZonePreferenceSchema.safeParse("x".repeat(65)).success, false);
  });

  it("requires a strict non-empty partial update", () => {
    assert.equal(AccountPreferencesPatchSchema.safeParse({}).success, false);
    assert.deepEqual(AccountPreferencesPatchSchema.parse({ profileVisibility: "FRIENDS" }), {
      profileVisibility: "FRIENDS",
    });
    assert.equal(
      AccountPreferencesPatchSchema.safeParse({ profileVisibility: "FRIENDS", unknown: true })
        .success,
      false,
    );
  });
});
