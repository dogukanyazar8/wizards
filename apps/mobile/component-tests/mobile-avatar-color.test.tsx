import { describe, expect, it } from "@jest/globals";
import { StyleSheet } from "react-native";
import { getMobileAvatarInitials, getMobileAvatarTint } from "../src/design/mobile-avatar-color";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";
import { Avatar } from "../src/app/components/kit/avatar";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

describe("mobile avatar tint derivation", () => {
  it("renders the handoff tint for a fallback identity", async () => {
    const view = await render(<Avatar identityId="user-123" imageUrl={null} label="CodeX" />);

    const initials = view.getByText("CO");
    expect(StyleSheet.flatten(initials.parent?.props.style)).toMatchObject({
      backgroundColor: lightTheme.avatarTints[4].bg,
    });
    expect(StyleSheet.flatten(initials.props.style)).toMatchObject({
      color: lightTheme.avatarTints[4].fg,
    });
  });

  it("keeps the documented UTF-16 hash indexes stable", () => {
    expect(getMobileAvatarTint("user-123", lightTheme)).toBe(lightTheme.avatarTints[4]);
    expect(getMobileAvatarTint("user-123", darkTheme)).toBe(darkTheme.avatarTints[4]);
    expect(getMobileAvatarTint("user-456", lightTheme)).toBe(lightTheme.avatarTints[3]);
    expect(getMobileAvatarTint("user-456", darkTheme)).toBe(darkTheme.avatarTints[3]);
    expect(getMobileAvatarTint("👩‍🚀", lightTheme)).toBe(lightTheme.avatarTints[2]);
  });

  it("uses the same stable tint slot for every identity in every theme", () => {
    const identityIds = Array.from({ length: 100 }, (_, index) => `avatar-contract-${index}`);

    expect(darkTheme.avatarTints).toHaveLength(lightTheme.avatarTints.length);

    const coveredSlots = new Set<number>();
    for (const id of identityIds) {
      const lightSlot = lightTheme.avatarTints.indexOf(getMobileAvatarTint(id, lightTheme));
      const darkSlot = darkTheme.avatarTints.indexOf(getMobileAvatarTint(id, darkTheme));

      expect(lightSlot).toBeGreaterThanOrEqual(0);
      expect(darkSlot).toBe(lightSlot);
      coveredSlots.add(lightSlot);
    }

    expect(coveredSlots.size).toBe(lightTheme.avatarTints.length);
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
      "Mobile avatar theme must define exactly 5 stable avatar tints.",
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
