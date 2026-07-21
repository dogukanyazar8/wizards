import { describe, expect, it } from "@jest/globals";

import { createSettingsScreenStyles } from "../src/app/screens/settings-screen.styles";
import { lightTheme } from "../src/design/themes";

/**
 * Geometry lifted from the 1f identity card in design_handoff_whispr_mobile: a 72px banner,
 * a 76px squircle avatar framed by a 4px white border, an 18px presence dot hanging off the
 * corner, and the compact edit chip / status control that sit under it.
 */
describe("1f profile identity card", () => {
  const styles = createSettingsScreenStyles(lightTheme);

  it("keeps the avatar a framed squircle instead of a ringed circle", () => {
    expect(styles.mobileProfileIdentityBanner.height).toBe(72);
    expect(styles.mobileProfileAvatarRing.height).toBe(76);
    expect(styles.mobileProfileAvatarRing.width).toBe(76);
    expect(styles.mobileProfileAvatarRing.borderRadius).toBe(26);
    expect(styles.mobileProfileAvatarRing.borderWidth).toBe(4);
    expect(styles.mobileProfileAvatarRing.borderColor).toBe(lightTheme.surface.card);
    expect(lightTheme.layout.fixed.profileIdentityAvatarInner).toBe(68);
    expect(lightTheme.layout.fixed.profileIdentityAvatarInnerRadius).toBe(22);
    expect(lightTheme.layout.fixed.profileIdentityAvatarOverlap).toBe(-34);
  });

  it("hangs an 18px presence dot off the framed avatar corner", () => {
    expect(styles.mobileProfileAvatarPresence.height).toBe(18);
    expect(styles.mobileProfileAvatarPresence.width).toBe(18);
    expect(styles.mobileProfileAvatarPresence.borderWidth).toBe(3);
    expect(styles.mobileProfileAvatarPresence.bottom).toBe(-2);
    expect(styles.mobileProfileAvatarPresence.right).toBe(-2);
  });

  it("keeps the edit chip compact and bottom-aligned with the avatar", () => {
    expect(styles.mobileProfileEditAction.alignItems).toBe("flex-end");
    expect(styles.mobileProfileEditAction.justifyContent).toBe("flex-end");
    expect(styles.mobileProfileEditAction.minHeight).toBe(lightTheme.sizing.minTouchTarget);
    expect(styles.mobileProfileEditActionVisual.borderRadius).toBe(12);
    expect(styles.mobileProfileEditActionVisual.paddingHorizontal).toBe(12);
    expect(styles.mobileProfileEditActionVisual.paddingVertical).toBe(8);
    expect(styles.mobileProfileEditActionText.fontSize).toBe(12.5);
  });

  it("keeps the presence control on the compact 1f padding", () => {
    expect(styles.mobileProfileStatusRow.borderRadius).toBe(lightTheme.radii.control);
    expect(styles.mobileProfileStatusRow.paddingHorizontal).toBe(14);
    expect(styles.mobileProfileStatusRow.paddingVertical).toBe(10);
    expect(styles.mobileProfileStatusDot.height).toBe(9);
    expect(styles.mobileProfileStatusText.fontSize).toBe(13.5);
  });
});
