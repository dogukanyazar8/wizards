import { Pressable, View } from "react-native";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";
import { useThemedStyles, useVoiceRoomThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export interface ToggleProps {
  readonly accessibilityLabel: string;
  /** Permanently unavailable: dimmed and non-interactive. */
  readonly disabled?: boolean;
  readonly onValueChange: (next: boolean) => void;
  /**
   * Non-interactive but shown at full colour (reflects real state, no dimming).
   * Use this — not `disabled` — while a request is in flight, so one pending
   * switch never dims the switches next to it.
   */
  readonly readOnly?: boolean;
  /** Which theme the switch reads its colours from. */
  readonly surface?: "app" | "voiceRoom";
  readonly testID?: string;
  /** Rendered on the thumb so callers can assert knob position. */
  readonly thumbTestID?: string;
  /** `success` keeps the voice room's green "on" state. */
  readonly tone?: "accent" | "success";
  readonly value: boolean;
}

/**
 * §2 "1i".6 geometry — the appearance screen's "sıkı yerleşim" toggle is the
 * reference every switch in the app matches: 46×28 r14 track, 2px inset, 24px
 * thumb, so the knob parks 18px along.
 *
 * The knob is placed straight from `value` rather than driven by an animation:
 * a switch's look then depends on nothing but its own prop, so re-renders,
 * list recycling and theme swaps can never move one switch when a neighbour is
 * pressed.
 */
export const TOGGLE_TRACK_WIDTH = 46;
export const TOGGLE_TRACK_HEIGHT = 28;
export const TOGGLE_THUMB_SIZE = 24;
export const TOGGLE_THUMB_INSET = 2;
export const TOGGLE_THUMB_TRAVEL = TOGGLE_TRACK_WIDTH - TOGGLE_THUMB_SIZE - TOGGLE_THUMB_INSET * 2;

const createStyles = (theme: MobileTheme) => ({
  track: {
    borderRadius: 14,
    height: TOGGLE_TRACK_HEIGHT,
    justifyContent: "center" as const,
    width: TOGGLE_TRACK_WIDTH,
  },
  trackOff: { backgroundColor: theme.control.trackOff },
  trackOn: { backgroundColor: theme.control.trackOn },
  trackOnSuccess: { backgroundColor: theme.voiceRoom.success },
  trackDisabledOff: { backgroundColor: theme.control.trackDisabled },
  trackDisabledOn: { backgroundColor: theme.control.trackDisabledOn },
  thumb: {
    backgroundColor: theme.control.trackThumb,
    borderRadius: 12,
    height: TOGGLE_THUMB_SIZE,
    position: "absolute" as const,
    width: TOGGLE_THUMB_SIZE,
    ...theme.elevation.toggleThumb,
  },
  /** Unavailable: flat, lower-contrast, and never faded (see `control` tokens). */
  thumbDisabled: {
    backgroundColor: theme.control.trackThumbDisabled,
    elevation: 0,
    shadowOpacity: 0,
  },
  thumbOff: { left: TOGGLE_THUMB_INSET },
  thumbOn: { left: TOGGLE_THUMB_INSET + TOGGLE_THUMB_TRAVEL },
});

export function Toggle({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  readOnly = false,
  surface = "app",
  testID,
  thumbTestID,
  tone = "accent",
  value,
}: ToggleProps) {
  const appStyles = useThemedStyles(createStyles);
  const voiceRoomStyles = useVoiceRoomThemedStyles(createStyles);
  const styles = surface === "voiceRoom" ? voiceRoomStyles : appStyles;
  const { selection } = useMobileHaptics();
  const trackOn = tone === "success" ? styles.trackOnSuccess : styles.trackOn;
  const track = disabled
    ? value
      ? styles.trackDisabledOn
      : styles.trackDisabledOff
    : value
      ? trackOn
      : styles.trackOff;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: disabled || readOnly }}
      disabled={disabled || readOnly}
      hitSlop={{ bottom: 9, left: 8, right: 8, top: 9 }}
      onPress={() => {
        selection();
        onValueChange(!value);
      }}
      style={[styles.track, track]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={[
          styles.thumb,
          value ? styles.thumbOn : styles.thumbOff,
          disabled && styles.thumbDisabled,
        ]}
        {...(thumbTestID === undefined ? {} : { testID: thumbTestID })}
      />
    </Pressable>
  );
}
