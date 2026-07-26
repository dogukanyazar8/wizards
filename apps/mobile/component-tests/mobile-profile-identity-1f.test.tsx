import { describe, expect, it } from "@jest/globals";

import { createSettingsScreenStyles } from "../src/app/screens/settings-screen.styles";
import { createMobileProfileStatusCardStyles } from "../src/social/mobile-profile-status-card.styles";
import { lightTheme } from "../src/design/themes";

/**
 * Geometry lifted from the 1f identity card in design_handoff_whispr_mobile: a 76px squircle
 * avatar framed by a 4px white border, an 18px presence dot hanging off the corner, and the
 * compact edit chip. The banner is no longer a 72px strip — it is the whole card, with the
 * identity and the edit chip riding its bottom edge.
 */
describe("1f profile identity card", () => {
  const styles = createSettingsScreenStyles(lightTheme);
  const statusStyles = createMobileProfileStatusCardStyles(lightTheme);

  it("keeps the avatar a framed squircle instead of a ringed circle", () => {
    expect(styles.mobileProfileIdentityBanner.flex).toBe(1);
    expect(styles.mobileProfileIdentityCard.height).toBe(
      lightTheme.layout.fixed.profileIdentityCardHeight,
    );
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

  it("keeps the edit chip compact and parks it in the banner's bottom-right corner", () => {
    expect(styles.mobileProfileEditAction.alignItems).toBe("flex-end");
    expect(styles.mobileProfileEditAction.justifyContent).toBe("flex-end");
    expect(styles.mobileProfileEditAction.minHeight).toBe(lightTheme.sizing.minTouchTarget);
    expect(styles.mobileProfileEditActionVisual.borderRadius).toBe(12);
    expect(styles.mobileProfileEditActionVisual.paddingHorizontal).toBe(12);
    expect(styles.mobileProfileEditActionVisual.paddingVertical).toBe(8);
    expect(styles.mobileProfileEditActionText.fontSize).toBe(12.5);
    // Bottom-right of the banner, opposite the identity block.
    expect(styles.mobileProfileIdentityOverlay.position).toBe("absolute");
    expect(styles.mobileProfileIdentityOverlay.bottom).toBe(0);
    expect(styles.mobileProfileIdentityOverlay.right).toBe(0);
    expect(styles.mobileProfileIdentityOverlay.alignItems).toBe("flex-end");
    expect(styles.mobileProfileIdentityOverlay.justifyContent).toBe("space-between");
  });

  // The photo is never washed over: only the name block and the edit chip carry the scrim.
  it("wears the image scrim per chip instead of darkening half the banner", () => {
    expect(styles.mobileProfileIdentityScrim).toBeUndefined();
    expect(styles.mobileProfileEditActionVisual.backgroundColor).toBe(
      lightTheme.surface.imageScrim,
    );
    expect(styles.mobileProfileEditActionVisual.borderColor).toBe(lightTheme.border.imageScrim);
    expect(styles.mobileProfileEditActionText.color).toBe(lightTheme.text.onInverse);
    expect(styles.mobileProfileDisplayName.color).toBe(lightTheme.text.onInverse);
    expect(styles.mobileProfileIdentityText.backgroundColor).toBe(lightTheme.surface.imageScrim);
    expect(styles.mobileProfileIdentityText.borderColor).toBe(lightTheme.border.imageScrim);
  });

  // The presence control moved out of the identity card into the status card below it, and
  // the auto-clear menu now shares the exact same row geometry.
  it("keeps the presence control on the compact 1f padding", () => {
    expect(styles.mobileProfileStatusRow).toBeUndefined();
    expect(statusStyles.controlRow.borderRadius).toBe(lightTheme.radii.control);
    expect(statusStyles.controlRow.paddingHorizontal).toBe(14);
    expect(statusStyles.controlRow.paddingVertical).toBe(10);
    expect(statusStyles.presenceDot.height).toBe(9);
    expect(statusStyles.controlLabel.fontSize).toBe(13.5);
  });
});
