import React from "react";
import { describe, expect, it } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import {
  MobileRingingPulse,
  MobileSpeakingPulse,
  normalizeMobileVoiceLevel,
} from "../src/app/components/mobile-call-pulse";
import { darkTheme } from "../src/design/themes";

describe("mobile call pulses", () => {
  it("clamps speaking levels into the 0-1 range the animation expects", () => {
    expect(normalizeMobileVoiceLevel(0.42)).toBeCloseTo(0.42);
    expect(normalizeMobileVoiceLevel(-3)).toBe(0);
    expect(normalizeMobileVoiceLevel(12)).toBe(1);
    expect(normalizeMobileVoiceLevel(Number.NaN)).toBe(0);
  });

  it("renders the ringing wave as three expanding rings", async () => {
    const view = await render(
      <MobileRingingPulse
        borderRadius={52}
        color={darkTheme.accent.default}
        size={168}
        testID="pulse"
      />,
    );

    expect(view.getByTestId("pulse")).toBeTruthy();
    expect(view.getByTestId("pulse").props.style).toMatchObject({
      borderColor: darkTheme.accent.default,
      borderRadius: 52,
      height: 168,
      width: 168,
    });
  });

  it("keeps the speaking halo mounted so level changes animate instead of popping", async () => {
    const view = await render(
      <MobileSpeakingPulse
        borderRadius={52}
        color={darkTheme.accent.default}
        isSpeaking={false}
        level={0}
        size={152}
        testID="speaking"
      />,
    );

    expect(view.getByTestId("speaking")).toBeTruthy();
  });
});
