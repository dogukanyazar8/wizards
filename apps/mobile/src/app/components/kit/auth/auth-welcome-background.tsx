import { memo } from "react";
import { StyleSheet } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { redesignAuthDark, redesignAuthLight } from "../../../../design/palette";
import { mobileLayoutMetrics } from "../../../../design/tokens";

const { auth } = mobileLayoutMetrics;

type AuthWelcomeBackgroundTone = "dark" | "light";

interface AuthWelcomeBackgroundSpec {
  readonly canvas: {
    readonly height: number;
    readonly width: number;
  };
  readonly dotGrid: {
    readonly color: string;
    readonly opacity: number;
    readonly radius: number;
    readonly spacing: number;
  } | null;
  readonly linearGradient: {
    readonly angle: number;
    readonly stops: readonly {
      readonly color: string;
      readonly offset: number;
    }[];
  };
  readonly radialGradients: readonly [
    {
      readonly center: {
        readonly x: number;
        readonly y: number;
      };
      readonly color: string;
      readonly transparentAt: number;
    },
    {
      readonly center: {
        readonly x: number;
        readonly y: number;
      };
      readonly color: string;
      readonly transparentAt: number;
    },
  ];
}

/** Exact source values from 2a in Whispr Mobile Redesign.dc.html. */
export const AUTH_WELCOME_BACKGROUND_SPEC = {
  canvas: {
    height: auth.welcomeBackgroundReferenceHeight,
    width: auth.welcomeBackgroundReferenceWidth,
  },
  dotGrid: {
    color: redesignAuthLight.backgroundDot,
    opacity: 0.1,
    radius: auth.welcomeBackgroundDotRadius,
    spacing: auth.welcomeBackgroundDotSpacing,
  },
  linearGradient: {
    angle: 165,
    stops: [
      { color: redesignAuthLight.backgroundGradientStart, offset: 0 },
      { color: redesignAuthLight.backgroundGradientMiddle, offset: 0.55 },
      { color: redesignAuthLight.backgroundGradientEnd, offset: 1 },
    ],
  },
  radialGradients: [
    {
      center: { x: 0.15, y: 0.08 },
      color: redesignAuthLight.backgroundGlowLavender,
      transparentAt: 0.45,
    },
    {
      center: { x: 0.9, y: 0.35 },
      color: redesignAuthLight.backgroundGlowBlue,
      transparentAt: 0.42,
    },
  ],
} as const satisfies AuthWelcomeBackgroundSpec;

/** Web-auth dark canvas values with the canonical 2a dot-grid geometry. */
export const AUTH_WELCOME_BACKGROUND_DARK_SPEC = {
  canvas: AUTH_WELCOME_BACKGROUND_SPEC.canvas,
  dotGrid: {
    color: redesignAuthDark.backgroundDot,
    opacity: 0.16,
    radius: auth.welcomeBackgroundDotRadius,
    spacing: auth.welcomeBackgroundDotSpacing,
  },
  linearGradient: {
    angle: 135,
    stops: [
      { color: redesignAuthDark.backgroundGradientStart, offset: 0 },
      { color: redesignAuthDark.backgroundGradientMiddle, offset: 0.48 },
      { color: redesignAuthDark.backgroundGradientEnd, offset: 1 },
    ],
  },
  radialGradients: [
    {
      center: { x: 0.72, y: 0.1 },
      color: redesignAuthDark.backgroundGlowLavender,
      transparentAt: 0.31,
    },
    {
      center: { x: 0.13, y: 0.24 },
      color: redesignAuthDark.backgroundGlowBlue,
      transparentAt: 0.33,
    },
  ],
} as const satisfies AuthWelcomeBackgroundSpec;

const BACKGROUND_SPECS: Readonly<Record<AuthWelcomeBackgroundTone, AuthWelcomeBackgroundSpec>> = {
  dark: AUTH_WELCOME_BACKGROUND_DARK_SPEC,
  light: AUTH_WELCOME_BACKGROUND_SPEC,
};

type RadialGlowPaint = { readonly color: string; readonly opacity: number };

const RADIAL_GLOW_PAINT: Readonly<
  Record<AuthWelcomeBackgroundTone, readonly [RadialGlowPaint, RadialGlowPaint]>
> = {
  dark: [
    { color: redesignAuthDark.backgroundGlowLavender, opacity: 0.28 },
    { color: redesignAuthDark.backgroundGlowBlue, opacity: 0.2 },
  ],
  light: [
    { color: redesignAuthLight.backgroundGlowLavender, opacity: 0.25 },
    { color: redesignAuthLight.backgroundGlowBlue, opacity: 0.18 },
  ],
};

const styles = StyleSheet.create({
  canvas: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});

