import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMobileBottomSystemSpacing,
  resolveMobileBottomSystemTopUp,
} from "../src/app/mobile-bottom-system-inset";
import { mobileSpacing } from "../src/design/tokens";

/** What kit/bottom-sheet.tsx pads its panel with. */
const sheetPanelPadding = (systemInset: number) =>
  mobileSpacing.page + resolveMobileBottomSystemSpacing(systemInset, 0);

test("bottom system spacing preserves the design minimum when Android reports no bottom inset", () => {
  assert.equal(resolveMobileBottomSystemSpacing(0, 18), 18);
});

test("bottom system spacing raises interactive content above a larger Android navigation bar", () => {
  assert.equal(resolveMobileBottomSystemSpacing(24, 18), 24);
  assert.equal(resolveMobileBottomSystemSpacing(48, 18), 48);
});

test("bottom sheet content stays above three-button navigation and keeps design spacing in gesture mode", () => {
  // Gesture navigation reports no bottom bar, so the panel keeps its own spacing.
  assert.equal(sheetPanelPadding(0), mobileSpacing.page);
  // Gesture navigation with a home indicator adds only the indicator.
  assert.equal(sheetPanelPadding(24), mobileSpacing.page + 24);
  // Three-button navigation lifts the last control clear of the bar.
  assert.equal(sheetPanelPadding(48), mobileSpacing.page + 48);
  assert.ok(sheetPanelPadding(48) > sheetPanelPadding(0));
});

/** What kit/auth/auth-screen-background.tsx adds under its own design padding. */
const authScreenBottomPadding = (systemInset: number, keyboardHeight = 0) =>
  mobileSpacing.section +
  resolveMobileBottomSystemTopUp({
    keyboardHeight,
    minimumSpacing: mobileSpacing.section,
    systemInset,
  });

test("bottom system top-up leaves gesture navigation exactly as designed", () => {
  assert.equal(resolveMobileBottomSystemTopUp({ keyboardHeight: 0, minimumSpacing: 16, systemInset: 0 }), 0);
  assert.equal(resolveMobileBottomSystemTopUp({ keyboardHeight: 0, minimumSpacing: 16, systemInset: 16 }), 0);
  assert.equal(authScreenBottomPadding(0), mobileSpacing.section);
  assert.equal(authScreenBottomPadding(16), mobileSpacing.section);
});

test("bottom system top-up clears a three-button navigation bar without stacking spacing", () => {
  assert.equal(authScreenBottomPadding(48), 48);
  assert.equal(
    authScreenBottomPadding(48),
    resolveMobileBottomSystemSpacing(48, mobileSpacing.section),
  );
});

test("bottom system top-up hands the bottom edge to the keyboard instead of doubling it", () => {
  // The IME covers the navigation bar and the shell already lifts the tree above
  // the keyboard, so only the design spacing is left.
  assert.equal(authScreenBottomPadding(48, 312), mobileSpacing.section);
});

test("bottom system top-up fails closed for invalid runtime measurements", () => {
  assert.equal(
    resolveMobileBottomSystemTopUp({ keyboardHeight: Number.NaN, minimumSpacing: 16, systemInset: 48 }),
    32,
  );
  assert.equal(
    resolveMobileBottomSystemTopUp({ keyboardHeight: 0, minimumSpacing: Number.NaN, systemInset: 48 }),
    48,
  );
  assert.equal(
    resolveMobileBottomSystemTopUp({ keyboardHeight: 0, minimumSpacing: 16, systemInset: -48 }),
    0,
  );
});

test("bottom system spacing fails closed for invalid runtime measurements", () => {
  assert.equal(resolveMobileBottomSystemSpacing(Number.NaN, 18), 18);
  assert.equal(resolveMobileBottomSystemSpacing(-48, 18), 18);
  assert.equal(resolveMobileBottomSystemSpacing(48, Number.NaN), 48);
});
