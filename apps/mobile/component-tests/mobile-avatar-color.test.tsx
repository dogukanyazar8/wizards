import { describe, expect, it } from "@jest/globals";
import { getMobileAvatarInitials, getMobileAvatarTint } from "../src/design/mobile-avatar-color";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

describe("mobile avatar tint derivation", () => {
  it("keeps the documented UTF-16 hash indexes stable", () => {
    expect(getMobileAvatarTint("user-123", lightTheme)).toBe(lightTheme.avatarTints[4]);
    expect(getMobileAvatarTint("user-123", darkTheme)).toBe(darkTheme.avatarTints[0]);
    expect(getMobileAvatarTint("user-456", lightTheme)).toBe(lightTheme.avatarTints[3]);
    expect(getMobileAvatarTint("user-456", darkTheme)).toBe(darkTheme.avatarTints[1]);
    expect(getMobileAvatarTint("👩‍🚀", lightTheme)).toBe(lightTheme.avatarTints[2]);
  });

  it("applies unsigned rollover during every UTF-16 hash step", () => {
    expect(getMobileAvatarTint("stable-avatar-id", lightTheme)).toBe(lightTheme.avatarTints[4]);
  });

  it("does not normalize opaque identity IDs before hashing", () => {
    expect(getMobileAvatarTint("é", lightTheme)).toBe(lightTheme.avatarTints[3]);
    expect(getMobileAvatarTint("e\u0301", lightTheme)).toBe(lightTheme.avatarTints[0]);
    expect(getMobileAvatarTint("user-123 ", lightTheme)).toBe(lightTheme.avatarTints[2]);
  });

  it("returns the same theme-owned tint object for repeated calls", () => {
    const lightTint = getMobileAvatarTint("user-123", lightTheme);
    const darkTint = getMobileAvatarTint("user-123", darkTheme);

    expect(getMobileAvatarTint("user-123", lightTheme)).toBe(lightTint);
    expect(lightTheme.avatarTints).toContain(lightTint);
    expect(darkTheme.avatarTints).toContain(darkTint);
  });

  it.each(["", " \t\n"])("rejects an empty identity ID", (id) => {
    expect(() => getMobileAvatarTint(id, lightTheme)).toThrow(
      "Mobile avatar tint requires a non-empty identity ID.",
    );
  });

  it("fails safely when a cast theme violates the non-empty tint invariant", () => {
    const sensitiveId = "tenant-secret-user-42";
    const invalidTheme = {
      ...lightTheme,
      avatarTints: [],
    } as unknown as MobileTheme;

    let thrown: unknown;
    try {
      getMobileAvatarTint(sensitiveId, invalidTheme);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Mobile avatar theme must define at least one avatar tint.",
    );
    expect((thrown as Error).message).not.toContain(sensitiveId);
  });
});

describe("mobile avatar initials", () => {
  it("supports the canonical Turkish and English examples", () => {
    expect(getMobileAvatarInitials("UAT ENV", "tr")).toBe("UA");
    expect(getMobileAvatarInitials("dogukan", "en")).toBe("DO");
    expect(getMobileAvatarInitials("irem", "tr")).toBe("İR");
    expect(getMobileAvatarInitials("irem", "en")).toBe("IR");
  });

  it("collapses whitespace and uses at most the first two words", () => {
    expect(getMobileAvatarInitials("  Ada   Lovelace  ", "en")).toBe("AL");
    expect(getMobileAvatarInitials("Ada Lovelace Byron", "en")).toBe("AL");
    expect(getMobileAvatarInitials("", "tr")).toBe("?");
    expect(getMobileAvatarInitials(" \t\n", "en")).toBe("?");
  });

  it("reads Unicode code points without splitting surrogate pairs", () => {
    expect(getMobileAvatarInitials("😀 Ada", "en")).toBe("😀A");
    expect(getMobileAvatarInitials("Ada 😀", "en")).toBe("A😀");
  });

  it("normalizes display names to NFC before deriving initials", () => {
    expect(getMobileAvatarInitials("e\u0301lodie Durand", "en")).toBe("ÉD");
    expect(getMobileAvatarInitials("élodie Durand", "en")).toBe("ÉD");
    expect(getMobileAvatarInitials("e\u0301lodie Durand", "en")).toBe(
      getMobileAvatarInitials("élodie Durand", "en"),
    );
  });
});