function farthestCornerRadius(
  canvas: AuthWelcomeBackgroundSpec["canvas"],
  center: { readonly x: number; readonly y: number },
) {
  const x = center.x * canvas.width;
  const y = center.y * canvas.height;

  return Math.hypot(Math.max(x, canvas.width - x), Math.max(y, canvas.height - y));
}

function gradientLine(spec: AuthWelcomeBackgroundSpec) {
  const { height, width } = spec.canvas;
  const direction = (spec.linearGradient.angle * Math.PI) / 180;
  const dx = Math.sin(direction);
  const dy = -Math.cos(direction);
  const span = Math.abs(dx) * (width / 2) + Math.abs(dy) * (height / 2);
  const centerX = width / 2;
  const centerY = height / 2;

  return {
    x1: centerX - dx * span,
    x2: centerX + dx * span,
    y1: centerY - dy * span,
    y2: centerY + dy * span,
  };
}

function AuthWelcomeBackgroundComponent({
  testID,
  tone,
}: {
  readonly testID?: string;
  readonly tone: AuthWelcomeBackgroundTone;
}) {
  const spec = BACKGROUND_SPECS[tone];
  const { height, width } = spec.canvas;
  const [firstGlow, secondGlow] = spec.radialGradients;
  const [firstGlowPaint, secondGlowPaint] = RADIAL_GLOW_PAINT[tone];
  const gradient = gradientLine(spec);
  const testIdProp = testID ? { testID } : {};
  const idPrefix = `mobile-auth-welcome-background-${tone}`;
  const linearGradientId = `${idPrefix}-linear`;
  const firstGlowId = `${idPrefix}-first-glow`;
  const secondGlowId = `${idPrefix}-second-glow`;
  const dotGridId = `${idPrefix}-dot-grid`;

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      preserveAspectRatio="none"
      style={styles.canvas}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      {...testIdProp}
    >
      <Defs>
        <LinearGradient
          gradientUnits="userSpaceOnUse"
          id={linearGradientId}
          x1={gradient.x1}
          x2={gradient.x2}
          y1={gradient.y1}
          y2={gradient.y2}
        >
          {spec.linearGradient.stops.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </LinearGradient>
        <RadialGradient
          cx={firstGlow.center.x * width}
          cy={firstGlow.center.y * height}
          gradientUnits="userSpaceOnUse"
          id={firstGlowId}
          r={farthestCornerRadius(spec.canvas, firstGlow.center)}
        >
          <Stop offset="0" stopColor={firstGlowPaint.color} stopOpacity={firstGlowPaint.opacity} />
          <Stop offset={firstGlow.transparentAt} stopColor={firstGlowPaint.color} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient
          cx={secondGlow.center.x * width}
          cy={secondGlow.center.y * height}
          gradientUnits="userSpaceOnUse"
          id={secondGlowId}
          r={farthestCornerRadius(spec.canvas, secondGlow.center)}
        >
          <Stop
            offset="0"
            stopColor={secondGlowPaint.color}
            stopOpacity={secondGlowPaint.opacity}
          />
          <Stop
            offset={secondGlow.transparentAt}
            stopColor={secondGlowPaint.color}
            stopOpacity="0"
          />
        </RadialGradient>
        {spec.dotGrid ? (
          <Pattern
            height={spec.dotGrid.spacing}
            id={dotGridId}
            patternUnits="userSpaceOnUse"
            width={spec.dotGrid.spacing}
          >
            <Circle
              cx={spec.dotGrid.radius}
              cy={spec.dotGrid.radius}
              fill={spec.dotGrid.color}
              fillOpacity={spec.dotGrid.opacity}
              r={spec.dotGrid.radius}
            />
          </Pattern>
        ) : null}
      </Defs>
      <Rect fill={`url(#${linearGradientId})`} height={height} width={width} x="0" y="0" />
      {spec.dotGrid ? (
        <Rect fill={`url(#${dotGridId})`} height={height} width={width} x="0" y="0" />
      ) : null}
      <Rect fill={`url(#${secondGlowId})`} height={height} width={width} x="0" y="0" />
      <Rect fill={`url(#${firstGlowId})`} height={height} width={width} x="0" y="0" />
    </Svg>
  );
}

/**
 * Memoized so this full-screen gradient + dot-pattern SVG is not re-rendered
 * every time the host auth screen re-renders for unrelated reasons — typing in
 * the login/register form, validation messages, or focus changes. `tone` and
 * `testID` are stable for the lifetime of a screen, so the (relatively costly)
 * SVG rasterization happens once per mount instead of on every keystroke, while
 * still re-rendering correctly when the theme toggles `tone` from light to dark.
 */
export const AuthWelcomeBackground = memo(AuthWelcomeBackgroundComponent);
