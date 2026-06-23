import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getResponsiveLayoutMode,
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_MEDIA_QUERIES,
  RESPONSIVE_SHELL_SIZES,
  shouldUseInfoDrawer,
  shouldUseWorkspaceDrawer,
} from "./responsive";

describe("responsive layout contract", () => {
  it("maps mobile, tablet, and desktop widths to stable product modes", () => {
    assert.equal(getResponsiveLayoutMode(360), "mobile");
    assert.equal(getResponsiveLayoutMode(RESPONSIVE_BREAKPOINTS.mobileMax), "mobile");
    assert.equal(getResponsiveLayoutMode(RESPONSIVE_BREAKPOINTS.tablet), "tablet");
    assert.equal(getResponsiveLayoutMode(1024), "tablet");
    assert.equal(getResponsiveLayoutMode(RESPONSIVE_BREAKPOINTS.supportPanel), "desktop");
  });

  it("keeps media query and shell sizing contracts explicit", () => {
    assert.equal(RESPONSIVE_MEDIA_QUERIES.mobile, "(max-width: 767px)");
    assert.equal(RESPONSIVE_MEDIA_QUERIES.supportPanel, "(min-width: 1280px)");
    assert.equal(RESPONSIVE_SHELL_SIZES.mobileWorkspaceDrawerWidth, "min(100vw, 28rem)");
    assert.equal(RESPONSIVE_SHELL_SIZES.infoDrawerWidth, "min(100vw, 24rem)");
    assert.equal(RESPONSIVE_SHELL_SIZES.mobileActionSheetMaxHeight, "min(70dvh, 28rem)");
    assert.equal(RESPONSIVE_SHELL_SIZES.mobileOverlayInset, "0.75rem");
    assert.equal(
      RESPONSIVE_SHELL_SIZES.mobilePopupMaxHeight,
      "min(28rem, calc(100dvh - 1.5rem))",
    );
    assert.equal(
      RESPONSIVE_SHELL_SIZES.mobileComposerReserve,
      "max(7.5rem, calc(env(safe-area-inset-bottom) + 6.75rem))",
    );
  });

  it("keeps mobile navigation surfaces mutually purposeful by viewport", () => {
    assert.equal(shouldUseWorkspaceDrawer("mobile"), true);
    assert.equal(shouldUseWorkspaceDrawer("tablet"), false);
    assert.equal(shouldUseWorkspaceDrawer("desktop"), false);

    assert.equal(shouldUseInfoDrawer("mobile"), true);
    assert.equal(shouldUseInfoDrawer("tablet"), true);
    assert.equal(shouldUseInfoDrawer("desktop"), false);
  });
});
