import Svg, { Rect } from "react-native-svg";

import { useTheme } from "../../providers/mobile-theme-provider";

interface AuthWelcomeBrandMarkProps {
  readonly testID?: string;
}

/** Exact `#2a` handoff waveform geometry; this is the Whispr brand mark, not the app-icon asset. */
const CANONICAL_WAVEFORM_BARS = [
  { height: 6, rx: 1.3, width: 2.6, x: 4, y: 9 },
  { height: 12, rx: 1.3, width: 2.6, x: 8.2, y: 6 },
  { height: 17, rx: 1.3, width: 2.6, x: 12.4, y: 3.5 },
  { height: 8, rx: 1.3, width: 2.6, x: 16.6, y: 8 },
] as const;

export function AuthWelcomeBrandMark({ testID }: AuthWelcomeBrandMarkProps) {
  const theme = useTheme();
  const size = theme.layout.auth.welcomeBrandAsset;

  return (
    <Svg
      accessible={false}
      accessibilityElementsHidden
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...(testID === undefined ? {} : { testID })}
    >
      {CANONICAL_WAVEFORM_BARS.map((bar, index) => (
        <Rect
          fill={theme.text.onPrimary}
          key={`${bar.x}-${bar.y}`}
          {...bar}
          {...(testID === undefined ? {} : { testID: `${testID}-bar-${index + 1}` })}
        />
      ))}
    </Svg>
  );
}
