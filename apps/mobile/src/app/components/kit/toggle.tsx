import { Pressable, View } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export interface ToggleProps {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly onValueChange: (next: boolean) => void;
  readonly testID?: string;
  readonly value: boolean;
}

// Handoff geometry (#5a / #5h): 46×27 track, 21px thumb, 3px inset → 19px travel.
const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 27;
const THUMB_SIZE = 21;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

const createStyles = (theme: MobileTheme) => ({
  track: {
    borderRadius: 14,
    height: TRACK_HEIGHT,
    width: TRACK_WIDTH,
  },
  trackOff: { backgroundColor: theme.control.trackOff },
  trackOn: { backgroundColor: theme.accent.default },
  disabled: { opacity: 0.5 },
  thumb: {
    backgroundColor: theme.control.trackThumb,
    borderRadius: theme.radii.pill,
    elevation: 2,
    height: THUMB_SIZE,
    position: "absolute" as const,
    shadowColor: theme.surface.inverse,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    top: THUMB_INSET,
    width: THUMB_SIZE,
  },
  thumbOff: { left: THUMB_INSET },
  thumbOn: { left: THUMB_INSET + THUMB_TRAVEL },
});

export function Toggle({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  testID,
  value,
}: ToggleProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={{ bottom: 9, left: 8, right: 8, top: 9 }}
      onPress={() => onValueChange(!value)}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, disabled && styles.disabled]}
      testID={testID}
    >
      <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
    </Pressable>
  );
}
