import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { lightTheme } from "../src/design/themes";
import {
  Toggle,
  TOGGLE_THUMB_INSET,
  TOGGLE_THUMB_SIZE,
  TOGGLE_THUMB_TRAVEL,
  TOGGLE_TRACK_HEIGHT,
  TOGGLE_TRACK_WIDTH,
} from "../src/app/components/kit/toggle";

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string>;
}

/** Two independent switches, exactly how a settings card stacks them. */
function TogglePair() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);

  return (
    <>
      <Toggle
        accessibilityLabel="Birinci"
        onValueChange={setFirst}
        testID="toggle-first"
        thumbTestID="toggle-first-thumb"
        value={first}
      />
      <Toggle
        accessibilityLabel="İkinci"
        onValueChange={setSecond}
        testID="toggle-second"
        thumbTestID="toggle-second-thumb"
        value={second}
      />
    </>
  );
}

describe("kit toggle", () => {
  it('draws the §2 "1i".6 reference geometry', async () => {
    const view = await render(
      <Toggle
        accessibilityLabel="Sıkı yerleşim"
        onValueChange={jest.fn()}
        testID="toggle"
        thumbTestID="toggle-thumb"
        value={false}
      />,
    );

    const track = flatten(view.getByTestId("toggle").props.style);
    expect(track).toMatchObject({
      borderRadius: 14,
      height: TOGGLE_TRACK_HEIGHT,
      width: TOGGLE_TRACK_WIDTH,
    });
    expect(track.backgroundColor).toBe(lightTheme.control.trackOff);
    expect(flatten(view.getByTestId("toggle-thumb").props.style)).toMatchObject({
      height: TOGGLE_THUMB_SIZE,
      left: TOGGLE_THUMB_INSET,
      width: TOGGLE_THUMB_SIZE,
    });
  });

  it("leaves every other switch untouched when one is pressed", async () => {
    const view = await render(<TogglePair />);

    const before = {
      track: flatten(view.getByTestId("toggle-second").props.style),
      thumb: flatten(view.getByTestId("toggle-second-thumb").props.style),
    };

    await fireEvent.press(view.getByTestId("toggle-first"));

    // The pressed switch moves…
    expect(view.getByTestId("toggle-first").props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(flatten(view.getByTestId("toggle-first").props.style).backgroundColor).toBe(
      lightTheme.control.trackOn,
    );
    expect(flatten(view.getByTestId("toggle-first-thumb").props.style).left).toBe(
      TOGGLE_THUMB_INSET + TOGGLE_THUMB_TRAVEL,
    );
    // …and its neighbour keeps its colour, its knob and its state.
    expect(view.getByTestId("toggle-second").props.accessibilityState).toMatchObject({
      checked: false,
    });
    expect(flatten(view.getByTestId("toggle-second").props.style)).toEqual(before.track);
    expect(flatten(view.getByTestId("toggle-second-thumb").props.style)).toEqual(before.thumb);
  });

  it("draws an unavailable switch in its own tones, never as a faded ghost", async () => {
    const onValueChange = jest.fn();
    const view = await render(
      <>
        <Toggle
          accessibilityLabel="Kapalı, erişilemez"
          disabled
          onValueChange={onValueChange}
          testID="toggle-disabled-off"
          thumbTestID="toggle-disabled-off-thumb"
          value={false}
        />
        <Toggle
          accessibilityLabel="Açık, erişilemez"
          disabled
          onValueChange={onValueChange}
          testID="toggle-disabled-on"
          thumbTestID="toggle-disabled-on-thumb"
          value
        />
        <Toggle
          accessibilityLabel="Bekliyor"
          onValueChange={onValueChange}
          readOnly
          testID="toggle-busy"
          value
        />
      </>,
    );

    const off = flatten(view.getByTestId("toggle-disabled-off").props.style);
    const on = flatten(view.getByTestId("toggle-disabled-on").props.style);
    expect(off.backgroundColor).toBe(lightTheme.control.trackDisabled);
    expect(on.backgroundColor).toBe(lightTheme.control.trackDisabledOn);
    // Nothing on the control is faded: rows already dim their own label, and a
    // second layer of transparency is what made these read as broken.
    expect(off.opacity).toBeUndefined();
    expect(on.opacity).toBeUndefined();
    const thumb = flatten(view.getByTestId("toggle-disabled-on-thumb").props.style);
    expect(thumb.backgroundColor).toBe(lightTheme.control.trackThumbDisabled);
    expect(thumb.shadowOpacity).toBe(0);
    expect(thumb.elevation).toBe(0);

    // A busy switch keeps its live colours.
    const busy = flatten(view.getByTestId("toggle-busy").props.style);
    expect(busy.backgroundColor).toBe(lightTheme.control.trackOn);
    expect(busy.opacity).toBeUndefined();

    await fireEvent.press(view.getByTestId("toggle-disabled-off"));
    await fireEvent.press(view.getByTestId("toggle-busy"));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps the voice room's green on-state", async () => {
    const view = await render(
      <Toggle
        accessibilityLabel="Gürültü engelleme"
        onValueChange={jest.fn()}
        surface="voiceRoom"
        testID="toggle-success"
        tone="success"
        value
      />,
    );

    expect(flatten(view.getByTestId("toggle-success").props.style).backgroundColor).toBe(
      lightTheme.voiceRoom.success,
    );
  });
});
