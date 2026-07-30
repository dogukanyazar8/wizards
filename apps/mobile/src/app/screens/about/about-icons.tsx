import type { ReactNode } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * The stroke icons the "Hakkında" handoff draws inline, carried over path for
 * path from `Whispr Hakkında Ekranı.dc.html`.
 *
 * Ionicons is deliberately not used here: the handoff's glyphs are a 24×24
 * set at 1.9–2.2 stroke with round caps, and the nearest Ionicons shapes are
 * heavier and differently proportioned — mixing them puts two icon languages on
 * one screen. Every icon takes `size` and `color` so the caller supplies the
 * theme token; nothing in this file names a colour.
 */
export interface AboutIconProps {
  readonly color: string;
  readonly size: number;
  readonly testID?: string;
}

interface AboutStrokeIconProps extends AboutIconProps {
  readonly strokeWidth?: number;
}

function AboutIconCanvas({
  children,
  size,
  testID,
}: {
  readonly children: ReactNode;
  readonly size: number;
  // `exactOptionalPropertyTypes` is on and every icon forwards its own optional
  // `testID`, so the absent case has to be part of this type.
  readonly testID?: string | undefined;
}) {
  return (
    <Svg
      accessible={false}
      accessibilityElementsHidden
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </Svg>
  );
}

function strokeProps(color: string, strokeWidth: number) {
  return {
    stroke: color,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth,
  };
}

/** Change type "new" (§3.1) and 2d's benefit row. */
export function AboutSparkIcon({ color, size, strokeWidth = 2.1, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"
        {...strokeProps(color, strokeWidth)}
      />
    </AboutIconCanvas>
  );
}

