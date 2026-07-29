import React from "react";
import { StyleSheet } from "react-native";
import { describe, expect, it } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import {
  MobileRingingDots,
  MobileRingingHalo,
  getMobileRingingWaveScaleRange,
} from "../src/app/components/mobile-call-pulse";
import { darkTheme } from "../src/design/themes";

describe("mobile call pulses", () => {
  it("stops every ringing wave at the halo bound so nothing paints over the name", () => {
    // Regression: the waves used to scale to 1.9x their own box, which put the
    // outermost ring on top of the callee name beneath the card.
    expect(getMobileRingingWaveScaleRange(96, 168)).toEqual({ from: 96 / 168, to: 1 });
    expect(getMobileRingingWaveScaleRange(96, 0)).toEqual({ from: 1, to: 1 });
    expect(getMobileRingingWaveScaleRange(240, 168).from).toBe(1);
  });

  it("renders the ringing halo as bounded rings around the avatar", async () => {
    const view = await render(
      <MobileRingingHalo
        avatarRadius={34}
        avatarSize={96}
        color={darkTheme.voiceRoom.accent}
        diameter={168}
        testID="halo"
      />,
    );

    const ring = StyleSheet.flatten(view.getByTestId("halo").props.style);
    expect(ring).toMatchObject({
      borderColor: darkTheme.voiceRoom.accent,
      height: 168,
      width: 168,
    });
  });

  it("renders the chasing ringing dots", async () => {
    const view = await render(
      <MobileRingingDots color={darkTheme.voiceRoom.textSecondary} testID="dots" />,
    );

    expect(view.getByTestId("dots")).toBeTruthy();
  });
});