/** 2a's second NEW item: the live voice-message waveform from HTML line 75. */
export function AboutWaveformIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 4v16M7 8v8M17 8v8M3 11v2M21 11v2" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** Change type "improved" (§3.1). */
export function AboutArrowUpIcon({ color, size, strokeWidth = 2.1, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 19V5.5M12 5.5L6.5 11M12 5.5L17.5 11" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2b's pagination affordance; the handoff uses a down arrow, not a chevron. */
export function AboutArrowDownIcon({
  color,
  size,
  strokeWidth = 2.3,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** Change type "fixed" (§3.1). */
export function AboutWrenchIcon({ color, size, strokeWidth = 2.1, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M14.5 4.5a4.5 4.5 0 0 1 5 6.5L11 19.5l-4 1 1-4 8.5-8.5a4.5 4.5 0 0 1-2-3.5z"
        {...strokeProps(color, strokeWidth)}
      />
    </AboutIconCanvas>
  );
}

/** 2d's safety row and 2f's privacy note. */
export function AboutShieldIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 3.5l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8v-6z" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2d's safety row: the shield and its confirmation tick are one glyph. */
export function AboutShieldCheckIcon({
  color,
  size,
  strokeWidth = 2.1,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 3.5l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8v-6z" {...strokeProps(color, strokeWidth)} />
      <Path d="M9 12l2 2 4-4" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2d's header glyph. */
export function AboutFlaskIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M9 3.5h6" {...strokeProps(color, strokeWidth)} />
      <Path
        d="M10 3.5v5L5.5 17a3.5 3.5 0 0 0 3.2 5h6.6a3.5 3.5 0 0 0 3.2-5L14 8.5v-5"
        {...strokeProps(color, strokeWidth)}
      />
      <Path d="M7.5 14.5h9" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2c's warning card and 2d's risk row. */
export function AboutWarningTriangleIcon({
  color,
  size,
  strokeWidth = 2.1,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 4.5l8.5 15H3.5z" {...strokeProps(color, strokeWidth)} />
      <Path d="M12 10v4" {...strokeProps(color, strokeWidth)} />
      <Path d="M12 16.8v.2" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** The shared 2b/2e search field. */
export function AboutSearchIcon({ color, size, strokeWidth = 2.1, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Circle cx={11} cy={11} r={6.5} {...strokeProps(color, strokeWidth)} />
      <Path d="M16 16l4 4" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2e account-and-security category tile. */
export function AboutPersonIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Circle cx={12} cy={8.5} r={3.5} {...strokeProps(color, strokeWidth)} />
      <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2e chat-and-channels category tile. */
export function AboutChatBubbleIcon({
  color,
  size,
  strokeWidth = 2,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M20 12.5c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L5 20.5l1.2-3.4A6.8 6.8 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7z"
        {...strokeProps(color, strokeWidth)}
      />
    </AboutIconCanvas>
  );
}

/** 2e voice-and-video category tile. */
export function AboutVideoCameraIcon({
  color,
  size,
  strokeWidth = 2,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Rect height={10} rx={2.5} width={12} x={3} y={7} {...strokeProps(color, strokeWidth)} />
      <Path d="M15 11l6-3.5v9L15 13z" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2e server-management category tile. */
export function AboutServerListIcon({
  color,
  size,
  strokeWidth = 2,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Rect height={15} rx={4} width={16} x={4} y={4.5} {...strokeProps(color, strokeWidth)} />
      <Path d="M8 9.5h8M8 14.5h5" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 1c's "Bildir" header action, copied from the handoff's fixed outline glyph. */
export function AboutBellIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5z"
        fill="none"
        {...strokeProps(color, strokeWidth)}
        {...(testID === undefined ? {} : { testID: `${testID}-body` })}
      />
      <Path
        d="M10.5 18.5a1.8 1.8 0 0 0 3 0"
        {...strokeProps(color, strokeWidth)}
        {...(testID === undefined ? {} : { testID: `${testID}-clapper` })}
      />
    </AboutIconCanvas>
  );
}

/**
 * §3.1's diagnostics action. The handoff draws it at two sizes with different
 * geometry — 11px inside the build row, 16px in the header — so both are kept
 * rather than scaling one and losing the stroke ratio.
 */
export function AboutClipboardIcon({
  color,
  size,
  strokeWidth = 1.9,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Rect height={14} rx={2.5} width={12} x={8} y={3} {...strokeProps(color, strokeWidth)} />
      <Path d="M16 20.5H6a2 2 0 0 1-2-2V7" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** The 11px twin of the clipboard, drawn inside the build row. */
export function AboutClipboardSmallIcon({
  color,
  size,
  strokeWidth = 2.2,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Rect height={11} rx={2.5} width={11} x={9} y={9} {...strokeProps(color, strokeWidth)} />
      <Path d="M15 5.5H6A1.5 1.5 0 0 0 4.5 7v9" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2a's and 2g's header action. */
export function AboutShareIcon({ color, size, strokeWidth = 1.9, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M12 16V4.5" {...strokeProps(color, strokeWidth)} />
      <Path d="M8 8l4-3.5L16 8" {...strokeProps(color, strokeWidth)} />
      <Path
        d="M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15"
        {...strokeProps(color, strokeWidth)}
      />
    </AboutIconCanvas>
  );
}

/** 2g's secondary action: copy the invite link. */
export function AboutLinkIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M9 13.5a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 0 0-5.5-5.5L10.5 7.5"
        {...strokeProps(color, strokeWidth)}
      />
      <Path
        d="M15 10.5a4 4 0 0 0-6-.5L6.5 12.5A4 4 0 0 0 12 18l1.5-1.5"
        {...strokeProps(color, strokeWidth)}
      />
    </AboutIconCanvas>
  );
}

/** 2g's text channel rows. */
export function AboutHashIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M6 4l-1 16M14 4l-1 16M4 9.5h16M3.5 15h16" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2g's voice channel rows. */
export function AboutSpeakerIcon({ color, size, strokeWidth = 2, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M11 6L6.5 9.5H4v5h2.5L11 18z" {...strokeProps(color, strokeWidth)} />
      <Path d="M15 9.5a3.5 3.5 0 0 1 0 5" {...strokeProps(color, strokeWidth)} />
      <Path d="M17.5 7a7 7 0 0 1 0 10" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** 2g's verified server badge. */
export function AboutVerifiedIcon({
  color,
  size,
  strokeWidth = 2.2,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M12 3.5l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-1 2.6 1 2.6-2.2 1.6-.9 2.6-2.7-.2L12 20.5l-2.2-1.6-2.7.2-.9-2.6L4 14.9l1-2.6-1-2.6 2.2-1.6.9-2.6 2.7.2z"
        {...strokeProps(color, strokeWidth)}
      />
      <Path d="M9.5 12.2l1.8 1.8 3.5-3.5" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

const STAR_PATH = "M12 2.8l2.8 6.1 6.6.7-4.9 4.5 1.3 6.5L12 17.4 6.2 20.6l1.3-6.5-4.9-4.5 6.6-.7z";

/**
 * 1b's rating preview and 2h's 42px row. Filled and empty are the same outline;
 * §3.13 fills one and strokes the other at 1.6 rather than swapping shapes.
 */
export function AboutStarIcon({
  color,
  filled = true,
  size,
  strokeWidth = 1.6,
  testID,
}: AboutStrokeIconProps & { readonly filled?: boolean }) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      {filled ? (
        <Path
          d={STAR_PATH}
          fill={color}
          {...(testID === undefined ? {} : { testID: `${testID}-path` })}
        />
      ) : (
        <Path
          d={STAR_PATH}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          {...(testID === undefined ? {} : { testID: `${testID}-path` })}
        />
      )}
    </AboutIconCanvas>
  );
}

/** Row affordance; §2 draws it at 14px, 2.2 stroke. */
export function AboutChevronRightIcon({
  color,
  size,
  strokeWidth = 2.2,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M9 5l7 7-7 7" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** Header back affordance; §2 draws it at 17px, 2.1 stroke. */
export function AboutChevronLeftIcon({
  color,
  size,
  strokeWidth = 2.1,
  testID,
}: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M15 5l-7 7 7 7" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** §3.11: 2f closes rather than goes back, because it is a form. */
export function AboutCloseIcon({ color, size, strokeWidth = 2.1, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path d="M6 6l12 12M18 6L6 18" {...strokeProps(color, strokeWidth)} />
    </AboutIconCanvas>
  );
}

/** The update-status box, 2c's effect rows and 2d's consent box. */
export function AboutCheckIcon({ color, size, strokeWidth = 2.4, testID }: AboutStrokeIconProps) {
  return (
    <AboutIconCanvas size={size} testID={testID}>
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        {...strokeProps(color, strokeWidth)}
        {...(testID === undefined ? {} : { testID: `${testID}-path` })}
      />
    </AboutIconCanvas>
  );
}
